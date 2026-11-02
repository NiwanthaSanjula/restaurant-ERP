import { Request, Response } from 'express';
import Setting from '../models/Setting';

export const getSettings = async (req: Request, res: Response) => {
  try {
    let settings = await Setting.findOne();
    if (!settings) {
      return res.status(200).json({
        success: true,
        data: {
          system: {
            companyLogo: '',
            defaultEmail: '',
            currency: '',
            companyName: '',
            companyMobile: '',
            developedBy: '',
            address: ''
          }
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: { system: settings.system }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


export const updateSettings = async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const settings = await Setting.findOneAndUpdate({}, updates, {
      new: true,
      upsert: true,
      runValidators: true 
    });

    return res.status(200).json({ success: true, message: 'Settings updated successfully', data: settings });
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((val: any) => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }

    return res.status(500).json({ success: false, message: error.message });
  }
};