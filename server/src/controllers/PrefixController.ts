import express from 'express';
import { Request, Response } from 'express';
import { PREFIX_FIELDS, PREFIX_MAX_LENGTH, PrefixField } from '../constants/prefix';
import PrefixSetting from '../models/PrefixSetting';

const router = express.Router();

export const buildPrefixSettingsUpdate = (body: Record<string, unknown>) => {
  const updates: Partial<Record<PrefixField, string>> = {};

  for (const field of PREFIX_FIELDS) {
    const rawValue = body[field];

    if (rawValue === undefined || rawValue === null) {
      continue;
    }

    if (typeof rawValue !== 'string') {
      throw new Error(`${field} must be text`);
    }

    const value = rawValue.trim();
    if (!value) {
      throw new Error(`${field} is required`);
    }

    if (value.length > PREFIX_MAX_LENGTH) {
      throw new Error(`Prefixes cannot exceed ${PREFIX_MAX_LENGTH} characters`);
    }

    updates[field] = value;
  }

  if (Object.keys(updates).length === 0) {
    throw new Error('At least one prefix field is required');
  }

  return updates;
};

// Get Prefix Settings
router.get('/prefixes', async (req: Request, res: Response) => {
  try {
    const settings = await PrefixSetting.findOne();
    if (!settings) {
      return res.status(200).json(null); 
    }
    return res.json(settings);
  } catch (err) {
    return res.status(500).json({ message: "Server Error", error: err });
  }
});

// Update Prefix Settings
router.post('/prefixes', async (req: Request, res: Response) => {
  try {
    const updates = buildPrefixSettingsUpdate(req.body);
    const updatedSettings = await PrefixSetting.findOneAndUpdate(
      {}, 
      { 
        $set: updates
      }, 
      { 
        upsert: true,
        new: true,    
        runValidators: true 
      }
    );

    return res.json({ 
      success: true,
      message: "Prefix settings updated successfully", 
      data: updatedSettings 
    });
  } catch (err: any) {
    return res.status(400).json({ 
      success: false,
      message: "Update failed", 
      error: err.message 
    });
  }
});

export default router;
