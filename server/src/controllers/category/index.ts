import express from 'express';
import { body, param, validationResult } from 'express-validator';

import { authenticate } from '../../middleware/auth';
import { checkPermission } from '../../middleware/permissions';

import Category from '../../models/Category';
import Product from '../../models/Product';

import { createFlexibleRegex } from '../../utils/regex';


// Get all categories
export const getCategories = [authenticate, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const q = (req.query.q as string) || '';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const filter: any = q ? { category: { $regex: q, $options: 'i' } } : {};
    
    const [categories, total] = await Promise.all([
      Category.find(filter)
        .select('category description createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Category.countDocuments(filter)
    ]);

    res.json({ 
      status: 'success', 
      data: categories,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (e: any) {
    console.error('Error fetching categories:', e);
    res.status(500).json({ 
      status: 'error', 
      message: `Failed to fetch categories: ${e.message}` 
    });
  }
}];

// Get category by ID
export const getCategoryById = [authenticate, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const category = await Category.findById(id);
    
    if (!category) {
      res.status(404).json({ 
        status: 'error', 
        message: 'Category not found' 
      });
      return;
    }

    res.json({ 
      status: 'success', 
      data: category 
    });
  } catch (e: any) {
    console.error('Error fetching category:', e);
    res.status(500).json({ 
      status: 'error', 
      message: `Failed to fetch category: ${e.message}` 
    });
  }
}];

// Create category validators
export const createCategoryValidators = [
  authenticate,
  checkPermission('manageCategories', 'create'),
  body('category').notEmpty().withMessage('Category name is required').trim(),
  body('description').optional().isString().trim()
];

// Create category
export const createCategory = [
  authenticate,
  checkPermission('manageCategory', 'create'),
  async (req: express.Request, res: express.Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
      return;
    }

    try {
      const { category, description } = req.body;
      const categoryRegex = createFlexibleRegex(category);
    
    const existingCategory = await Category.findOne({
      category: { $regex: categoryRegex }
    });

    if (existingCategory) {
      res.status(400).json({ status: 'error', message: `The category already exists.` });
      return;
    }

    const newCategory = await Category.create({
      category: category.trim(),
      description: description || undefined
    });

      res.status(201).json({
        status: 'success',
        message: 'Category created successfully',
        data: newCategory
      });
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: `Failed to create category: ${e.message}` });
    }
  }
];
// Update category validators
export const updateCategoryValidators = [
  authenticate,
  checkPermission('manageCategories', 'update'),
  param('id').isMongoId().withMessage('Invalid category ID'),
  body('category').optional().notEmpty().withMessage('Category name cannot be empty').trim(),
  body('description').optional().isString().trim()
];

// Update category
export const updateCategory = async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { category, description } = req.body;

    const currentCat = await Category.findById(id);
    if (!currentCat) {
      res.status(404).json({ status: 'error', message: 'Category not found' });
      return;
    }

    if (category) {
      const categoryRegex = createFlexibleRegex(category);
      const duplicateCategory = await Category.findOne({
        _id: { $ne: id },
        category: { $regex: categoryRegex }
      });

      if (duplicateCategory) {
        res.status(400).json({ status: 'error', message: 'The category already exists' });
        return;
      }
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      {
        category: category ? category.trim() : currentCat.category,
        description: description !== undefined ? description : currentCat.description
      },
      { new: true }
    );

    res.json({ status: 'success', message: 'Category updated successfully', data: updatedCategory });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message });
  }
};
// Delete category validators
export const deleteCategoryValidators = [authenticate, checkPermission('manageCategories', 'delete')];

// Delete category
export const deleteCategory = async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    
    console.log('Deleting category:', id);
    
    const category = await Category.findById(id);
    if (!category) {
      res.status(404).json({ 
        status: 'error', 
        message: 'Category not found' 
      });
      return;
    }

    // Check if any products are assigned to this category
    // Since category is stored as a string name in Product model
    const productsUsingCategory = await Product.findOne({ category: category.category });
    
    if (productsUsingCategory) {
      res.status(400).json({
        status: 'error',
        message: 'Cannot delete category because it is assigned to one or more products. Please reassign the products to another category first.'
      });
      return;
    }

    await Category.findByIdAndDelete(id);
    console.log('Category deleted successfully:', id);
    
    res.json({ 
      status: 'success', 
      message: 'Category deleted successfully' 
    });
  } catch (e: any) {
    console.error('Error deleting category:', e);
    
    res.status(500).json({ 
      status: 'error', 
      message: `Failed to delete category: ${e.message}` 
    });
  }
};

// Check if category is in use
export const checkCategoryInUse = async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const category = await Category.findById(id);
    
    if (!category) {
      res.status(404).json({ 
        status: 'error', 
        message: 'Category not found' 
      });
      return;
    }

    const productsUsingCategory = await Product.findOne({ category: category.category });
    
    res.json({
      status: 'success',
      isInUse: !!productsUsingCategory,
      productName: productsUsingCategory ? (productsUsingCategory as any).name : null
    });
  } catch (e: any) {
    res.status(500).json({ 
      status: 'error', 
      message: `Failed to check category: ${e.message}` 
    });
  }
};
