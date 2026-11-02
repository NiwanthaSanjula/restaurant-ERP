import { Request, Response } from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../../middleware/auth';
import Product from '../../models/Product';
import Supplier from '../../models/Supplier';

export const getSuppliers = [
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const q = (req.query.q as string) || '';
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      
      const filter: any = {};
      
      // Search functionality - search by name or company name
      if (q) {
        filter.$or = [
          { name: { $regex: q, $options: 'i' } },
          { companyName: { $regex: q, $options: 'i' } }
        ];
      }
      
      // Date range filter for purchases
      const dateFilter: any = {};
      if (startDate) {
        dateFilter.$gte = new Date(startDate);
      }
      if (endDate) {
        dateFilter.$lte = new Date(endDate);
      }
      
      // Aggregate purchase data per supplier
      const purchaseMatch: any = { purchaseStatus: 'Received' };
      if (Object.keys(dateFilter).length > 0) {
        purchaseMatch.purchaseDate = dateFilter;
      }
      
      const suppliersWithStats = await Supplier.aggregate([
        { $match: filter },
        {
          $lookup: {
            from: 'purchases',
            let: { supplierId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$supplierId', '$$supplierId'] },
                  ...purchaseMatch
                }
              },
              {
                $group: {
                  _id: null,
                  purchaseCount: { $sum: 1 },
                  totalPurchaseAmount: { $sum: '$grandTotal' }
                }
              }
            ],
            as: 'purchaseStats'
          }
        },
        {
          $addFields: {
            purchaseCount: { $ifNull: [{ $arrayElemAt: ['$purchaseStats.purchaseCount', 0] }, 0] },
            totalPurchaseAmount: { $ifNull: [{ $arrayElemAt: ['$purchaseStats.totalPurchaseAmount', 0] }, 0] }
          }
        },
        { $project: { purchaseStats: 0 } },
        { $sort: { createdAt: -1 } }
      ]);
      
      res.json({ status: 'success', data: suppliersWithStats });
      return;
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to fetch suppliers' });
      return;
    }
  }
];

export const getSupplierById = [
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const found = await Supplier.findById(req.params.id);
      if (!found) { res.status(404).json({ status: 'error', message: 'Supplier not found' }); return; }
      res.json({ status: 'success', data: found });
      return;
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to fetch supplier' });
      return;
    }
  }
];

export const createSupplierValidators = [
  authenticate,
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('companyName').optional().isString().withMessage('Company Name must be a string'),
  body('mobile').optional().isString().withMessage('Mobile must be a string')
];

export const createSupplier = [
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, companyName, mobile } = req.body;
      const exists = await Supplier.findOne({ name }).collation({ locale: 'en', strength: 2 });
      if (exists) { res.status(409).json({ status: 'error', message: 'Supplier with this name already exists' }); return; }
      const created = await Supplier.create({ name, companyName, mobile });
      res.status(201).json({ status: 'success', message: 'Supplier created successfully', data: created });
      return;
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to create supplier' });
      return;
    }
  }
];

export const updateSupplierValidators = [
  authenticate,
  param('id').isMongoId().withMessage('Invalid supplier id'),
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('companyName').optional().isString(),
  body('mobile').optional().isString()
];

export const updateSupplier = [
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params as any;
      const payload: any = {};
      ['name', 'companyName', 'mobile'].forEach(k => {
        if (req.body[k] !== undefined) payload[k] = req.body[k];
      });
      if (payload.name) {
        const dup = await Supplier.findOne({ _id: { $ne: id }, name: payload.name }).collation({ locale: 'en', strength: 2 });
        if (dup) { res.status(409).json({ status: 'error', message: 'Another supplier with this name already exists' }); return; }
      }
      const updated = await Supplier.findByIdAndUpdate(id, payload, { new: true });
      if (!updated) { res.status(404).json({ status: 'error', message: 'Supplier not found' }); return; }
      res.json({ status: 'success', message: 'Supplier updated successfully', data: updated });
      return;
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to update supplier' });
      return;
    }
  }
];

export const deleteSupplierValidators = [
  authenticate,
  param('id').isMongoId().withMessage('Invalid supplier id')
];

export const deleteSupplier = [
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supplier = await Supplier.findById(req.params.id);
      if (!supplier) { res.status(404).json({ status: 'error', message: 'Supplier not found' }); return; }

      // Check if any products are assigned to this supplier
      const productsUsingSupplier = await Product.findOne({ supplier: supplier.name });
      if (productsUsingSupplier) {
        res.status(400).json({
          status: 'error',
          message: 'Cannot delete supplier because it is assigned to one or more products. Please reassign the products to another supplier first.'
        });
        return;
      }

      await Supplier.findByIdAndDelete(req.params.id);
      res.json({ status: 'success', message: 'Supplier deleted successfully' });
      return;
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to delete supplier' });
      return;
    }
  }
];

export const checkSupplierInUse = async (req: Request, res: Response): Promise<void> => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) { res.status(404).json({ status: 'error', message: 'Supplier not found' }); return; }

    const productsUsingSupplier = await Product.findOne({ supplier: supplier.name });
    res.json({
      status: 'success',
      isInUse: !!productsUsingSupplier,
      productName: productsUsingSupplier ? (productsUsingSupplier as any).name : null
    });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message || 'Failed to check supplier' });
  }
};
