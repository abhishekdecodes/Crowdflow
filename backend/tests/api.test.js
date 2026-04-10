const request = require('supertest');
const app = require('../src/server');

describe('CrowdFlow Backend API', () => {

  describe('GET /health', () => {
    it('should return 200 with status OK', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('OK');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('POST /api/translate', () => {
    it('should return 400 if text is missing', async () => {
      const res = await request(app)
        .post('/api/translate')
        .send({ targetLanguage: 'hi' });
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 if targetLanguage is missing', async () => {
      const res = await request(app)
        .post('/api/translate')
        .send({ text: 'Hello crowd' });
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/chat', () => {
    it('should return 400 if message is empty', async () => {
      const res = await request(app)
        .post('/api/chat')
        .send({ message: '' });
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 if message exceeds 500 chars', async () => {
      const res = await request(app)
        .post('/api/chat')
        .send({ message: 'a'.repeat(501) });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/incident/report', () => {
    it('should return 400 if description is missing', async () => {
      const res = await request(app)
        .post('/api/incident/report')
        .send({ base64Image: 'fakebase64' });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 if base64Image is missing', async () => {
      const res = await request(app)
        .post('/api/incident/report')
        .send({ description: 'Broken turnstile' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/predict', () => {
    it('should return 400 if currentData is missing', async () => {
      const res = await request(app)
        .post('/api/predict')
        .send({});
      expect(res.statusCode).toBe(400);
    });
  });

});
