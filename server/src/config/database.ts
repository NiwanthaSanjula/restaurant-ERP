import mongoose from 'mongoose';

let connecting: Promise<void> | undefined;
/** Reuse one small pool per warm function; failed attempts can be retried. */
const connectDB = async (): Promise<void> => {
  if (mongoose.connection.readyState === 1) return;
  if (!connecting) {
    const deployed = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
    const uri = process.env.MONGODB_URI || (!deployed ? 'mongodb://localhost:27017/dilshani_db' : '');
    if (!uri) throw new Error('MONGODB_URI is required for deployment.');
    connecting = mongoose.connect(uri, { maxPoolSize: 5, minPoolSize: 0, serverSelectionTimeoutMS: 10000,
      ...(deployed ? { autoCreate: false, autoIndex: false } : {})
    }).then(() => { console.log('MongoDB connected.'); }).finally(() => { connecting = undefined; });
  }
  await connecting;
};

export default connectDB;
