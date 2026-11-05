import { Request, Response } from 'express';
import Currency from '../models/Currency';
import { AuthRequest } from '../middleware/auth';

export const getCurrencies = async (req: Request, res: Response) => {
  try {
    let currencies = await Currency.find({ isActive: true }).sort({ code: 1 });

    if (!currencies.length && !(req as AuthRequest).isDemo) {
      const defaults = [
        { name: 'Sri Lankan Rupee', code: 'LKR', symbol: 'Rs.' },
        { name: 'US Dollar', code: 'USD', symbol: '$' },
        { name: 'Euro', code: 'EUR', symbol: 'EUR' }
      ];

      await Currency.insertMany(defaults, { ordered: false });
      currencies = await Currency.find({ isActive: true }).sort({ code: 1 });
    }

    return res.status(200).json({ success: true, data: currencies });
  } catch (error: any) {
    if (error?.code === 11000) {
      const currencies = await Currency.find({ isActive: true }).sort({ code: 1 });
      return res.status(200).json({ success: true, data: currencies });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const createCurrency = async (req: Request, res: Response) => {
  try {
    const { name, code, symbol } = req.body as { name?: string; code?: string; symbol?: string };

    if (!name || !code || !symbol) {
      return res.status(400).json({ success: false, message: 'Currency name, code and symbol are required' });
    }

    const normalizedCode = code.toUpperCase().trim();
    const existing = await Currency.findOne({ code: normalizedCode });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Currency code already exists' });
    }

    const currency = await Currency.create({
      name: name.trim(),
      code: normalizedCode,
      symbol: symbol.trim()
    });

    return res.status(201).json({ success: true, message: 'Currency created successfully', data: currency });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
