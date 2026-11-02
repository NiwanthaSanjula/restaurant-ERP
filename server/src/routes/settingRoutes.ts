import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
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

router.get('/mail', authenticate, requirePermission('manageSettings', 'view_mail_settings'), getMailSettings);
router.post('/mail', authenticate, requirePermission('manageSettings', 'edit_notification_settings'), updateMailSettings);

router.get('/receipt', authenticate, requirePermission('manageSettings', 'view_settings'), getReceiptSettings);
router.post('/receipt', authenticate, requirePermission('manageSettings', 'edit_restaurant_settings'), updateReceiptSettings);
router.get('/receipt-config', authenticate, requirePermission('manageSettings', 'view_settings'), getReceiptSettings);
router.put('/receipt-config', authenticate, requirePermission('manageSettings', 'edit_restaurant_settings'), updateReceiptSettings);
router.post('/receipt-logo', authenticate, requirePermission('manageSettings', 'edit_restaurant_settings'), upload.single('logo'), uploadReceiptLogo);
router.delete('/receipt-logo', authenticate, requirePermission('manageSettings', 'edit_restaurant_settings'), deleteReceiptLogo);

router.use('/', prefixRouter); 

router.get('/system', authenticate, getSettings);
router.put('/system', authenticate, requirePermission('manageSettings', 'edit_restaurant_settings'), updateSettings);

export default router;
