import bcrypt from 'bcryptjs';
import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticate } from '../../middleware/auth';
import { checkPermission } from '../../middleware/permissions';
import User from '../../models/User';
import { sendEmail } from '../../utils/email';
import { generateTemporaryPassword } from '../../utils/password';

export const getUsers = [authenticate, checkPermission('manageUsers', 'read'), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const q = (req.query.q as string) || '';
    const filter: any = {};
    
    // Search functionality - search by name, email, or role
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { role: { $regex: q, $options: 'i' } }
      ];
    }
    
    const users = await User.find(filter)
      .select('_id name email role roleId isActive createdAt')
      .populate('roleId', 'name description');
    res.json({ status: 'success', data: users });
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch users' });
  }
}];

export const getUserById = [authenticate, checkPermission('manageUsers', 'read'), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const user = await User.findById(id)
      .select('_id name email role roleId isActive createdAt')
      .populate('roleId', 'name description');
    if (!user) {
      res.status(404).json({ status: 'error', message: 'User not found' });
      return;
    }
    res.json({ status: 'success', data: user });
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch user' });
  }
}];

export const createUserValidators = [
  authenticate,
  checkPermission('manageUsers', 'create'),
  body('name').isString().trim().isLength({ min: 1 }).withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('roleId').optional().isMongoId().withMessage('Invalid role ID'),
  body('password').not().exists().withMessage('Password must not be provided by client.'),
  body('passwordHash').not().exists().withMessage('Password hash must not be provided by client.')
];

export const createUser = async (req: express.Request, res: express.Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 'error', errors: errors.array() });
    return;
  }
  try {
    const { name, email, roleId } = req.body as { name: string; email: string; roleId?: string };
    const existing = await User.findOne({ email });
    if (existing) {
      res.status(409).json({ status: 'error', message: 'Email already exists' });
      return;
    }

    // If roleId is provided, validate that the role exists
    if (roleId) {
      const Role = require('../../models/Role').default || require('../../models/Role');
      const roleExists = await Role.findById(roleId);
      if (!roleExists) {
        res.status(400).json({ status: 'error', message: 'Role not found' });
        return;
      }
    }

    const temporaryPassword = generateTemporaryPassword(12);
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    const user = await User.create({
      name: name.trim(),
      email,
      role: 'staff',
      roleId: roleId || null,
      isActive: true,
      passwordHash
    });

    try {
      await sendEmail({
        to: email,
        subject: 'Your ServeSmart temporary password',
        html: `
          <p>Hello ${name},</p>
          <p>Your account has been created.</p>
          <p><strong>Temporary password:</strong> ${temporaryPassword}</p>
          <p>Use this password to sign in. For changing password, use Forgot Password flow.</p>
          <p>-- ServeSmart Team</p>
        `
      });
    } catch (emailError: any) {
      await User.findByIdAndDelete(user._id);
      res.status(500).json({
        status: 'error',
        message: emailError?.message || 'Failed to send temporary password email. User was not created.'
      });
      return;
    }

    res.status(201).json({
      status: 'success',
      message: 'User created successfully. Temporary password sent by email.',
      data: { id: user._id }
    });
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'Failed to create user' });
  }
};

export const updateUserValidators = [
  authenticate,
  checkPermission('manageUsers', 'update'),
  param('id').isString().notEmpty(),
  body('firstName').optional().isString().trim().isLength({ min: 1 }).withMessage('First name is required'),
  body('lastName').optional().isString().trim().isLength({ min: 1 }).withMessage('Last name is required'),
  body('name').optional().isString().trim().isLength({ min: 1 }).withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('roleId').optional().isMongoId().withMessage('Invalid role ID'),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
  body('password').not().exists().withMessage('Password cannot be changed from this endpoint.'),
  body('passwordHash').not().exists().withMessage('Password hash cannot be changed from this endpoint.')
];

export const updateUser = async (req: express.Request, res: express.Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 'error', errors: errors.array() });
    return;
  }
  try {
    const { id } = req.params as { id: string };
    const { firstName, lastName, name, email, roleId, isActive } = req.body as {
      firstName?: string;
      lastName?: string;
      name?: string;
      email: string;
      roleId?: string;
      isActive?: boolean;
    };

    // If roleId is provided, validate that the role exists
    if (roleId) {
      const Role = require('../../models/Role').default || require('../../models/Role');
      const roleExists = await Role.findById(roleId);
      if (!roleExists) {
        res.status(400).json({ status: 'error', message: 'Role not found' });
        return;
      }
    }

    const finalName = name?.trim() || `${firstName || ''} ${lastName || ''}`.trim();
    if (!finalName) {
      res.status(400).json({ status: 'error', message: 'Name is required' });
      return;
    }

    const updateData: any = { name: finalName, email };
    if (roleId !== undefined) {
      updateData.roleId = roleId || null;
    }
    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }

    const updated = await User.findByIdAndUpdate(id, updateData, { new: true });
    if (!updated) {
      res.status(404).json({ status: 'error', message: 'User not found' });
      return;
    }
    res.json({ status: 'success', data: { id: updated._id, roleId: updated.roleId, isActive: updated.isActive } });
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'Failed to update user' });
  }
};

export const deleteUserValidators = [authenticate, checkPermission('manageUsers', 'delete'), param('id').isString().notEmpty()];

export const deleteUser = async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const deleted = await User.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({ status: 'error', message: 'User not found' });
      return;
    }
    res.json({ status: 'success', message: 'User deleted' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'Failed to delete user' });
  }
};


