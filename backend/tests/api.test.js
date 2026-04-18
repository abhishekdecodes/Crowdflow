const request = require('supertest');
const app = require('../src/server');

jest.mock('../src/services/gcp', () => ({
    predictCrowdSurge: jest.fn().mockResolvedValue('Mock Prediction'),
    translateText: jest.fn().mockResolvedValue('Mock Translated'),
    countPeopleInImage: jest.fn().mockResolvedValue(5),
    askGemini: jest.fn().mockResolvedValue('Mock Answer'),
    listenToSensors: jest.fn(),
    uploadIncidentToStorage: jest.fn().mockResolvedValue('http://mock/image.jpg')
}));

// Mock redis completely
jest.mock('redis', () => ({
    createClient: () => ({
        on: jest.fn(),
        connect: jest.fn().mockResolvedValue(),
        isReady: true,
        get: jest.fn().mockResolvedValue(null),
        setEx: jest.fn().mockResolvedValue()
    })
}));

describe('CrowdFlow Backend API', () => {

  describe('GET /', () => {
    it('should return API status', async () => {
      const res = await request(app).get('/');
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /health', () => {
    it('should return 200 with status OK', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toBe(200);
    });
  });

  describe('POST /api/translate', () => {
    it('should return 400 if text is missing', async () => {
      const res = await request(app).post('/api/translate').send({ targetLanguage: 'hi' });
      expect(res.statusCode).toBe(400);
    });

    it('should return 200 with successful translation', async () => {
      const res = await request(app).post('/api/translate').send({ text: 'Hello', targetLanguage: 'es' });
      expect(res.statusCode).toBe(200);
      expect(res.body.translated).toBe('Mock Translated');
    });
  });

  describe('POST /api/chat', () => {
    it('should return 400 if message is empty', async () => {
      const res = await request(app).post('/api/chat').send({ message: '' });
      expect(res.statusCode).toBe(400);
    });

    it('should return 200 with chat response', async () => {
      const res = await request(app).post('/api/chat').send({ message: 'Where is food?' });
      expect(res.statusCode).toBe(200);
      expect(res.body.reply).toBe('Mock Answer');
    });
  });

  describe('POST /api/incident/report', () => {
    it('should return 400 if description is missing', async () => {
      const res = await request(app).post('/api/incident/report').send({ base64Image: 'fakebase64' });
      expect(res.statusCode).toBe(400);
    });

    it('should return 200 directly mapping url', async () => {
      const res = await request(app).post('/api/incident/report').send({ base64Image: 'bWV0YQ==', description: 'Crowd' });
      expect(res.statusCode).toBe(200);
      expect(res.body.url).toBe('http://mock/image.jpg');
    });
  });

  describe('POST /api/predict', () => {
    it('should return 400 if currentData is missing', async () => {
      const res = await request(app).post('/api/predict').send({});
      expect(res.statusCode).toBe(400);
    });

    it('should return 200 with prediction string', async () => {
      const res = await request(app).post('/api/predict').send({ currentData: { gate: 1 } });
      expect(res.statusCode).toBe(200);
      expect(res.body.prediction).toBe('Mock Prediction');
    });
  });

  describe('POST /api/vision/count', () => {
    it('should return 200 with personCount', async () => {
      const res = await request(app).post('/api/vision/count').send({ base64Image: 'bWV0YQ==' });
      expect(res.statusCode).toBe(200);
      expect(res.body.personCount).toBe(5);
    });
  });

});
