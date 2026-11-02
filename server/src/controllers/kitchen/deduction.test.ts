import mongoose from 'mongoose';
import { validateKitchenStockForCompletedSale } from './deduction';

const mocks = {
  productFindById: jest.fn(),
  recipeFindOne: jest.fn(),
  kitchenFind: jest.fn(),
  kitchenFindById: jest.fn()
};

jest.mock('../../models/Product', () => ({
  __esModule: true,
  default: { findById: (...a: unknown[]) => mocks.productFindById(...a) }
}));

jest.mock('../../models/KitchenRecipe', () => ({
  __esModule: true,
  default: { findOne: (...a: unknown[]) => mocks.recipeFindOne(...a) }
}));

jest.mock('../../models/KitchenInventoryProduct', () => ({
  __esModule: true,
  default: {
    find: (...a: unknown[]) => mocks.kitchenFind(...a),
    findById: (...a: unknown[]) => mocks.kitchenFindById(...a)
  }
}));

jest.mock('../../models/KitchenStockMovement', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    create: jest.fn(),
    deleteOne: jest.fn(),
    find: jest.fn(),
    deleteMany: jest.fn()
  }
}));

jest.mock('../../models/Sale', () => ({
  __esModule: true,
  default: { findById: jest.fn(), findByIdAndUpdate: jest.fn() }
}));

function chainLean<T>(doc: T | null) {
  return {
    select: () => ({
      lean: jest.fn().mockResolvedValue(doc)
    })
  };
}

describe('validateKitchenStockForCompletedSale', () => {
  const pid = new mongoose.Types.ObjectId().toHexString();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not load recipes for kitchen inventory products (isInventory true)', async () => {
    mocks.productFindById.mockReturnValue(chainLean({ isInventory: true, name: 'Raw rice' }));

    await validateKitchenStockForCompletedSale([{ productId: pid, qty: 3 }]);

    expect(mocks.recipeFindOne).not.toHaveBeenCalled();
  });

  it('throws when a prepared product has no recipe', async () => {
    mocks.productFindById.mockReturnValue(chainLean({ isInventory: false, name: 'Combo meal' }));
    mocks.recipeFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null)
    });

    await expect(
      validateKitchenStockForCompletedSale([{ productId: pid, qty: 1 }])
    ).rejects.toThrow(/No recipe configured/);
  });

  it('passes when kitchen stock covers recipe need', async () => {
    const kid = new mongoose.Types.ObjectId();
    mocks.productFindById.mockReturnValue(chainLean({ isInventory: false, name: 'Rice plate' }));
    mocks.recipeFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        ingredients: [{ kitchenProductId: kid, quantity: 100, unit: 'g' }]
      })
    });
    mocks.kitchenFind.mockReturnValue({
      populate: () => ({
        lean: jest.fn().mockResolvedValue([
          { _id: kid, name: 'Rice', unitId: { shortName: 'g' } }
        ])
      })
    });
    mocks.kitchenFindById.mockReturnValue(
      chainLean({ currentStock: 500, name: 'Rice' })
    );

    await expect(
      validateKitchenStockForCompletedSale([{ productId: pid, qty: 2 }])
    ).resolves.toBeUndefined();
  });

  it('throws when recipe has only non-positive ingredient quantities', async () => {
    const kid = new mongoose.Types.ObjectId();
    mocks.productFindById.mockReturnValue(chainLean({ isInventory: false, name: 'Bad recipe dish' }));
    mocks.recipeFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        ingredients: [{ kitchenProductId: kid, quantity: 0, unit: 'g' }]
      })
    });
    mocks.kitchenFind.mockReturnValue({
      populate: () => ({
        lean: jest.fn().mockResolvedValue([{ _id: kid, name: 'Rice', unitId: { shortName: 'g' } }])
      })
    });

    await expect(
      validateKitchenStockForCompletedSale([{ productId: pid, qty: 1 }])
    ).rejects.toThrow(/no valid ingredient quantities/);
  });

  it('throws when stock is below recipe need', async () => {
    const kid = new mongoose.Types.ObjectId();
    mocks.productFindById.mockReturnValue(chainLean({ isInventory: false, name: 'Rice plate' }));
    mocks.recipeFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        ingredients: [{ kitchenProductId: kid, quantity: 100, unit: 'g' }]
      })
    });
    mocks.kitchenFind.mockReturnValue({
      populate: () => ({
        lean: jest.fn().mockResolvedValue([
          { _id: kid, name: 'Rice', unitId: { shortName: 'g' } }
        ])
      })
    });
    mocks.kitchenFindById.mockReturnValue(
      chainLean({ currentStock: 50, name: 'Rice' })
    );

    await expect(
      validateKitchenStockForCompletedSale([{ productId: pid, qty: 2 }])
    ).rejects.toThrow(/Insufficient stock/);
  });
});
