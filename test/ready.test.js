jest.useFakeTimers();

const request = require('supertest');
const { createApp } = require('../src/app');

const app = createApp();

describe('readiness warm-up', () => {
  test('GET /ready returns 503 while still warming up', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('starting');
  });

  test('GET /ready returns 200 once the warm-up timer has fired', async () => {
    jest.advanceTimersByTime(2000);
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });
});
