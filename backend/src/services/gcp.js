const { VertexAI } = require('@google-cloud/vertexai');
const { PubSub } = require('@google-cloud/pubsub');
const { BigQuery } = require('@google-cloud/bigquery');
const { Firestore } = require('@google-cloud/firestore');
const { Logging } = require('@google-cloud/logging');
const vision = require('@google-cloud/vision');
const { Translate } = require('@google-cloud/translate').v2;
const { Storage } = require('@google-cloud/storage');
const crypto = require('crypto');

const project = process.env.GOOGLE_CLOUD_PROJECT || 'crowdflow-ai';

const firestore = new Firestore({ projectId: project });
const pubsub = new PubSub({ projectId: project });
const bigquery = new BigQuery({ projectId: project });
const logging = new Logging({ projectId: project });
const log = logging.log('crowdflow-ops');

const visionClient = new vision.ImageAnnotatorClient({ projectId: project });
const translate = new Translate({ projectId: project });
const storage = new Storage({ projectId: project });
const INCIDENT_BUCKET_NAME = process.env.INCIDENT_BUCKET_NAME || 'crowdflow-incidents'; // Configured via environment

const location = 'us-central1';
const vertexAi = new VertexAI({ project, location });
const generativeModel = vertexAi.preview.getGenerativeModel({
    model: 'gemini-1.5-pro-preview-0409',
    generation_config: { max_output_tokens: 256, temperature: 0.2 },
});

const chatModel = vertexAi.preview.getGenerativeModel({
    model: 'gemini-1.5-pro-preview-0409',
    generation_config: { max_output_tokens: 256, temperature: 0.7 }
});

async function predictCrowdSurge(currentData) {
    const prompt = `Given current stadium congestion: ${JSON.stringify(currentData)}, predict any queue bottlenecks in the next 15 minutes.`;
    const req = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
    try {
        const response = await generativeModel.generateContent(req);
        const prediction = response.response.candidates[0].content.parts[0].text;
        
        const metadata = { resource: { type: 'global' }, severity: 'INFO' };
        const entry = log.entry(metadata, { event: 'VertexAI_Prediction', result: prediction });
        await log.write(entry);
        
        return prediction;
    } catch (err) { return "Prediction unavailable"; }
}

async function askGemini(question) {
    const prompt = `You are an AI assistant for a smart stadium named CrowdFlow AI. Keep your answers brief and helpful for stadium attendees. User asks: ${question}`;
    const req = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
    try {
        const response = await chatModel.generateContent(req);
        return response.response.candidates[0].content.parts[0].text;
    } catch (err) { return "I'm experiencing interference."; }
}

function listenToSensors() {
    const subscription = pubsub.subscription('crowd-telemetry-sub');
    subscription.on('message', async (message) => {
        const data = JSON.parse(message.data.toString());
        await firestore.collection('locations').doc(data.gateId).set({
            congestion: data.congestionLevel,
            timestamp: Firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        message.ack();
    });
}

async function exportToBigQuery(datasetId, tableId, rowData) {
    await bigquery.dataset(datasetId).table(tableId).insert([rowData]);
}

async function countPeopleInImage(base64Image) {
    try {
        const request = { image: { content: base64Image }, features: [{ type: 'OBJECT_LOCALIZATION' }] };
        const [result] = await visionClient.annotateImage(request);
        const objects = result.localizedObjectAnnotations;
        return objects.filter(obj => obj.name === 'Person').length;
    } catch(err) { return 0; }
}

async function translateText(text, targetLang) {
    try {
        let [translations] = await translate.translate(text, targetLang);
        translations = Array.isArray(translations) ? translations : [translations];
        return translations[0];
    } catch(err) { return text; }
}

/**
 * Uploads a base64 incident image to Google Cloud Storage
 * and logs the public URL to Firestore along with the Vision API label.
 */
async function uploadIncidentToStorage(base64Image, description, label = 'UNKNOWN') {
    try {
        const bucket = storage.bucket(INCIDENT_BUCKET_NAME);
        const fileName = `incident_${crypto.randomUUID()}.jpg`;
        const file = bucket.file(fileName);
        
        const buffer = Buffer.from(base64Image, 'base64');
        await file.save(buffer, {
            metadata: { contentType: 'image/jpeg' },
            resumable: false
        });
        
        // Construct the public URL assuming the bucket is public, or using signed URLs. 
        // We will just return the standard public URL structure.
        const publicUrl = `https://storage.googleapis.com/${INCIDENT_BUCKET_NAME}/${fileName}`;
        
        // Log to Firestore Incidents stream
        await firestore.collection('incidents').add({
            imageUrl: publicUrl,
            description: description,
            status: label,
            timestamp: Firestore.FieldValue.serverTimestamp()
        });

        return publicUrl;
    } catch (error) {
        console.error("Storage Upload Error:", error);
        throw error;
    }
}

module.exports = {
    predictCrowdSurge,
    listenToSensors,
    exportToBigQuery,
    countPeopleInImage,
    translateText,
    askGemini,
    uploadIncidentToStorage,
    firestore
};
