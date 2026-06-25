process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/location_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.FRIENDS_SERVICE_URL = process.env.FRIENDS_SERVICE_URL || 'http://friends:3001';
process.env.USERS_SERVICE_URL = process.env.USERS_SERVICE_URL || 'http://users:3000';
process.env.MIN_UPDATE_INTERVAL_SECONDS = process.env.MIN_UPDATE_INTERVAL_SECONDS || '60';

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../../src/app');

describe('location HTTP integration', () => {
  test('GET /health returns ok', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  test('protected location endpoint requires bearer token', async () => {
    const response = await request(app).get('/api/locations/privacy');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Token de autenticación requerido' });
  });

  test('protected location endpoint rejects malformed auth headers', async () => {
    const response = await request(app)
      .get('/api/locations/privacy')
      .set('authorization', 'Token invalid-format');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Token de autenticación requerido' });
  });

  test('protected location endpoint rejects invalid tokens', async () => {
    const response = await request(app)
      .get('/api/locations/privacy')
      .set('authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Token inválido o expirado' });
  });

  test('admin tokens are rejected by location endpoints', async () => {
    const token = jwt.sign({ sub: 'admin-1', role: 'admin' }, process.env.JWT_SECRET);

    const response = await request(app)
      .get('/api/locations/privacy')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Acceso denegado' });
  });
});
