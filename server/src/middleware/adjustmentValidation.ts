import { body, param, query, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

/**
 * Validation middleware for creating inventory adjustments
 */
export const createAdjustmentValidators = [
  body('warehouseId')
    .notEmpty()
    .withMessage('Warehouse ID is required')
    .isMongoId()
    .withMessage('Invalid warehouse ID format'),
  body('warehouseName')
    .notEmpty()
    .withMessage('Warehouse name is required')
    .isString()
    .trim(),
  body('adjustmentType')
    .notEmpty()
    .withMessage('Adjustment type is required')
    .isIn(['Increase', 'Decrease'])
    .withMessage('Adjustment type must be either "Increase" or "Decrease"'),
  body('items')
    .isArray({ min: 1 })
    .withMessage('Items array is required and must have at least one item'),
  body('items.*.productId')
    .notEmpty()
    .withMessage('Product ID is required for each item')
    .isMongoId()
    .withMessage('Invalid product ID format'),
  body('items.*.adjustmentQuantity')
    .notEmpty()
    .withMessage('Adjustment quantity is required')
    .isFloat({ min: 0.01 })
    .withMessage('Adjustment quantity must be greater than zero'),
  body('reason')
    .notEmpty()
    .withMessage('Reason is required')
    .isIn(['damage', 'loss', 'stock_count', 'expired', 'other'])
    .withMessage('Invalid reason provided'),
  body('adjustmentDate')
    .optional()
    .custom((val) => !val || !isNaN(Date.parse(val)))
    .withMessage('Invalid date format'),
  body('items.*.variationName')
    .optional()
    .isString()
    .trim(),
  body('items.*.batchNumber')
    .optional()
    .isString()
    .trim(),
  body('reasonDetails')
    .optional()
    .isString()
    .trim(),
  body('referenceNumber')
    .optional()
    .isString()
    .trim(),
  body('notes')
    .optional()
    .isString()
    .trim(),
  body('status')
    .optional()
    .isIn(['Pending', 'Approved', 'Completed'])
    .withMessage('Status must be Pending, Approved, or Completed for new adjustments (cannot be Cancelled at creation time)'),
  body('createdBy')
    .optional()
    .isMongoId()
    .withMessage('Invalid user ID format'),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
      return;
    }
    next();
  }
];

/**
 * Validation middleware for approving adjustments
 */
export const approveAdjustmentValidators = [
  param('id')
    .isMongoId()
    .withMessage('Invalid adjustment ID'),
  body('approvedBy')
    .notEmpty()
    .withMessage('approvedBy field is required')
    .isMongoId()
    .withMessage('Invalid user ID format'),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
      return;
    }
    next();
  }
];

/**
 * Validation middleware for getting adjustments with filters
 */
export const getAdjustmentsValidators = [
  query('warehouseId')
    .optional()
    .isMongoId()
    .withMessage('Invalid warehouse ID format'),
  query('adjustmentType')
    .optional()
    .isIn(['Increase', 'Decrease'])
    .withMessage('Invalid adjustment type'),
  query('status')
    .optional()
    .isIn(['Pending', 'Approved', 'Completed', 'Cancelled'])
    .withMessage('Invalid status'),
  query('reason')
    .optional()
    .isIn(['damage', 'loss', 'stock_count', 'expired', 'other'])
    .withMessage('Invalid reason'),
  query('referenceNumber')
    .optional()
    .isString()
    .trim(),
  query('q')
    .optional()
    .isString()
    .trim(),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
      return;
    }
    next();
  }
];

/**
 * Validation middleware for getting single adjustment
 */
export const getAdjustmentByIdValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid adjustment ID'),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
      return;
    }
    next();
  }
];

/**
 * Validation middleware for updating adjustment
 */
export const updateAdjustmentValidators = [
  param('id')
    .isMongoId()
    .withMessage('Invalid adjustment ID'),
  body('warehouseId')
    .notEmpty()
    .withMessage('Warehouse ID is required')
    .isMongoId()
    .withMessage('Invalid warehouse ID format'),
  body('warehouseName')
    .notEmpty()
    .withMessage('Warehouse name is required')
    .isString()
    .trim(),
  body('adjustmentType')
    .notEmpty()
    .withMessage('Adjustment type is required')
    .isIn(['Increase', 'Decrease'])
    .withMessage('Adjustment type must be either "Increase" or "Decrease"'),
  body('items')
    .isArray({ min: 1 })
    .withMessage('Items array is required and must have at least one item'),
  body('items.*.productId')
    .notEmpty()
    .withMessage('Product ID is required for each item')
    .isMongoId()
    .withMessage('Invalid product ID format'),
  body('items.*.adjustmentQuantity')
    .notEmpty()
    .withMessage('Adjustment quantity is required')
    .isFloat({ min: 0.01 })
    .withMessage('Adjustment quantity must be greater than zero'),
  body('reason')
    .notEmpty()
    .withMessage('Reason is required')
    .isIn(['damage', 'loss', 'stock_count', 'expired', 'other'])
    .withMessage('Invalid reason provided'),
  body('adjustmentDate')
    .optional()
    .custom((val) => !val || !isNaN(Date.parse(val)))
    .withMessage('Invalid date format'),
  body('items.*.variationName')
    .optional()
    .isString()
    .trim(),
  body('items.*.batchNumber')
    .optional()
    .isString()
    .trim(),
  body('referenceNumber')
    .optional()
    .isString()
    .trim(),
  body('notes')
    .optional()
    .isString()
    .trim(),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
      return;
    }
    next();
  }
];

/**
 * Validation middleware for canceling adjustment
 */
export const cancelAdjustmentValidators = [
  param('id')
    .isMongoId()
    .withMessage('Invalid adjustment ID'),
  body('reason')
    .optional()
    .isString()
    .trim(),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
      return;
    }
    next();
  }
];

/**
 * Validation middleware for deleting adjustment
 */
export const deleteAdjustmentValidators = [
  param('id')
    .isMongoId()
    .withMessage('Invalid adjustment ID'),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
      return;
    }
    next();
  }
];

/**
 * Validation middleware for adjustment summary
 */
export const getAdjustmentSummaryValidators = [
  query('warehouseId')
    .notEmpty()
    .withMessage('Warehouse ID is required')
    .isMongoId()
    .withMessage('Invalid warehouse ID format'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format'),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
      return;
    }
    next();
  }
];
