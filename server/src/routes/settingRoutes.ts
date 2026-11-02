import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { authenticate } from '../middleware/auth';
import { getSettings, updateSettings } from '../controllers/settingController';
import { updateReceiptSettings, getReceiptSettings, uploadReceiptLogo, deleteReceiptLogo } from '../controllers/receiptController';
import { getMailSettings, updateMailSettings } from '../controllers/mailSettingController';
import prefixRouter from '../controllers/PrefixController';

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `receipt-logo-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ storage });

router.get('/mail', getMailSettings);
router.post('/mail', updateMailSettings);

router.get('/receipt', getReceiptSettings);
router.post('/receipt', updateReceiptSettings);
router.get('/receipt-config', authenticate, getReceiptSettings);
router.put('/receipt-config', authenticate, updateReceiptSettings);
router.post('/receipt-logo', authenticate, upload.single('logo'), uploadReceiptLogo);
router.delete('/receipt-logo', authenticate, deleteReceiptLogo);

router.use('/', prefixRouter); 

router.get('/system', getSettings);
router.put('/system', updateSettings);

export default router;