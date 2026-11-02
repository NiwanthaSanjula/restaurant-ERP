import express from 'express';
import { getProfile, updateProfile } from '../controllers/userController';

const router = express.Router();

router.get('/profile', getProfile);
router.put('/update-profile', updateProfile);

export default router;