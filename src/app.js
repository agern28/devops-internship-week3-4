const express = require('express');

const VERSION = process.env.APP_VERSION || '1.0.0';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Simple in-memory state for demo purposes.
let requestCount = 0;
let ready = false;

// Simulate a short warm-up so readiness differs from liveness.
const warmupTimer = setTimeout(() => {
  ready = true;
}, 2000);

// Do not let the warm-up timer keep the process (or a test run) alive.
warmupTimer.unref();

function createApp() {
  const app = express();

  app.get('/', (req, res) => {
    requestCount += 1;
    res.json({
      message: 'Hello from the DevOps training app!',
      version: VERSION,
      logLevel: LOG_LEVEL,
    });
  });

  // Liveness: process is up and can serve.
  app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Readiness: app finished warm-up and can accept traffic.
  app.get('/ready', (req, res) => {
    if (ready) {
      return res.status(200).json({ status: 'ready' });
    }
    return res.status(503).json({ status: 'starting' });
  });

  app.get('/metrics', (req, res) => {
    res.type('text/plain').send(
      `app_requests_total ${requestCount}\n` +
      `app_uptime_seconds ${Math.floor(process.uptime())}\n`
    );
  });

  return app;
}

module.exports = { createApp, VERSION };
