import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import ReceiptSetting from '../models/ReceiptSetting';

export const getReceiptSettings = async (req: Request, res: Response) => {
  try {
    let settings = await ReceiptSetting.findOne();
    if (!settings) {
      settings = await ReceiptSetting.create({});
    }
    return res.status(200).json({ status: 'success', data: settings });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: "Error fetching receipt settings" });
  }
}

export const updateReceiptSettings = async (req: Request, res: Response) => {
  try {
    // Validation
    const userPayload = req.body;
    if (userPayload.showNote && !userPayload.note) {
      return res.status(400).json({ message: "Note text is required" });
    }

    const settings = await ReceiptSetting.findOneAndUpdate(
      {}, 
      { $set: userPayload }, // Explicitly set user-provided fields
      { upsert: true, new: true, runValidators: true }
    );

    return res.json({ success: true, data: settings });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Error updating settings" });
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

    return res.json({ status: 'success', logoUrl, data: settings });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message || 'Error uploading receipt logo' });
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

    return res.json({ status: 'success', data: settings });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message || 'Error deleting receipt logo' });
  }
};