import express from 'express';
import cors from 'cors';
import { HealthResponse } from '@sbloom/contracts';
import { requireInternalAuth } from './auth';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  const response: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
  res.json(response);
});

app.get('/internal/whoami', requireInternalAuth, (req, res) => {
  res.json({ id: req.user?.id });
});

export default app;
