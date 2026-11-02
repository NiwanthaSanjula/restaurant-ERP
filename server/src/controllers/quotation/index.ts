import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import Customer from '../../models/Customer';
import Product from '../../models/Product';
import Quotation from '../../models/Quotation';
import Warehouse from '../../models/Warehouse';
import { buildZonedDateRange, parseDateInputAsZonedStart } from '../../utils/timezone';

// Validation middleware
export const quotationValidators = [
  body('warehouseId').notEmpty().withMessage('Warehouse is required'),
  body('customerId').notEmpty().withMessage('Customer is required'),
  body('date').isISO8601().withMessage('Valid date is required'),
  body('validUntil').isISO8601().withMessage('Validity date is required'),
  body('date').custom((date, { req }) => {
    const quotationDate = new Date(date);
    const expiryDate = new Date(req.body.validUntil);
    if (quotationDate > expiryDate) {
      throw new Error('Quotation created date cannot be later than the expiry date');
    }
    return true;
  }),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.productId').notEmpty().withMessage('Each item must have a product selected'),
  body('items.*.qty').isNumeric().custom(v => v > 0).withMessage('Quantity must be greater than zero'),
  body('items.*.price').isNumeric().withMessage('Price must be a number'),
  body('total').isNumeric().withMessage('Total must be a number')
];

export const createQuotationValidators = [
  ...quotationValidators,
  body('createdBy').notEmpty().withMessage('Creator is required')
];

// Create Quotation
export const createQuotation = async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ status: 'error', errors: errors.array() });
  }

  try {
    // Foreign key validation
    const { warehouseId, customerId, items } = req.body;
    const [warehouse, customer] = await Promise.all([
      Warehouse.findById(warehouseId),
      Customer.findById(customerId)
    ]);
    if (!warehouse) {
      return res.status(400).json({ status: 'error', message: 'Invalid warehouseId: warehouse does not exist.' });
    }
    if (!customer) {
      return res.status(400).json({ status: 'error', message: 'Invalid customerId: customer does not exist.' });
    }
    // Validate all productIds
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ status: 'error', message: 'At least one item is required.' });
    }
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(400).json({ status: 'error', message: `Invalid productId: product does not exist (${item.productId})` });
      }
    }
    const quotationId = `QTN-${Date.now()}`;
    const newQuotation = new Quotation({
      ...req.body,
      date: parseDateInputAsZonedStart(req.body.date),
      validUntil: parseDateInputAsZonedStart(req.body.validUntil),
      quotationId
    });
    await newQuotation.save();
    return res.status(201).json({ status: 'success', data: newQuotation });
  } catch (error: any) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

// Get all Quotations with filters
export const getQuotations = async (req: Request, res: Response) => {
  try {
    const { status, customerId, warehouseId, startDate, endDate, q } = req.query;
    const filter: any = {};

    if (status) filter.status = status;
    if (customerId) filter.customerId = customerId;
    if (warehouseId) filter.warehouseId = warehouseId;
    if (startDate || endDate) {
      const { start, end } = buildZonedDateRange(startDate as string | undefined, endDate as string | undefined);
      filter.date = { $gte: start, $lte: end };
    }
    if (q) {
      filter.$or = [
        { quotationId: { $regex: q, $options: 'i' } },
        { referenceNumber: { $regex: q, $options: 'i' } },
        { customerName: { $regex: q, $options: 'i' } }
      ];
    }

    const quotations = await Quotation.find(filter).sort({ createdAt: -1 });
    return res.json({ status: 'success', data: quotations });
  } catch (error: any) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

// Get single Quotation
export const getQuotationById = async (req: Request, res: Response) => {
  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) {
      return res.status(404).json({ status: 'error', message: 'Quotation not found' });
    }
    return res.json({ status: 'success', data: quotation });
  } catch (error: any) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

// Update Quotation
export const updateQuotation = async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ status: 'error', errors: errors.array() });
  }

  try {
    // Foreign key validation
    const { warehouseId, customerId, items } = req.body;
    if (warehouseId) {
      const warehouse = await Warehouse.findById(warehouseId);
      if (!warehouse) {
        return res.status(400).json({ status: 'error', message: 'Invalid warehouseId: warehouse does not exist.' });
      }
    }
    if (customerId) {
      const customer = await Customer.findById(customerId);
      if (!customer) {
        return res.status(400).json({ status: 'error', message: 'Invalid customerId: customer does not exist.' });
      }
    }
    if (Array.isArray(items)) {
      for (const item of items) {
        const product = await Product.findById(item.productId);
        if (!product) {
          return res.status(400).json({ status: 'error', message: `Invalid productId: product does not exist (${item.productId})` });
        }
      }
    }
    const quotation = await Quotation.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        ...(req.body.date && { date: parseDateInputAsZonedStart(req.body.date) }),
        ...(req.body.validUntil && { validUntil: parseDateInputAsZonedStart(req.body.validUntil) })
      },
      { new: true }
    );
    if (!quotation) {
      return res.status(404).json({ status: 'error', message: 'Quotation not found' });
    }
    return res.json({ status: 'success', data: quotation });
  } catch (error: any) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

// Delete Quotation
export const deleteQuotation = async (req: Request, res: Response) => {
  try {
    const quotation = await Quotation.findByIdAndDelete(req.params.id);
    if (!quotation) {
      return res.status(404).json({ status: 'error', message: 'Quotation not found' });
    }
    return res.json({ status: 'success', message: 'Quotation deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

// Bulk Delete Quotations
export const bulkDeleteQuotations = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ status: 'error', message: 'IDs array is required' });
    }

    await Quotation.deleteMany({ _id: { $in: ids } });
    return res.json({ status: 'success', message: 'Quotations deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

// Update Status
export const updateQuotationStatus = async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    // Only allow valid status values
    const allowedStatuses = ['Draft', 'Sent', 'Approved', 'Rejected', 'Expired', 'Converted'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ status: 'error', message: `Invalid status value. Allowed: ${allowedStatuses.join(', ')}` });
    }
    const quotation = await Quotation.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!quotation) {
      return res.status(404).json({ status: 'error', message: 'Quotation not found' });
    }
    return res.json({ status: 'success', data: quotation });
  } catch (error: any) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};
