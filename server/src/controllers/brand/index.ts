import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticate } from '../../middleware/auth';
import { checkPermission } from '../../middleware/permissions';
import Brand from '../../models/Brand';
import Product from '../../models/Product';
import { createFlexibleRegex } from '../../utils/regex';

// Get all brands
export const getBrands = [authenticate, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const q = (req.query.q as string) || '';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const filter: any = q ? { brandName: { $regex: q, $options: 'i' } } : {};
    
    const [brands, total] = await Promise.all([
      Brand.find(filter)
        .select('brandName description createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Brand.countDocuments(filter)
    ]);

    res.json({ 
      status: 'success', 
      data: brands,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (e: any) {
    console.error('Error fetching brands:', e);
    res.status(500).json({ 
      status: 'error', 
      message: `Failed to fetch brands: ${e.message}` 
    });
  }
}];

// Get brand by ID
export const getBrandById = [authenticate, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const brand = await Brand.findById(id);
    
    if (!brand) {
      res.status(404).json({ 
        status: 'error', 
        message: 'Brand not found' 
      });
      return;
    }

    res.json({ 
      status: 'success', 
      data: brand 
    });
  } catch (e: any) {
    console.error('Error fetching brand:', e);
    res.status(500).json({ 
      status: 'error', 
      message: `Failed to fetch brand: ${e.message}` 
    });
  }
}];

// Create brand validators
export const createBrandValidators = [
  authenticate,
  checkPermission('manageBrands', 'create'),
  body('brandName').notEmpty().withMessage('Brand name is required').trim(),
  body('description').optional().isString().trim()
];

// Create brand
export const createBrand = [
  authenticate,
  checkPermission('manageBrands', 'create'),
  async (req: express.Request, res: express.Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
      return;
    }

    try {
      const { brandName, description } = req.body;
     const brandRegex = createFlexibleRegex(brandName);
    
    const existingBrand = await Brand.findOne({
      brandName: { $regex: brandRegex }
    });

    if (existingBrand) {
      res.status(400).json({ status: 'error', message: `The brand name already exists.` });
      return;
    }

    const newBrand = await Brand.create({
      brandName: brandName.trim(),
      description: description || undefined
    });

      res.status(201).json({
        status: 'success',
        message: 'Brand created successfully',
        data: newBrand
      });
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: `Failed to create brand: ${e.message}` });
    }
  }
];

// Update brand validators
export const updateBrandValidators = [
  authenticate,
  checkPermission('manageBrands', 'update'),
  param('id').isMongoId().withMessage('Invalid brand ID'),
  body('brandName').optional().notEmpty().withMessage('Brand name cannot be empty').trim(),
  body('description').optional().isString().trim()
];

// Update brand
export const updateBrand = async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { brandName, description } = req.body;

    const existingBrand = await Brand.findById(id);
    if (!existingBrand) {
      res.status(404).json({ status: 'error', message: 'Brand not found' });
      return;
    }

    if (brandName) {
      const brandRegex = createFlexibleRegex(brandName);
      const duplicateBrand = await Brand.findOne({
        _id: { $ne: id },
        brandName: { $regex: brandRegex }
      });

      if (duplicateBrand) {
        res.status(400).json({ status: 'error', message: 'The brand name already exists (spacing/case mismatch)' });
        return;
      }
    }

    const updatedBrand = await Brand.findByIdAndUpdate(
      id,
      {
        brandName: brandName ? brandName.trim() : existingBrand.brandName,
        description: description !== undefined ? description : existingBrand.description
      },
      { new: true }
    );

    res.json({ status: 'success', message: 'Brand updated successfully', data: updatedBrand });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message });
  }
};
// Delete brand validators
export const deleteBrandValidators = [authenticate, checkPermission('manageBrands', 'delete')];

// Delete brand
export const deleteBrand = async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    
    console.log('Deleting brand:', id);
    
    const brand = await Brand.findById(id);
    if (!brand) {
      res.status(404).json({ 
        status: 'error', 
        message: 'Brand not found' 
      });
      return;
    }

    // Check if any products are assigned to this brand
    const productsUsingBrand = await Product.findOne({ brand: brand.brandName });
    if (productsUsingBrand) {
      res.status(400).json({
        status: 'error',
        message: 'Cannot delete brand because it is assigned to one or more products. Please reassign the products to another brand first.'
      });
      return;
    }

    await Brand.findByIdAndDelete(id);
    console.log('Brand deleted successfully:', id);
    
    res.json({ 
      status: 'success', 
      message: 'Brand deleted successfully' 
    });
  } catch (e: any) {
    console.error('Error deleting brand:', e);
    
    res.status(500).json({ 
      status: 'error', 
      message: `Failed to delete brand: ${e.message}` 
    });
  }
};

// Check if brand is in use
export const checkBrandInUse = async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const brand = await Brand.findById(id);
    
    if (!brand) {
      res.status(404).json({ 
        status: 'error', 
        message: 'Brand not found' 
      });
      return;
    }

    const productsUsingBrand = await Product.findOne({ brand: brand.brandName });
    
    res.json({
      status: 'success',
      isInUse: !!productsUsingBrand,
      productName: productsUsingBrand ? (productsUsingBrand as any).name : null
    });
  } catch (e: any) {
    res.status(500).json({ 
      status: 'error', 
      message: `Failed to check brand: ${e.message}` 
    });
  }
};
