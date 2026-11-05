import bcrypt from 'bcryptjs';
import express from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import OTP from '../../models/OTP';
import PrefixSetting from '../../models/PrefixSetting';
import User from '../../models/User';
import { sendEmail } from '../../utils/email';
import { administratorPermissions, clientPermissionMap, resolveRoleAccess } from '../../config/rbac';
import { isPublicDemoUser } from '../../config/publicDemo';

// Utilities
const generateJwtToken = (id: string): string => {
  const secret = process.env.JWT_SECRET as string;
  const expiresIn = process.env.JWT_EXPIRE || '7d';
  return jwt.sign({ id }, secret, { expiresIn } as jwt.SignOptions);
};

const consumeValidOtp = async (email: string, otp: string) => {
  const now = new Date();

  return OTP.findOneAndUpdate(
    { email, otp, isUsed: false, expiresAt: { $gt: now } },
    { $set: { isUsed: true, expiresAt: now } },
    { new: true }
  );
};

// Validators
export const loginValidators = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required')
];

export const requestOtpValidators = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email')
];

export const verifyOtpValidators = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
];

export const resetPasswordValidators = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/(?=.*[a-z])/).withMessage('Password must contain a lowercase letter')
    .matches(/(?=.*[A-Z])/).withMessage('Password must contain an uppercase letter')
    .matches(/(?=.*\d)/).withMessage('Password must contain a number')
    .matches(/(?=.*[^A-Za-z0-9])/).withMessage('Password must contain a special character')
];

export const initialRunValidators: any[] = [];

// Controllers
export const postLogin = async (req: express.Request, res: express.Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 'error', errors: errors.array() });
    return;
  }

  try {
    const { email, password } = req.body as { email: string; password: string };
    console.log(`Login attempt for email: "${email}"`);
    const user = await User.findOne({ email }).select('+passwordHash +password');

    if (!user) {
      console.log(`User not found for email: "${email}"`);
      res.status(401).json({ status: 'error', message: 'Invalid username or password' });
      return;
    }

    if (isPublicDemoUser(user)) {
      res.status(401).json({ status: 'error', message: 'Use Try Demo for the public visitor session.' }); return;
    }
    if (!user.isActive) {
      console.log(`User account is deactivated: "${email}"`);
      res.status(401).json({ status: 'error', message: 'Account is deactivated' });
      return;
    }

    // Some legacy records may not have passwordHash selected/populated correctly.
    // Treat that case as invalid username or password instead of throwing a 500.
    const passwordHash = (user as any).passwordHash as string | undefined;
    if (!passwordHash || typeof passwordHash !== 'string') {
      console.error(`Login error: passwordHash missing for "${email}"`);
      res.status(401).json({ status: 'error', message: 'Invalid username or password' });
      return;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.log(`Password mismatch for email: "${email}"`);
      res.status(401).json({ status: 'error', message: 'Invalid username or password' });
      return;
    }
    const access = await resolveRoleAccess(user);
    if (!access) {
      res.status(403).json({ status: 'error', message: 'An active, valid assigned role is required.' });
      return;
    }
    // Determine whether prefix setup is required (used by frontend to redirect)
    const prefixCount = await PrefixSetting.countDocuments();

    const token = generateJwtToken(user._id.toString());
    const prefixSetting = await PrefixSetting.findOne({});
    const prefixSetupRequired = !prefixSetting;

    res.json({
      status: 'success',
      message: 'Login successful',
      data: {
        user: { id: user._id, name: user.name, email: user.email, role: user.role, roleId: access.roleId, roleName: access.roleName, permissions: clientPermissionMap(access.permissions) },
        token,
        prefixSetupRequired: prefixCount === 0
      }
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ status: 'error', message: 'Server error during login' });
  }
};

export const postRequestOtp = async (req: express.Request, res: express.Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 'error', errors: errors.array() });
    return;
  }

  try {
    const { email } = req.body as { email: string };
    const adminEmail = process.env.INITIAL_ADMIN_EMAIL;

    if (adminEmail && email.toLowerCase() !== adminEmail.toLowerCase()) {
      res.status(403).json({ status: 'error', message: 'Access denied. Only the authorized admin email can reset the password.' });
      return;
    }

    const user = await User.findOne({ email });

    if (!user) {
      res.status(404).json({ status: 'error', message: 'User not found with this email' });
      return;
    }

    if (user.role !== 'admin') {
      res.status(403).json({ status: 'error', message: 'Access denied. Only admins can reset passwords.' });
      return;
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Invalidate older unused OTPs for this email so only the latest code can be used.
    const now = new Date();
    await OTP.updateMany(
      { email, isUsed: false },
      { $set: { isUsed: true, expiresAt: now } }
    );

    // Save OTP entry
    await OTP.create({ email, otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) });

    // Send OTP via email (fallback logs if SMTP not configured)
    await sendEmail({
      to: email,
      subject: 'Your {{companyName}} password reset code',
      html: `<p>Your password reset code is:</p><h2>${otp}</h2><p>This code expires in 10 minutes.</p>`
    });

    res.json({ status: 'success', message: 'OTP sent to your email' });
  } catch (error: any) {
    console.error('Request OTP error:', error);
    res.status(500).json({ status: 'error', message: 'Server error while sending OTP' });
  }
};

export const postVerifyOtp = async (req: express.Request, res: express.Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 'error', errors: errors.array() });
    return;
  }

  try {
    const { email, otp } = req.body as { email: string; otp: string };

    const otpDoc = await consumeValidOtp(email, otp);
    if (!otpDoc) {
      res.status(400).json({ status: 'error', message: 'Invalid OTP. Please check the code and try again.' });
      return;
    }

    if (otpDoc.expiresAt.getTime() < Date.now()) {
      res.status(400).json({ status: 'error', message: 'OTP has expired. Please request a new one.' });
      return;
    }

    res.json({ status: 'success', message: 'Code verified. You can now set your new password.' });
  } catch (error: any) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ status: 'error', message: 'Server error while verifying code' });
  }
};

export const putResetPassword = async (req: express.Request, res: express.Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 'error', errors: errors.array() });
    return;
  }

  try {
    const { email, otp, newPassword } = req.body as { email: string; otp: string; newPassword: string };

    const otpDoc = await consumeValidOtp(email, otp);
    if (!otpDoc) {
      res.status(400).json({ status: 'error', message: 'Invalid OTP. Please check the code and try again.' });
      return;
    }

    if (otpDoc.expiresAt.getTime() < Date.now()) {
      res.status(400).json({ status: 'error', message: 'OTP has expired. Please request a new one.' });
      return;
    }

    const user = await User.findOne({ email });
    if (!user) {
      res.status(400).json({ status: 'error', message: 'Invalid request' });
      return;
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    // Send confirmation email after successful password change
    await sendEmail({
      to: email,
      subject: 'Your {{companyName}} password was changed successfully',
      html: `<p>Hello,</p><p>Your password for {{companyName}} has been changed successfully.</p><p>If you did not make this change, please contact support immediately.</p><p>— {{companyName}} Team</p>`
    }).catch((err) => console.error('Confirmation email failed:', err));

    res.json({ status: 'success', message: 'Password has been reset successfully' });
  } catch (error: any) {
    console.error('Reset password error:', error);
    res.status(500).json({ status: 'error', message: 'Server error while resetting password' });
  }
};

export const postInitialRun = async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const secretFromEnv = process.env.INITIAL_RUN_SECRET;
    if (!secretFromEnv) {
      res.status(403).json({ status: 'error', message: 'Initial run not configured' });
      return;
    }

    const providedSecret = (req.body && req.body.secret) || (req.headers['x-initial-run-secret'] as string | undefined) || (req.query && (req.query.secret as string | undefined));
    if (!providedSecret || typeof providedSecret !== 'string' || providedSecret.trim().length === 0) {
      res.status(400).json({ status: 'error', message: 'Secret is required' });
      return;
    }
    const secret = providedSecret;
    if (secret !== secretFromEnv) {
      res.status(403).json({ status: 'error', message: 'Invalid secret' });
      return;
    }

    const userCount = await User.countDocuments();
    if (userCount > 0) {
      res.status(409).json({ status: 'error', message: 'Users already exist. Initial run disabled.' });
      return;
    }

    // Import Role and Permission models (support both default and named exports)
    // This avoids runtime issues depending on TS/JS module compilation.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Role = require('../../models/Role').default || require('../../models/Role');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Permission = require('../../models/Permission').default || require('../../models/Permission');

    // Preserve legacy permission metadata; authorization uses the explicitly granted Role below.
    const permissions = [
      // User Management Permissions
      { name: 'create_user', component: 'manageUsers', action: 'create', description: 'Create new users' },
      { name: 'read_user', component: 'manageUsers', action: 'read', description: 'View user information' },
      { name: 'update_user', component: 'manageUsers', action: 'update', description: 'Edit user information' },
      { name: 'delete_user', component: 'manageUsers', action: 'delete', description: 'Delete users' },

      // Role Management Permissions
      { name: 'create_role', component: 'manageRoles', action: 'create', description: 'Create new roles' },
      { name: 'read_role', component: 'manageRoles', action: 'read', description: 'View role information' },
      { name: 'update_role', component: 'manageRoles', action: 'update', description: 'Edit role information' },
      { name: 'delete_role', component: 'manageRoles', action: 'delete', description: 'Delete roles' },

      // Menu Management Permissions
      { name: 'create_menu', component: 'manageMenu', action: 'create', description: 'Create menu items' },
      { name: 'read_menu', component: 'manageMenu', action: 'read', description: 'View menu items' },
      { name: 'update_menu', component: 'manageMenu', action: 'update', description: 'Edit menu items' },
      { name: 'delete_menu', component: 'manageMenu', action: 'delete', description: 'Delete menu items' },

      // Order Management Permissions
      { name: 'create_order', component: 'manageOrders', action: 'create', description: 'Create new orders' },
      { name: 'read_order', component: 'manageOrders', action: 'read', description: 'View order information' },
      { name: 'update_order', component: 'manageOrders', action: 'update', description: 'Edit order information' },
      { name: 'delete_order', component: 'manageOrders', action: 'delete', description: 'Delete orders' },

      // Table Management Permissions
      { name: 'create_table', component: 'manageTables', action: 'create', description: 'Create new tables' },
      { name: 'read_table', component: 'manageTables', action: 'read', description: 'View table information' },
      { name: 'update_table', component: 'manageTables', action: 'update', description: 'Edit table information' },
      { name: 'delete_table', component: 'manageTables', action: 'delete', description: 'Delete tables' },

      // Warehouse Management Permissions
      { name: 'create_warehouse', component: 'manageWarehouses', action: 'create', description: 'Create new warehouses' },
      { name: 'read_warehouse', component: 'manageWarehouses', action: 'read', description: 'View warehouse information' },
      { name: 'update_warehouse', component: 'manageWarehouses', action: 'update', description: 'Edit warehouse information' },
      { name: 'delete_warehouse', component: 'manageWarehouses', action: 'delete', description: 'Delete warehouses' },

      // Product Management Permissions
      { name: 'create_product', component: 'manageProducts', action: 'create', description: 'Create new products' },
      { name: 'read_product', component: 'manageProducts', action: 'read', description: 'View product information' },
      { name: 'update_product', component: 'manageProducts', action: 'update', description: 'Edit product information' },
      { name: 'delete_product', component: 'manageProducts', action: 'delete', description: 'Delete products' },

      // Base Unit Management Permissions
      { name: 'create_baseUnit', component: 'manageBaseUnits', action: 'create', description: 'Create new base units' },
      { name: 'read_baseUnit', component: 'manageBaseUnits', action: 'read', description: 'View base unit information' },
      { name: 'update_baseUnit', component: 'manageBaseUnits', action: 'update', description: 'Edit base unit information' },
      { name: 'delete_baseUnit', component: 'manageBaseUnits', action: 'delete', description: 'Delete base units' },

      // Unit Management Permissions
      { name: 'create_unit', component: 'manageUnits', action: 'create', description: 'Create new units' },
      { name: 'read_unit', component: 'manageUnits', action: 'read', description: 'View unit information' },
      { name: 'update_unit', component: 'manageUnits', action: 'update', description: 'Edit unit information' },
      { name: 'delete_unit', component: 'manageUnits', action: 'delete', description: 'Delete units' },

      // Category Management Permissions
      { name: 'create_category', component: 'manageCategories', action: 'create', description: 'Create new categories' },
      { name: 'read_category', component: 'manageCategories', action: 'read', description: 'View category information' },
      { name: 'update_category', component: 'manageCategories', action: 'update', description: 'Edit category information' },
      { name: 'delete_category', component: 'manageCategories', action: 'delete', description: 'Delete categories' },

      // Brand Management Permissions
      { name: 'create_brand', component: 'manageBrands', action: 'create', description: 'Create new brands' },
      { name: 'read_brand', component: 'manageBrands', action: 'read', description: 'View brand information' },
      { name: 'update_brand', component: 'manageBrands', action: 'update', description: 'Edit brand information' },
      { name: 'delete_brand', component: 'manageBrands', action: 'delete', description: 'Delete brands' },

      // Variation Management Permissions
      { name: 'create_variation', component: 'manageVariations', action: 'create', description: 'Create new variations' },
      { name: 'read_variation', component: 'manageVariations', action: 'read', description: 'View variation information' },
      { name: 'update_variation', component: 'manageVariations', action: 'update', description: 'Edit variation information' },
      { name: 'delete_variation', component: 'manageVariations', action: 'delete', description: 'Delete variations' },

      // POS Operations Permissions
      { name: 'create_pos', component: 'posOperations', action: 'create', description: 'Create POS operations' },
      { name: 'read_pos', component: 'posOperations', action: 'read', description: 'View POS operations' },
      { name: 'update_pos', component: 'posOperations', action: 'update', description: 'Edit POS operations' },
      { name: 'delete_pos', component: 'posOperations', action: 'delete', description: 'Delete POS operations' },

      // Reports Permissions
      { name: 'create_report', component: 'reports', action: 'create', description: 'Create reports' },
      { name: 'read_report', component: 'reports', action: 'read', description: 'View reports' },
      { name: 'update_report', component: 'reports', action: 'update', description: 'Edit reports' },
      { name: 'delete_report', component: 'reports', action: 'delete', description: 'Delete reports' }
    ];


    const adminName = process.env.INITIAL_ADMIN_NAME || process.env.ADMIN_USERNAME || 'Admin';
    const adminEmail = process.env.INITIAL_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
    const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      res.status(400).json({ status: 'error', message: 'Initial admin credentials not configured' });
      return;
    }

    // Enforce password complexity for initial admin password
    const pwd = adminPassword as string;
    const pwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!pwdRegex.test(pwd)) {
      res.status(400).json({
        status: 'error',
        message: 'Initial admin password does not meet complexity requirements. It must be at least 8 characters and include uppercase, lowercase, a number and a special character.'
      });
      return;
    }

    const existing = await User.findOne({ email: adminEmail });
    if (existing) {
      res.status(409).json({ status: 'error', message: 'Email already exists' });
      return;
    }

    const superAdminRole = await Role.create({
      name: 'Super Admin',
      description: 'Full system access with explicit permissions',
      permissions: administratorPermissions(),
      isActive: true
    });

    await Permission.insertMany(permissions);

    const adminPasswordHash = await bcrypt.hash(adminPassword, 12);

    const user = await User.create({
      name: adminName,
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: 'admin',
      roleId: superAdminRole._id,
      isActive: true
    });

    res.status(201).json({
      status: 'success',
      message: 'Initial setup completed successfully',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        roleId: user.roleId,
        permissionsCreated: permissions.length,
        roleCreated: superAdminRole.name
      }
    });
  } catch (error: any) {
    console.error('Initial run error:', error);
    res.status(500).json({ status: 'error', message: 'Server error during initial run' });
  }
};


