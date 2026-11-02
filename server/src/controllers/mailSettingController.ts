import { Request, Response } from 'express';
import MailSetting from '../models/MailSetting';
import { MAIL_FIELDS, pickSettingsFields } from '../utils/settingsFields';

const mailResponse = (settings: unknown) => ({
  ...pickSettingsFields(settings, MAIL_FIELDS),
  hasPassword: !!(settings && typeof settings === 'object' && Reflect.get(settings, 'password'))
});

export const getMailSettings = async (req: Request, res: Response) => {
  try {
    let settings = await MailSetting.findOne();
    if (!settings) {
      return res.status(200).json({ success: true, data: {} });
    }
    return res.status(200).json({ success: true, data: mailResponse(settings) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Unable to load mail settings.' });
  }
};

export const updateMailSettings = async (req: Request, res: Response) => {
  try {
    const { password } = req.body;

    const existing = await MailSetting.findOne();
    const hasPasswordInput = typeof password === 'string' && password.trim().length > 0 &&
      !/^(?:[*\u2022\u25cf]+|\[?redacted\]?|<redacted>)$/i.test(password.trim());
    if (!existing && !hasPasswordInput) {
      return res.status(400).json({
        success: false,
        message: 'SMTP password is required when saving mail settings for the first time.'
      });
    }

    const settings = await MailSetting.findOneAndUpdate(
      {},
      {
        $set: {
          ...pickSettingsFields(req.body, MAIL_FIELDS),
          ...(hasPasswordInput ? { password: password.trim() } : {})
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
      data: mailResponse(settings)
    });
  } catch (error: any) {
    return res.status(400).json({ 
      success: false, 
      message: 'Unable to save mail settings.'
    });
  }
};
