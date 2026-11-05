import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { createApiRouter } from './routes/api';
import { hostedPortfolio } from './config/hostedPortfolio';

export function createHttpApp(connect?: () => Promise<void>) {
  const app = express();
  const origins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map(origin => origin.trim()).filter(Boolean);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: origins, credentials: true }));
  app.use(morgan('combined'));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  if (connect) app.use(async (_req, res, next) => {
    try { await connect(); next(); }
    catch { res.status(503).json({ status: 'error', message: 'The service is temporarily unavailable.' }); }
  });
  app.use('/api', createApiRouter());
  if (!hostedPortfolio()) app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
  app.use('*', (_req, res) => { res.status(404).json({ status: 'error', message: 'Route not found' }); });
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Request failed.', { type: err instanceof Error ? err.name : 'UnknownError' });
    res.status(500).json({ status: 'error', message: 'Something went wrong!' });
  });
  return app;
}
