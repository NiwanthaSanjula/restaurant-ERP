import mongoose, { Document, Schema } from 'mongoose';
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface IMailSetting extends Document {
  mailMailer: string;
  mailHost: string;
  mailPort: number;
  mailSenderName: string;
  username: string;
  password?: string; 
  createdAt: Date;
  updatedAt: Date;
}

const mailSettingSchema = new Schema({
  mailMailer: {
    type: String,
    required: [true, 'Mail Mailer is mandatory'],
    trim: true
  },
  mailHost: {
    type: String,
    required: [true, 'Mail Host is mandatory'],
    trim: true,
    match: [/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'Please enter a valid SMTP host (ex: smtp.gmail.com)']
  },
  mailPort: {
    type: Number
  },
  mailSenderName: {
    type: String,
    trim: true
  },
  username: {
  type: String,
    trim: true,
    match: emailRegex
  },
  password: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

export default mongoose.model<IMailSetting>('MailSetting', mailSettingSchema);