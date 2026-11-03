import nodemailer from 'nodemailer';
import MailSetting from '../models/MailSetting';
import { brandEmailContent, DEFAULT_COMPANY_NAME, readPublicBranding } from '../services/branding';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

const resolveSmtpConfig = async (): Promise<{ config: SmtpConfig | null; reason?: string }> => {
  const settings = await MailSetting.findOne().lean();

  if (settings) {
    const dbMissing: string[] = [];
    if (!settings.mailHost) dbMissing.push('mailHost');
    if (!settings.mailPort) dbMissing.push('mailPort');
    if (!settings.username) dbMissing.push('username');
    if (!settings.password) dbMissing.push('password');

    if (dbMissing.length === 0) {
      return {
        config: {
          host: settings.mailHost as string,
          port: Number(settings.mailPort),
          user: settings.username as string,
          pass: settings.password as string,
          from: settings.username as string
        }
      };
    }
  }

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || 'no-reply@servesmart.local';

  const envMissing: string[] = [];
  if (!host) envMissing.push('SMTP_HOST');
  if (!port) envMissing.push('SMTP_PORT');
  if (!user) envMissing.push('SMTP_USER');
  if (!pass) envMissing.push('SMTP_PASS');

  if (envMissing.length === 0) {
    return {
      config: {
        host: host as string,
        port: port as number,
        user: user as string,
        pass: pass as string,
        from
      }
    };
  }

  if (settings) {
    const dbMissing: string[] = [];
    if (!settings.mailHost) dbMissing.push('mailHost');
    if (!settings.mailPort) dbMissing.push('mailPort');
    if (!settings.username) dbMissing.push('username');
    if (!settings.password) dbMissing.push('password');

    return {
      config: null,
      reason: `Mail settings are incomplete: ${dbMissing.join(', ')} and environment values are incomplete: ${envMissing.join(', ')}`
    };
  }

  return {
    config: null,
    reason: `Missing environment values: ${envMissing.join(', ')}`
  };
};

export const sendEmail = async ({ to, subject, html }: SendEmailOptions): Promise<void> => {
  const { config: smtpConfig, reason } = await resolveSmtpConfig();

  if (!smtpConfig) {
    throw new Error(`SMTP is not configured. ${reason || 'Set Mail settings or provide SMTP_* environment values.'}`);
  }

  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.port === 465,
    auth: { user: smtpConfig.user, pass: smtpConfig.pass }
  });

  let companyName = DEFAULT_COMPANY_NAME;
  try { companyName = (await readPublicBranding()).companyName; } catch { /* Retain the default if branding is unavailable. */ }
  const content = brandEmailContent({ subject, html }, companyName);
  await transporter.sendMail({ from: smtpConfig.from, to, ...content });
};


