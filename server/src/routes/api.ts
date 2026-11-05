import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import deleteRoutes from './deleteRoutes';
import getRoutes from './getRoutes';
import postRoutes from './postRoutes';
import putRoutes from './putRoutes';
import settingRoutes from './settingRoutes';
import specialOfferRoutes from './specialOfferRoutes';
import userRoutes from './userRoutes';
import { publicApiBoundary } from '../middleware/publicApiBoundary';
import { postPublicDemo, exitPublicDemo } from '../controllers/publicDemoController';
import { hostedMediaResponses, preserveStoredMedia } from '../middleware/hostedMedia';
import { hostedPortfolio, HOSTED_FILE_MESSAGE } from '../config/hostedPortfolio';

/** Shared by production startup and isolated mounted-route security tests. */
export function createApiRouter() {
  const router = express.Router();
  router.use(hostedMediaResponses);
  router.use(publicApiBoundary);
  router.use((req, res, next) => {
    const path = req.path.replace(/\/$/, '');
    const diskAction = (req.method === 'POST' && ['/upload', '/settings/receipt-logo', '/customers/import'].includes(path)) || (req.method === 'DELETE' && path === '/settings/receipt-logo');
    if (hostedPortfolio() && diskAction) return res.status(503).json({ status: 'error', code: 'hosted_file_actions_disabled', message: HOSTED_FILE_MESSAGE });
    preserveStoredMedia(req);
    next();
  });
  router.post('/auth/demo', postPublicDemo);
  router.post('/auth/demo/exit', exitPublicDemo);
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      const folder = path.join(__dirname, '../../uploads');
      if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
      cb(null, folder);
    },
    filename: (_req, file, cb) => cb(null, `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`)
  });
  router.post('/upload', multer({ storage }).single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    return res.json({ success: true, url: `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}` });
  });
  router.use('/settings', settingRoutes);
  router.use('/special-offers', specialOfferRoutes);
  router.use('/users', userRoutes);
  router.use(getRoutes, postRoutes, putRoutes, deleteRoutes);
  return router;
}
