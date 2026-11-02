import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import ReceiptSetting from '../models/ReceiptSetting';
import { pickSettingsFields, RECEIPT_FIELDS } from '../utils/settingsFields';

export const getReceiptSettings = async (req: Request, res: Response) => {
  try {
    const settings = await ReceiptSetting.findOne();
    return res.status(200).json({ status: 'success', data: pickSettingsFields(settings || { logoUrl: '' }, RECEIPT_FIELDS) });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: "Error fetching receipt settings" });
  }
}

export const updateReceiptSettings = async (req: Request, res: Response) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) ||
      Object.keys(req.body).some((field) => !(RECEIPT_FIELDS as readonly string[]).includes(field))) {
      return res.status(400).json({ message: 'Unsupported receipt settings fields.' });
    }
    for (const [field, value] of Object.entries(req.body)) {
      if (value === undefined) continue;
      const expected = field === 'note' || field === 'logoUrl' ? 'string' : 'boolean';
      if (typeof value !== expected) {
        return res.status(400).json({ message: 'Invalid receipt settings field type.' });
      }
    }
    const userPayload = pickSettingsFields(req.body, RECEIPT_FIELDS);
    if (!Object.keys(userPayload).length) {
      return res.status(400).json({ message: 'No supported receipt settings provided.' });
    }
    if ('showNote' in userPayload || 'note' in userPayload) {
      const existing = await ReceiptSetting.findOne();
      const showNote = userPayload.showNote ?? existing?.showNote;
      const note = userPayload.note ?? existing?.note;
      if (showNote && (typeof note !== 'string' || !note.trim())) {
        return res.status(400).json({ message: 'Note text is required' });
      }
    }

    const settings = await ReceiptSetting.findOneAndUpdate(
      {}, 
      { $set: userPayload }, // Explicitly set user-provided fields
      { upsert: true, new: true, runValidators: true }
    );

    return res.json({ success: true, data: pickSettingsFields(settings, RECEIPT_FIELDS) });
  } catch (err: any) {
    return res.status(500).json({ message: 'Error updating receipt settings' });
  }
};

export const uploadReceiptLogo = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No logo file uploaded' });
    }

    const logoUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    const settings = await ReceiptSetting.findOneAndUpdate(
      {},
      { $set: { logoUrl } },
      { upsert: true, new: true, runValidators: true }
    );

    return res.json({ status: 'success', logoUrl, data: pickSettingsFields(settings, RECEIPT_FIELDS) });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: 'Error uploading receipt logo' });
  }
};

export const deleteReceiptLogo = async (req: Request, res: Response) => {
  try {
    const existing = await ReceiptSetting.findOne();
    if (existing?.logoUrl) {
      const uploadSegment = '/uploads/';
      const index = existing.logoUrl.indexOf(uploadSegment);
      if (index !== -1) {
        const filename = existing.logoUrl.substring(index + uploadSegment.length);
        const filePath = path.join(__dirname, '../uploads', filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }

    const settings = await ReceiptSetting.findOneAndUpdate(
      {},
      { $set: { logoUrl: '' } },
      { upsert: true, new: true, runValidators: true }
    );

    return res.json({ status: 'success', data: pickSettingsFields(settings, RECEIPT_FIELDS) });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: 'Error deleting receipt logo' });
  }
};
