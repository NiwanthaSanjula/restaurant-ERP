import { Request, Response } from 'express';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';

// Get Current User Details
export const getProfile = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required.' });
    const user = await User.findById(userId).select('-passwordHash');
    return res.json({ success: true, user });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Update Profile
export const updateProfile = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { name, mobileNumber, image } = req.body;
    const userId = req.user?._id;
    if (req.body.userId && String(req.body.userId) !== String(userId)) return res.status(403).json({ success: false, message: 'Only your own profile can be updated.' });

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID is required" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { name, mobileNumber, image } },
      { new: true }
    ).select('-passwordHash');

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "User not found in database" });
    }

    return res.json({ success: true, message: "Profile updated successfully!", user: updatedUser });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
