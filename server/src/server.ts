import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import path from 'path';

// Import database connection
import connectDB from './config/database';

// Import routes
import deleteRoutes from './routes/deleteRoutes';
import getRoutes from './routes/getRoutes';
import postRoutes from './routes/postRoutes';
import putRoutes from './routes/putRoutes';
import settingRoutes from './routes/settingRoutes';
import specialOfferRoutes from './routes/specialOfferRoutes';
import userRoutes from './routes/userRoutes';

// Load environment variables
dotenv.config();

// Prevent insecure default fallback for JWT secret — require explicit configuration
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Aborting startup to prevent insecure default fallback.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads');
    
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  const protocol = req.protocol;
  const host = req.get('host');
  const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

  return res.json({ 
    success: true, 
    url: fileUrl 
  });
});

// --- MOUNT ROUTES ---

// Settings Route (Handles System, Mail, Receipt, and Prefix settings)
app.use('/api/settings', settingRoutes);
// offer route
app.use('/api/special-offers', specialOfferRoutes);

app.use('/api/users', userRoutes);

// General Routes
app.use('/api', getRoutes);
app.use('/api', postRoutes);
app.use('/api', putRoutes);
app.use('/api', deleteRoutes);

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found'
  });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Something went wrong!'
  });
});

// Connect to database and start server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 ServeSmart Backend running on port ${PORT}`);
  });
});