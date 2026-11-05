import dotenv from 'dotenv';
import express from 'express';
import connectDB from './config/database';
import { createHttpApp } from './httpApp';

dotenv.config();
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required.');
if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') {
  if (!process.env.MONGODB_URI || !process.env.FRONTEND_URL) throw new Error('MONGODB_URI and FRONTEND_URL are required for deployment.');
  if (process.env.JWT_SECRET.length < 32) throw new Error('Deployment requires a JWT secret of at least 32 characters.');
  if (process.env.DEMO_SESSION_STORE !== 'mongodb') throw new Error('Deployment requires DEMO_SESSION_STORE=mongodb.');
  for (const origin of process.env.FRONTEND_URL.split(',').map(value => value.trim())) {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin) throw new Error('Hosted frontend origins must be exact HTTPS origins.');
  }
}
// Vercel detects Express at its entrypoint; keep the existing HTTP factory mounted.
const app = express();
app.disable('x-powered-by');
app.use(createHttpApp(process.env.VERCEL === '1' ? connectDB : undefined));
export default app;

// Vercel imports the handler. Only the normal local/long-lived entry opens a port.
if (require.main === module && process.env.VERCEL !== '1') {
  connectDB().then(() => {
    app.listen(process.env.PORT || 5000, () => console.log('ServeSmart backend is listening.'));
  }).catch(() => { console.error('Database connection failed; connection details withheld.'); process.exitCode = 1; });
}
