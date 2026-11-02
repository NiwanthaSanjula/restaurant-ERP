import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';

// Same server .env and URI convention as src/server.ts/config/database.ts.
// Do not import server startup, controller handlers, mailers or the legacy seed.
dotenv.config({ path: path.resolve(__dirname, '../../..', '.env') });
mongoose.set('autoCreate', false);
mongoose.set('autoIndex', false);
mongoose.set('debug', false);
