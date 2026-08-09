const request = require('supertest');
const { createApp } = require('../src/app');

const app = createApp();

describe('DevOps training app', () => {
  test('GET / returns a greeting and version', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('version');
  });

  test('GET /healthz is always ok (liveness)', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('GET /metrics exposes a counter', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('app_requests_total');
  });
});
