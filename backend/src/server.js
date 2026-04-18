const express = require('express');
const cors = require('cors');
const redis = require('redis');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const { predictCrowdSurge, translateText, countPeopleInImage, askGemini, listenToSensors, uploadIncidentToStorage } = require('./services/gcp');

const app = express();

// ── Security Headers ──────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https:"]
        }
    }
}));

// ── Secure CORS ───────────────────────────────────────────────
app.use(cors({
    origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: '10mb' }));

// ── Rate Limiting ─────────────────────────────────────────────
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60,             // max 60 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests. Please slow down.' }
});

const heavyLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10, // Vertex AI / Vision / Storage — max 10 heavy calls/min
    message: { success: false, error: 'AI service rate limit reached. Try again shortly.' }
});

app.use('/api/', apiLimiter);
app.use('/api/predict', heavyLimiter);
app.use('/api/chat', heavyLimiter);
app.use('/api/vision/count', heavyLimiter);

// ── Redis Client ──────────────────────────────────────────────
let redisClient;
(async () => {
    redisClient = redis.createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
    redisClient.on('error', () => {});
    try { await redisClient.connect(); } catch (e) {}
})();

// ── Root Status ───────────────────────────────────────────────
app.get('/', (req, res) => res.status(200).json({ 
    success: true, 
    message: '🚀 CrowdFlow AI Backend is active', 
    endpoints: ['/health', '/api/predict', '/api/chat', '/api/vision/count'] 
}));

// ── Health Check ──────────────────────────────────────────────
app.get('/health', (req, res) => res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() }));

// ── Vertex AI Predict (Redis Cached) ─────────────────────────
app.post('/api/predict',
    body('currentData').notEmpty().withMessage('currentData is required'),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

        try {
            const { currentData } = req.body;
            const cacheKey = `prediction:${JSON.stringify(currentData)}`;
            if (redisClient?.isReady) {
                const cached = await redisClient.get(cacheKey);
                if (cached) return res.status(200).json({ success: true, prediction: cached, source: 'cache' });
            }
            const prediction = await predictCrowdSurge(currentData);
            if (redisClient?.isReady) await redisClient.setEx(cacheKey, 60, prediction);
            res.status(200).json({ success: true, prediction, source: 'vertex-ai' });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Prediction Failed' });
        }
    }
);

// ── Translation ───────────────────────────────────────────────
app.post('/api/translate',
    body('text').isString().trim().notEmpty(),
    body('targetLanguage').isString().isLength({ min: 2, max: 5 }),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
        try {
            const { text, targetLanguage } = req.body;
            const translated = await translateText(text, targetLanguage);
            res.status(200).json({ success: true, translated });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Translation Failed' });
        }
    }
);

// ── Cloud Vision ──────────────────────────────────────────────
app.post('/api/vision/count',
    body('base64Image').isString().notEmpty(),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
        try {
            const count = await countPeopleInImage(req.body.base64Image);
            res.status(200).json({ success: true, personCount: count });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Vision API Failed' });
        }
    }
);

// ── Gemini Chat ───────────────────────────────────────────────
app.post('/api/chat',
    body('message').isString().trim().notEmpty().isLength({ max: 500 }),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
        try {
            const reply = await askGemini(req.body.message);
            res.status(200).json({ success: true, reply });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Chat Failed' });
        }
    }
);

// ── Cloud Storage Incident Upload ─────────────────────────────
app.post('/api/incident/report',
    body('description').isString().trim().notEmpty().isLength({ max: 300 }),
    body('base64Image').isString().notEmpty(),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
        try {
            const { base64Image, description, label } = req.body;
            const publicUrl = await uploadIncidentToStorage(base64Image, description, label || 'UNKNOWN');
            res.status(200).json({ success: true, url: publicUrl });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Storage Upload Failed' });
        }
    }
);

// ── Pub/Sub Listener ──────────────────────────────────────────
try {
    listenToSensors();
    console.log('✅ Pub/Sub sensor listener active');
} catch(e) {
    console.log('⚠️ Pub/Sub listener unavailable');
}

const PORT = process.env.PORT || 8080;
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => console.log(`✅ CrowdFlow backend running on port ${PORT}`));
}
module.exports = app; // Export for testing

