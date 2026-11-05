//./POS_Backend/src/controllers/transfer/index.ts
import express from 'express';
import { body, validationResult } from 'express-validator';
import Transfer from '../../models/Transfer';
import { createStockTransfer, updateStockTransfer, TransferStockError } from '../../services/transferStock';
import { authenticate, authorize } from '../../middleware/auth';

function stockError(res: express.Response, error: unknown) {
  if (error instanceof TransferStockError) res.status(error.status).json({ status: 'error', message: error.message, ...(error.code ? { code: error.code } : {}), ...(error.review ? { review: error.review } : {}) });
  else res.status(503).json({ status: 'error', message: 'Transfer could not be confirmed. Refresh the saved transfer before retrying; completion requires a database transaction.' });
}

// Get transfer by ID
export const getTransferById = [authenticate, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const transfer = await Transfer.findById(req.params.id)
      .populate('fromWarehouse', 'name')
      .populate('toWarehouse', 'name');
    if (!transfer) {
      res.status(404).json({ status: 'error', message: 'Transfer not found' });
      return;
    }
    res.json({ status: 'success', data: transfer });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}];

// Get all transfers
export const getTransfers = [authenticate, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { q, fromWarehouse, toWarehouse, status } = req.query;
    const filter: any = {};

    if (q) filter.reference = { $regex: q, $options: 'i' };
    if (fromWarehouse) filter.fromWarehouse = fromWarehouse;
    if (toWarehouse) filter.toWarehouse = toWarehouse;
    if (status && status !== 'All Status') filter.status = status;

    const transfers = await Transfer.find(filter)
      .populate('fromWarehouse', 'name')
      .populate('toWarehouse', 'name')
      .sort({ createdAt: -1 });

    res.json({ 
      status: 'success', 
      data: transfers 
    });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}];

// Create transfer validators
export const createTransferValidators = [
  authenticate,
  authorize('admin'),
  body('fromWarehouse').isMongoId(),
  body('toWarehouse').isMongoId(),
  body('fromWarehouseName').notEmpty(),
  body('toWarehouseName').notEmpty(),
  body('items').isArray({ min: 1 }),
  body('items.*.productId').isMongoId(),
  body('items.*.qty').isNumeric().custom(v => v > 0),
  body('items.*.cost').isNumeric(),
  body('items.*.subtotal').isNumeric()
];

// Create transfer
export const createTransfer = async (req: express.Request, res: express.Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ status: 'error', errors: errors.array() }); return; }
  try {
    const transfer = await createStockTransfer(req.body);
    res.status(201).json({ status: 'success', message: 'Transfer created — ' + transfer.status, data: transfer });
  } catch (error) { stockError(res, error); }
};

// Update transfer validators
export const updateTransferValidators = createTransferValidators;

// Update transfer
export const updateTransfer = async (req: express.Request, res: express.Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ status: 'error', errors: errors.array() }); return; }
  try { res.json({ status: 'success', data: await updateStockTransfer(req.params.id, req.body) }); }
  catch (error) { stockError(res, error); }
};

// Delete transfer
export const deleteTransfer = [authenticate, authorize('admin'), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const transfer = await Transfer.findById(id);
    if (!transfer) {
      res.status(404).json({ status: 'error', message: 'Transfer not found' });
      return;
    }

    // Optional: Revert inventory if status was 'Completed'
    // For now, just delete as requested for simplicity
    
    await Transfer.findByIdAndDelete(id);
    res.json({ status: 'success', message: 'Transfer deleted successfully' });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}];
