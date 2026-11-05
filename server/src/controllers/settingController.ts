import { Request, Response } from 'express';
import Setting from '../models/Setting';
import { checkPermissionInMap, getRolePermissions } from '../config/rbac';
import { AuthRequest } from '../middleware/auth';
import { pickSettingsFields, STAFF_SYSTEM_FIELDS, SYSTEM_FIELDS } from '../utils/settingsFields';
import { readPublicBranding } from '../services/branding';
import mongoose from 'mongoose';
import Warehouse from '../models/Warehouse';

// Sign-in branding is intentionally separate from authenticated settings reads.
export const getBranding = async (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    return res.json({ success: true, data: await readPublicBranding() });
  } catch {
    return res.status(500).json({ success: false, message: 'Unable to load branding.' });
  }
};

export const getSettings = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const permissions = await getRolePermissions(req.user);
    const canViewSettings = checkPermissionInMap(permissions, 'manageSettings', 'view_settings');
    const settings = await Setting.findOne();
    const system = settings?.system || {
      companyLogo: '', defaultEmail: '', currency: '', companyName: '',
      companyMobile: '', developedBy: '', address: ''
    };

    return res.status(200).json({
      success: true,
      data: { system: pickSettingsFields(system, canViewSettings ? SYSTEM_FIELDS : STAFF_SYSTEM_FIELDS) }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Unable to load system settings.' });
  }
};


export const updateSettings = async (req: Request, res: Response) => {
  try {
    const fields = pickSettingsFields(req.body?.system, SYSTEM_FIELDS);
    for (const field of SYSTEM_FIELDS) {
      const dotted = pickSettingsFields(req.body, [`system.${field}`]);
      if (Object.keys(dotted).length) fields[field] = dotted[`system.${field}`];
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'defaultPosWarehouseId')) {
      const id = fields.defaultPosWarehouseId;
      if (id === null || id === '') fields.defaultPosWarehouseId = null;
      else if (typeof id !== 'string' || !mongoose.isValidObjectId(id) || !await Warehouse.findOne({ _id: id, isActive: true }).select('_id').lean()) {
        return res.status(400).json({ success: false, message: 'Choose an active selling location, or clear the default.' });
      }
      else fields.defaultPosWarehouseId = new mongoose.Types.ObjectId(id).toHexString();
    }
    if (!Object.keys(fields).length) {
      return res.status(400).json({ success: false, message: 'No supported system settings provided.' });
    }
    const updates = Object.fromEntries(Object.entries(fields).map(([field, value]) => [`system.${field}`, value]));
    const settings = await Setting.findOneAndUpdate({}, { $set: updates }, {
      new: true,
      upsert: true,
      runValidators: true 
    });

    return res.status(200).json({ success: true, message: 'Settings updated successfully', data: { system: pickSettingsFields(settings?.system, SYSTEM_FIELDS) } });
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: 'Invalid system settings.' });
    }

    return res.status(500).json({ success: false, message: 'Unable to update system settings.' });
  }
};
