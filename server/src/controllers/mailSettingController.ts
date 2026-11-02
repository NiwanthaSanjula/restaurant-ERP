import { Request, Response } from 'express';
import MailSetting from '../models/MailSetting';

export const getMailSettings = async (req: Request, res: Response) => {
  try {
    let settings = await MailSetting.findOne();
    if (!settings) {
      return res.status(200).json({ success: true, data: {} });
    }
    return res.status(200).json({ success: true, data: settings });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateMailSettings = async (req: Request, res: Response) => {
  try {
    const { mailMailer, mailHost, mailPort, mailSenderName, username, password } = req.body;

    const existing = await MailSetting.findOne();
    const hasPasswordInput = typeof password === 'string' && password.trim().length > 0;
    if (!existing && !hasPasswordInput) {
      return res.status(400).json({
        success: false,
        message: 'SMTP password is required when saving mail settings for the first time.'
      });
    }

    const finalPassword = hasPasswordInput ? password.trim() : existing?.password;

    const settings = await MailSetting.findOneAndUpdate(
      {},
      {
        $set: {
          mailMailer,
          mailHost,
          mailPort,
          mailSenderName,
          username,
          ...(finalPassword && { password: finalPassword }) 
        }
      },
      { 
        upsert: true, 
        new: true,   
        runValidators: true 
      }
    );

    return res.status(200).json({ 
      success: true, 
      message: 'Mail settings saved successfully', 
      data: settings 
    });
  } catch (error: any) {
    return res.status(400).json({ 
      success: false, 
      message: error.message 
    });
  }
};