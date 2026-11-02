import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body, param, query, validationResult } from 'express-validator';
import Order from '../../models/Order';
import Table from '../../models/Table';
import MenuItem from '../../models/MenuItem';
import { authenticate, AuthRequest } from '../../middleware/auth';

const ORDER_STATUSES = ['pending', 'preparing', 'ready', 'served', 'cancelled'] as const;
const PAYMENT_STATUSES = ['pending', 'paid', 'refunded'] as const;

function calculateOrderTotals(items: Array<{ quantity: number; price: number }>, tax: number) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  return {
    subtotal,
    tax,
    total: Math.max(0, subtotal + tax)
  };
}

export const createOrderValidators = [
  authenticate,
  body('tableNumber').isInt({ min: 1 }).withMessage('Table number is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one order item is required'),
  body('items.*.menuItem').trim().notEmpty().withMessage('Menu item ID is required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('items.*.price').isFloat({ min: 0 }).withMessage('Item price must be greater than or equal to 0'),
  body('status').optional().isIn(ORDER_STATUSES).withMessage('Invalid order status'),
  body('paymentStatus').optional().isIn(PAYMENT_STATUSES).withMessage('Invalid payment status'),
  body('paymentMethod').optional().isIn(['cash', 'card', 'digital']).withMessage('Invalid payment method'),
  body('tax').optional().isFloat({ min: 0 }).withMessage('Tax must be greater than or equal to 0'),
  body('customerName').optional().trim().isLength({ max: 100 }).withMessage('Customer name is too long'),
  body('customerPhone').optional().trim().isLength({ max: 20 }).withMessage('Customer phone is too long'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes are too long')
];

export const updateOrderStatusValidators = [
  authenticate,
  param('id').isMongoId().withMessage('Invalid order ID'),
  body('status').trim().isIn(ORDER_STATUSES).withMessage('Invalid order status')
];

export const getOrders = [
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        status,
        tableNumber,
        date,
        dateEnd,
        page = '1',
        limit = '50'
      } = req.query as {
        status?: string;
        tableNumber?: string;
        date?: string;
        dateEnd?: string;
        page?: string;
        limit?: string;
      };

      const filter: any = {};
      if (status) filter.status = status;
      if (tableNumber) filter.tableNumber = Number(tableNumber);

      if (date || dateEnd) {
        const start = date ? new Date(date) : new Date(dateEnd as string);
        const end = dateEnd ? new Date(dateEnd) : new Date(date as string);
        filter.createdAt = {
          $gte: new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0),
          $lte: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999)
        };
      }

      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const skip = (pageNum - 1) * limitNum;

      const [orders, total] = await Promise.all([
        Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
        Order.countDocuments(filter)
      ]);

      res.json({
        status: 'success',
        data: orders,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      });
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to fetch orders' });
    }
  }
];

export const getOrderById = [
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const order = await Order.findById(req.params.id).lean();
      if (!order) {
        res.status(404).json({ status: 'error', message: 'Order not found' });
        return;
      }
      res.json({ status: 'success', data: order });
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to fetch order' });
    }
  }
];

export const createOrder = [
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ status: 'error', message: errors.array()[0].msg });
        return;
      }

      const {
        tableNumber,
        items,
        status = 'pending',
        paymentStatus = 'pending',
        paymentMethod,
        customerName,
        customerPhone,
        notes,
        tax = 0
      } = req.body as {
        tableNumber: number;
        items: Array<{ menuItem: string; quantity: number; price: number; specialInstructions?: string }>;
        status?: typeof ORDER_STATUSES[number];
        paymentStatus?: typeof PAYMENT_STATUSES[number];
        paymentMethod?: 'cash' | 'card' | 'digital';
        customerName?: string;
        customerPhone?: string;
        notes?: string;
        tax?: number;
      };

      const parsedTableNumber = Number(tableNumber);
      const parsedTax = Number(tax || 0);

      const table = await Table.findOne({ tableNumber: parsedTableNumber, isActive: true });
      if (!table) {
        res.status(404).json({ status: 'error', message: 'Table not found' });
        return;
      }

      if (table.status === 'occupied' && table.currentOrder) {
        res.status(400).json({ status: 'error', message: 'Table is already occupied' });
        return;
      }

      const menuItemIds = items.map((item) => item.menuItem);
      const menuItems = await MenuItem.find({ _id: { $in: menuItemIds } }).lean();
      if (menuItems.length !== new Set(menuItemIds).size) {
        res.status(400).json({ status: 'error', message: 'One or more menu items are invalid' });
        return;
      }

      const normalizedItems = items.map((item) => ({
        menuItem: item.menuItem,
        quantity: Number(item.quantity),
        price: Number(item.price),
        specialInstructions: item.specialInstructions?.trim() || undefined
      }));

      const totals = calculateOrderTotals(normalizedItems, parsedTax);

      const authUser = req.user;
      if (!authUser || !authUser._id || !mongoose.Types.ObjectId.isValid(String(authUser._id))) {
        res.status(401).json({ status: 'error', message: 'Authenticated user is required' });
        return;
      }

      const order = await Order.create({
        tableNumber,
        items: normalizedItems,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        status,
        paymentStatus,
        paymentMethod,
        customerName,
        customerPhone,
        notes,
        servedBy: new mongoose.Types.ObjectId(String(authUser._id))
      });

      try {
        await Table.findOneAndUpdate(
          { tableNumber, isActive: true },
          { status: 'occupied', currentOrder: order._id }
        );
      } catch (tableError: any) {
        await Order.deleteOne({ _id: order._id });
        res.status(500).json({ status: 'error', message: tableError.message || 'Failed to assign table' });
        return;
      }

      res.status(201).json({ status: 'success', message: 'Order created successfully', data: order });
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to create order' });
    }
  }
];

export const updateOrderStatus = [
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ status: 'error', message: errors.array()[0].msg });
        return;
      }

      const { status } = req.body as { status: typeof ORDER_STATUSES[number] };
      const order = await Order.findById(req.params.id);
      if (!order) {
        res.status(404).json({ status: 'error', message: 'Order not found' });
        return;
      }

      if (order.status === status) {
        res.json({ status: 'success', message: 'Order status already set', data: order });
        return;
      }

      const previousStatus = order.status;
      order.status = status;
      await order.save();

      if (['served', 'cancelled'].includes(status)) {
        await Table.findOneAndUpdate(
          { tableNumber: order.tableNumber, currentOrder: order._id },
          { status: 'available', $unset: { currentOrder: '' } }
        );
      }

      res.json({ status: 'success', message: 'Order status updated successfully', data: order });
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to update order status' });
    }
  }
];
