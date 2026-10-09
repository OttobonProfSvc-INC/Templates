import express from 'express';
import cors from 'cors';
import { HealthResponse } from '@sbloom/contracts';

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  const response: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
  res.json(response);
});

app.listen(port, () => {
  console.log(`Backend API listening at http://localhost:${port}`);
});
