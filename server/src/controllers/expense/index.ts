import { Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import Expense from '../../models/Expense';
import ExpenseCategory from '../../models/ExpenseCategory';
import { authenticate, authorize, AuthRequest } from '../../middleware/auth';
import mongoose from 'mongoose';
import { buildZonedDateRange, parseDateInputAsZonedStart } from '../../utils/timezone';

// --- Expense Category Controllers ---

// Get all expense categories
export const getExpenseCategories = [authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const q = (req.query.q as string) || '';
    const filter: any = q ? { name: { $regex: q, $options: 'i' } } : {};
    const categories = await ExpenseCategory.find(filter)
      .sort({ createdAt: -1 });

    res.json({ 
      status: 'success', 
      data: categories 
    });
  } catch (e: any) {
    console.error('Error fetching expense categories:', e);
    res.status(500).json({ 
      status: 'error', 
      message: `Failed to fetch expense categories: ${e.message}` 
    });
  }
}];

// Get expense category by ID
export const getExpenseCategoryById = [authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const category = await ExpenseCategory.findById(req.params.id);
    if (!category) {
      res.status(404).json({ status: 'error', message: 'Category not found' });
      return;
    }
    res.json({ status: 'success', data: category });
  } catch (e: any) {
    console.error('Error fetching expense category:', e);
    res.status(500).json({ status: 'error', message: `Internal server error: ${e.message}` });
  }
}];

// Create expense category validators
export const createExpenseCategoryValidators = [
  authenticate,
  authorize('admin'),
  body('name').notEmpty().withMessage('Category name is required').trim(),
  body('description').optional().isString().trim()
];

// Update expense category validators
export const updateExpenseCategoryValidators = createExpenseCategoryValidators;

// Create expense category
export const createExpenseCategory = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ 
      status: 'error', 
      message: 'Validation failed',
      errors: errors.array() 
    });
    return;
  }

  try {
    const category = await ExpenseCategory.create(req.body);
    res.status(201).json({ 
      status: 'success', 
      message: 'Expense category created successfully',
      data: category 
    });
  } catch (e: any) {
    if (e.code === 11000 || (e.message && e.message.includes('E11000'))) {
      res.status(409).json({ 
        status: 'error', 
        message: 'This category name already exists. Please choose a different name.' 
      });
    } else {
      res.status(500).json({ 
        status: 'error', 
        message: `Failed to create expense category: ${e.message}` 
      });
    }
  }
};

// Update expense category
export const updateExpenseCategory = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 'error', errors: errors.array() });
    return;
  }

  try {
    const category = await ExpenseCategory.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!category) {
      res.status(404).json({ status: 'error', message: 'Category not found' });
      return;
    }
    res.json({ status: 'success', message: 'Category updated successfully', data: category });
  } catch (e: any) {
    if (e.code === 11000 || (e.message && e.message.includes('E11000'))) {
      res.status(409).json({
        status: 'error',
        message: 'This category name already exists. Please choose a different name.'
      });
      return;
    }
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// Delete expense category
export const deleteExpenseCategory = [authenticate, authorize('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const category = await ExpenseCategory.findById(id);
    if (!category) {
      res.status(404).json({ status: 'error', message: 'Category not found' });
      return;
    }

    // Check if any expenses are assigned to this category
    const expensesUsingCategory = await Expense.findOne({ category: id });
    if (expensesUsingCategory) {
      res.status(400).json({
        status: 'error',
        message: 'Cannot delete expense category because it is assigned to one or more expenses. Please reassign the expenses to another category first.'
      });
      return;
    }

    await ExpenseCategory.findByIdAndDelete(id);
    res.json({ status: 'success', message: 'Category deleted successfully' });
  } catch (e: any) {
    console.error('Error fetching expense category:', e);
    res.status(500).json({ status: 'error', message: `Internal server error: ${e.message}` });
  }
}];

// Check if expense category is in use (POS-162 / BUG-084)
export const checkExpenseCategoryInUse = [authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const category = await ExpenseCategory.findById(id);
    if (!category) {
      res.status(404).json({ status: 'error', message: 'Category not found' });
      return;
    }

    const expensesUsingCategory = await Expense.findOne({ category: id });
    res.json({
      status: 'success',
      isInUse: !!expensesUsingCategory,
      expenseTitle: expensesUsingCategory ? (expensesUsingCategory as any).title : null
    });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}];

// --- Expense Controllers ---

// Get expense by ID
export const getExpenseById = [authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const expense = await Expense.findById(req.params.id)
      .populate('category', 'name')
      .populate('warehouse', 'name')
      .populate('createdBy', 'name email');
    if (!expense) {
      res.status(404).json({ status: 'error', message: 'Expense not found' });
      return;
    }
    res.json({ status: 'success', data: expense });
  } catch (e: any) {
    console.error('Error in getExpenseById:', e);
    res.status(500).json({ status: 'error', message: `Internal server error: ${e.message}` });
  }
}];

// Get all expenses with filtering and summary
export const getExpenses = [authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      q, 
      category, 
      warehouse, 
      minAmount, 
      maxAmount, 
      startDate, 
      endDate 
    } = req.query;

    const filter: any = {};

    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { reference: { $regex: q, $options: 'i' } }
      ];
    }

    if (category) filter.category = category;
    if (warehouse) filter.warehouse = warehouse;
    
    if (minAmount || maxAmount) {
      filter.amount = {};
      if (minAmount) filter.amount.$gte = Number(minAmount);
      if (maxAmount) filter.amount.$lte = Number(maxAmount);
    }

    if (startDate || endDate) {
      const { start, end } = buildZonedDateRange(startDate as string | undefined, endDate as string | undefined);
      filter.date = { $gte: start, $lte: end };
    }

    const expenses = await Expense.find(filter)
      .populate('category', 'name')
      .populate('warehouse', 'name')
      .populate('createdBy', 'name email')
      .sort({ date: -1 });

    // Calculate Summary Stats
    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    
    const categoryBreakdown: Record<string, { amount: number, transactions: number }> = {};
    expenses.forEach(exp => {
      const catName = (exp.category as any)?.name || 'Uncategorized';
      if (!categoryBreakdown[catName]) {
        categoryBreakdown[catName] = { amount: 0, transactions: 0 };
      }
      categoryBreakdown[catName].amount += exp.amount;
      categoryBreakdown[catName].transactions += 1;
    });

    res.json({ 
      status: 'success', 
      data: expenses,
      summary: {
        totalExpenses,
        categoryBreakdown
      }
    });
  } catch (e: any) {
    console.error('Error in getExpenses:', e);
    res.status(500).json({ status: 'error', message: `Internal server error: ${e.message}` });
  }
}];

// Create expense validators
export const createExpenseValidators = [
  authenticate,
  authorize('admin'),
  body('date').notEmpty().withMessage('Date is required').isISO8601(),
  body('title').notEmpty().withMessage('Title is required').trim(),
  body('warehouse').isMongoId().withMessage('Invalid warehouse ID'),
  body('category').isMongoId().withMessage('Invalid category ID'),
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be at least 0.01')
    .custom((val) => {
      if (String(val).includes('.') && String(val).split('.')[1].length > 2) {
        throw new Error('Amount cannot have more than 2 decimal places');
      }
      return true;
    }),
  body('details').optional().isString().trim()
];

// Update expense validators
export const updateExpenseValidators = createExpenseValidators;

// Create expense
export const createExpense = async (req: AuthRequest, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ 
      status: 'error', 
      message: 'Validation failed',
      errors: errors.array() 
    });
    return;
  }

  try {
    if (!req.user) {
      res.status(401).json({ status: 'error', message: 'User not authenticated' });
      return;
    }

    const expenseData = { 
      ...req.body, 
      date: parseDateInputAsZonedStart(req.body.date),
      createdBy: req.user._id 
    };
    
    const expense = await Expense.create(expenseData);
    
    res.status(201).json({ 
      status: 'success', 
      message: 'Expense created successfully',
      data: expense 
    });
  } catch (e: any) {
    console.error('Error in createExpense:', e);
    res.status(500).json({ status: 'error', message: `Internal server error: ${e.message}` });
  }
};

// Update expense
export const updateExpense = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 'error', errors: errors.array() });
    return;
  }

  try {
    const allowed = ['date', 'title', 'warehouse', 'category', 'amount', 'details'];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (typeof updates.date === 'string') {
      updates.date = parseDateInputAsZonedStart(updates.date);
    }
    const expense = await Expense.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!expense) {
      res.status(404).json({ status: 'error', message: 'Expense not found' });
      return;
    }
    res.json({ status: 'success', message: 'Expense updated successfully', data: expense });
  } catch (e: any) {
    console.error('Error in updateExpense:', e);
    res.status(500).json({ status: 'error', message: `Internal server error: ${e.message}` });
  }
};

// Delete expense
export const deleteExpense = [authenticate, authorize('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const expense = await Expense.findById(id);
    if (!expense) {
      res.status(404).json({ status: 'error', message: 'Expense not found' });
      return;
    }
    await Expense.findByIdAndDelete(id);
    res.json({ status: 'success', message: 'Expense deleted successfully' });
  } catch (e: any) {
    console.error('Error in deleteExpense:', e);
    res.status(500).json({ status: 'error', message: `Internal server error: ${e.message}` });
  }
}];
