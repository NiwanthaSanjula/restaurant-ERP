import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { RBAC_COMPONENTS } from '../../config/rbac';
import { authenticate } from '../../middleware/auth';
import { checkPermission } from '../../middleware/permissions';
import Permission from '../../models/Permission';
import Role from '../../models/Role';

// Get all roles
export const getRoles = [authenticate, checkPermission('manageRoles', 'read'), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const q = (req.query.q as string) || '';
    const filter: any = q ? { name: { $regex: q, $options: 'i' } } : {};
    const roles = await Role.find(filter).select('_id name description permissions isActive createdAt updatedAt');
    res.json({ status: 'success', data: roles });
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch roles' });
  }
}];

// Get role by ID
export const getRoleById = [authenticate, checkPermission('manageRoles', 'read'), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const role = await Role.findById(id).select('_id name description permissions isActive createdAt updatedAt');
    if (!role) {
      res.status(404).json({ status: 'error', message: 'Role not found' });
      return;
    }
    res.json({ status: 'success', data: role });
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch role' });
  }
}];

// Create role validators
export const createRoleValidators = [
  authenticate,
  checkPermission('manageRoles', 'create'),
  body('name').isString().trim().isLength({ min: 1 }).withMessage('Role name is required'),
  body('description').optional().isString().trim(),
  body('permissions').isArray().withMessage('Permissions must be an array'),
  body('permissions.*.component').isIn(RBAC_COMPONENTS).withMessage('Invalid component'),
  body('permissions.*.actions.create').isBoolean().withMessage('Create action must be boolean'),
  body('permissions.*.actions.read').isBoolean().withMessage('Read action must be boolean'),
  body('permissions.*.actions.update').isBoolean().withMessage('Update action must be boolean'),
  body('permissions.*.actions.delete').isBoolean().withMessage('Delete action must be boolean')
];

// Create role
export const createRole = async (req: express.Request, res: express.Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 'error', errors: errors.array() });
    return;
  }

  try {
    const { name, permissions } = req.body;
    const description =
      typeof req.body.description === 'string' ? req.body.description.trim() : '';

    // ✅ FIX: reject if no permission entry has at least one action set to true
    const hasAtLeastOnePermission = Array.isArray(permissions) && permissions.some(
      (p: { actions: { create: boolean; read: boolean; update: boolean; delete: boolean } }) =>
        p.actions?.create || p.actions?.read || p.actions?.update || p.actions?.delete
    );

    if (!hasAtLeastOnePermission) {
      res.status(400).json({
        status: 'error',
        message: 'At least one permission must be selected to create a role.'
      });
      return;
    }

    // Check if role already exists
    const existingRole = await Role.findOne({ name });
    if (existingRole) {
      res.status(409).json({ status: 'error', message: 'Role already exists' });
      return;
    }

    const role = await Role.create({ name, description, permissions });
    res.status(201).json({ status: 'success', data: { id: role._id, name: role.name } });
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'Failed to create role' });
  }
};

// Update role validators
export const updateRoleValidators = [
  authenticate,
  checkPermission('manageRoles', 'update'),
  param('id').isString().notEmpty(),
  body('name').optional().isString().trim().isLength({ min: 1 }),
  body('description').optional().isString().trim(),
  body('permissions').optional().isArray(),
  body('permissions.*.component').optional().isIn(RBAC_COMPONENTS),
  body('permissions.*.actions.create').optional().isBoolean(),
  body('permissions.*.actions.read').optional().isBoolean(),
  body('permissions.*.actions.update').optional().isBoolean(),
  body('permissions.*.actions.delete').optional().isBoolean()
];

// Update role
export const updateRole = async (req: express.Request, res: express.Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 'error', errors: errors.array() });
    return;
  }

  try {
    const { id } = req.params as { id: string };
    
   
    const updateData: any = {};
    if (typeof req.body.name === 'string') {
      updateData.name = req.body.name.trim();
    }
    if (typeof req.body.description === 'string') {
      updateData.description = req.body.description.trim();
    }
    if (Array.isArray(req.body.permissions)) {
      updateData.permissions = req.body.permissions;
    }

    // Check if role exists
    const existingRole = await Role.findById(id);
    if (!existingRole) {
      res.status(404).json({ status: 'error', message: 'Role not found' });
      return;
    }

    // Check if name is being changed and if it conflicts
    if (updateData.name && updateData.name !== existingRole.name) {
      const nameConflict = await Role.findOne({ name: updateData.name, _id: { $ne: id } });
      if (nameConflict) {
        res.status(409).json({ status: 'error', message: 'Role name already exists' });
        return;
      }
    }

    // Prevent updates that remove all granted actions.
    if (Array.isArray(updateData.permissions)) {
      const hasAtLeastOnePermission = updateData.permissions.some(
        (p: { actions?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean } }) =>
          p?.actions?.create || p?.actions?.read || p?.actions?.update || p?.actions?.delete
      );
      if (!hasAtLeastOnePermission) {
        res.status(400).json({
          status: 'error',
          message: 'At least one permission must be selected to update a role.'
        });
        return;
      }
    }

    const updatedRole = await Role.findByIdAndUpdate(id, updateData, { new: true });
    if (!updatedRole) {
      res.status(500).json({ status: 'error', message: 'Failed to update role' });
      return;
    }
    res.json({ status: 'success', data: { id: updatedRole._id, name: updatedRole.name, permissions: updatedRole.permissions } });
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'Failed to update role' });
  }
};

// Delete role validators
export const deleteRoleValidators = [authenticate, checkPermission('manageRoles', 'delete'), param('id').isString().notEmpty()];

// Delete role
export const deleteRole = async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    
    // Check if role is being used by any user
    const User = require('../../models/User').default;
    const usersWithRole = await User.find({ roleId: id });
    if (usersWithRole.length > 0) {
      res.status(400).json({ status: 'error', message: 'Cannot delete role. It is assigned to one or more users.' });
      return;
    }

    const deletedRole = await Role.findByIdAndDelete(id);
    if (!deletedRole) {
      res.status(404).json({ status: 'error', message: 'Role not found' });
      return;
    }

    res.json({ status: 'success', message: 'Role deleted successfully' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'Failed to delete role' });
  }
};

// Get all permissions
export const getPermissions = [authenticate, checkPermission('manageRoles', 'read'), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const q = (req.query.q as string) || '';
    const filter: any = {};
    
    // Search functionality - search by permission name, component, or action
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { component: { $regex: q, $options: 'i' } },
        { action: { $regex: q, $options: 'i' } }
      ];
    }
    
    const permissions = await Permission.find(filter).select('_id name component action description isActive createdAt updatedAt');
    res.json({ status: 'success', data: permissions });
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch permissions' });
  }
}];

// Get permissions by component
export const getPermissionsByComponent = [authenticate, checkPermission('manageRoles', 'read'), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { component } = req.params as { component: string };
    const permissions = await Permission.find({ component }).select('_id name component action description isActive');
    res.json({ status: 'success', data: permissions });
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch permissions' });
  }
}];

// Create permission validators
export const createPermissionValidators = [
  authenticate,
  checkPermission('manageRoles', 'create'),
  body('name').isString().trim().isLength({ min: 1 }).withMessage('Permission name is required'),
  body('component').isIn(RBAC_COMPONENTS).withMessage('Invalid component'),
  body('action').isIn(['create', 'read', 'update', 'delete']).withMessage('Invalid action'),
  body('description').optional().isString().trim()
];

// Create permission
export const createPermission = async (req: express.Request, res: express.Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 'error', errors: errors.array() });
    return;
  }

  try {
    const { name, component, action } = req.body;
    const description =
      typeof req.body.description === 'string' ? req.body.description.trim() : '';
    
    // Check if permission already exists
    const existingPermission = await Permission.findOne({ name });
    if (existingPermission) {
      res.status(409).json({ status: 'error', message: 'Permission already exists' });
      return;
    }

    const permission = await Permission.create({ name, component, action, description });
    res.status(201).json({ status: 'success', data: { id: permission._id, name: permission.name } });
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'Failed to create permission' });
  }
};

// Update permission validators
export const updatePermissionValidators = [
  authenticate,
  checkPermission('manageRoles', 'update'),
  param('id').isString().notEmpty(),
  body('name').optional().isString().trim().isLength({ min: 1 }),
  body('component').optional().isIn(RBAC_COMPONENTS),
  body('action').optional().isIn(['create', 'read', 'update', 'delete']),
  body('description').optional().isString().trim()
];

// Update permission
export const updatePermission = async (req: express.Request, res: express.Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 'error', errors: errors.array() });
    return;
  }

  try {
    const { id } = req.params as { id: string };
    const updateData = { ...req.body };
    if (typeof updateData.description === 'string') {
      updateData.description = updateData.description.trim();
    }

    // Check if permission exists
    const existingPermission = await Permission.findById(id);
    if (!existingPermission) {
      res.status(404).json({ status: 'error', message: 'Permission not found' });
      return;
    }

    // Check if name is being changed and if it conflicts
    if (updateData.name && updateData.name !== existingPermission.name) {
      const nameConflict = await Permission.findOne({ name: updateData.name, _id: { $ne: id } });
      if (nameConflict) {
        res.status(409).json({ status: 'error', message: 'Permission name already exists' });
        return;
      }
    }

    const updatedPermission = await Permission.findByIdAndUpdate(id, updateData, { new: true });
    res.json({ status: 'success', data: { id: updatedPermission!._id, name: updatedPermission!.name } });
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'Failed to update permission' });
  }
};

// Delete permission validators
export const deletePermissionValidators = [authenticate, checkPermission('manageRoles', 'delete'), param('id').isString().notEmpty()];

// Delete permission
export const deletePermission = async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    
    const deletedPermission = await Permission.findByIdAndDelete(id);
    if (!deletedPermission) {
      res.status(404).json({ status: 'error', message: 'Permission not found' });
      return;
    }

    res.json({ status: 'success', message: 'Permission deleted successfully' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'Failed to delete permission' });
  }
};