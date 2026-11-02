import { Request, Response } from 'express';
import Unit from '../../models/Unit';
import KitchenUnitConversion from '../../models/KitchenUnitConversion';
import { authenticate, AuthRequest } from '../../middleware/auth';

export const getConversions = [
  authenticate,
  async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
      const conversions = await KitchenUnitConversion.find()
        .populate('fromUnitId', 'shortName unitName')
        .populate('toUnitId', 'shortName unitName')
        .lean();
      res.json({ status: 'success', data: conversions });
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message });
    }
  }
];

/** 
 * Automatically ensures common conversions exist based on short names.
 * This is a helper called during system initialization or on demand.
 */
export const seedCommonConversions = async (): Promise<void> => {
  const units = await Unit.find({ businessType: 'restaurant' }).lean();
  const findUnit = (short: string) => units.find(u => u.shortName.toLowerCase() === short.toLowerCase());

  const common = [
    { from: 'kg', to: 'g', factor: 1000 },
    { from: 'g', to: 'kg', factor: 0.001 },
    { from: 'l', to: 'ml', factor: 1000 },
    { from: 'liter', to: 'ml', factor: 1000 },
    { from: 'ml', to: 'l', factor: 0.001 }
  ];

  for (const c of common) {
    const from = findUnit(c.from);
    const to = findUnit(c.to);
    if (from && to) {
      await KitchenUnitConversion.findOneAndUpdate(
        { fromUnitId: from._id, toUnitId: to._id },
        { factor: c.factor },
        { upsert: true }
      );
    }
  }
};
