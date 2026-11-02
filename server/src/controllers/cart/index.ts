import { Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import Cart from '../../models/Cart';
import Product from '../../models/Product';
import { authenticate, AuthRequest } from '../../middleware/auth';

// Type definitions for product structures (same as sale controller)
interface IVariation {
  productQty?: number;
  productPrice?: number;
  productCost?: number;
  orderTax?: number;
  [key: string]: any;
}

interface IBatch {
  batchNumber?: string;
  productQty?: number;
  productPrice?: number;
  productCost?: number;
  variationValues?: Map<string, IVariation> | Record<string, IVariation>;
  [key: string]: any;
}

interface IWarehouse {
  productQty?: number;
  productPrice?: number;
  productCost?: number;
  batches?: IBatch[];
  variationValues?: Map<string, IVariation> | Record<string, IVariation>;
  [key: string]: any;
}

// Helper function to get stock quantity for a product
function getStockQuantity(product: any, warehouseId: string, variation?: { id: string; name: string }): number {
  const warehouseDataRaw = product.warehouse?.get?.(warehouseId);
  if (!warehouseDataRaw) return 0;

  const warehouseData = warehouseDataRaw as unknown as IWarehouse;

  // For variation products, check variationValues
  if (variation && warehouseData.variationValues) {
    const variationValues = warehouseData.variationValues instanceof Map
      ? warehouseData.variationValues
      : new Map<string, IVariation>(Object.entries(warehouseData.variationValues || {}));
    
    // Try to match variation by name or id
    for (const [key, val] of variationValues) {
      if (key.includes(variation.name) || key.includes(variation.id)) {
        return val.productQty || 0;
      }
    }
  }

  // For single products or if no variation match, use warehouse-level quantity
  return warehouseData.productQty || 0;
}

// Get user's cart
export const getCart = [
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ status: 'error', message: 'User not authenticated' });
        return;
      }

      const userId = req.user._id.toString();
      const { sessionId } = req.query as { sessionId?: string };

      const cart = await Cart.findOne({
        userId,
        ...(sessionId && { sessionId })
      }).sort({ updatedAt: -1 }); // Get most recent cart

      if (!cart) {
        // Return empty cart structure
        res.json({
          status: 'success',
          data: {
            items: [],
            discountType: 'fixed',
            discount: 0,
            shipping: 0
          }
        });
        return;
      }

      res.json({
        status: 'success',
        data: {
          items: cart.items,
          discountType: cart.discountType,
          discount: cart.discount,
          shipping: cart.shipping
        }
      });
    } catch (e: any) {
      console.error('Error fetching cart:', e);
      res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
  }
];

// Add item to cart validators
export const addToCartValidators = [
  authenticate,
  body('productId').trim().notEmpty().withMessage('Product ID is required'),
  body('productName').trim().notEmpty().withMessage('Product name is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be >= 0'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be >= 1'),
  body('cartKey').trim().notEmpty().withMessage('Cart key is required'),
  body('warehouseId').trim().notEmpty().withMessage('Warehouse ID is required'),
  body('image').optional().isString(),
  body('variation').optional().isObject(),
  body('variation.id').optional().isString(),
  body('variation.name').optional().isString(),
  body('variation.price').optional().isFloat({ min: 0 }),
  body('sessionId').optional().isString()
];

// Add item to cart
export const addToCart = [
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ status: 'error', message: errors.array()[0].msg });
        return;
      }

      if (!req.user) {
        res.status(401).json({ status: 'error', message: 'User not authenticated' });
        return;
      }

      const userId = req.user._id.toString();
      const {
        productId,
        productName,
        price,
        quantity,
        image,
        variation,
        cartKey,
        warehouseId,
        sessionId
      } = req.body;

      // Check stock availability
      const product = await Product.findById(productId);
      if (!product) {
        res.status(404).json({ status: 'error', message: 'Product not found' });
        return;
      }

      const availableStock = getStockQuantity(product, warehouseId, variation);
      
      // Find or create cart
      let cart = await Cart.findOne({
        userId,
        ...(sessionId && { sessionId })
      });

      if (!cart) {
        cart = await Cart.create({
          userId,
          sessionId: sessionId || undefined,
          items: [],
          discountType: 'fixed',
          discount: 0,
          shipping: 0
        });
      }

      // Check if item already exists in cart
      const existingItemIndex = cart.items.findIndex(item => item.cartKey === cartKey);
      const currentQuantity = existingItemIndex >= 0 ? cart.items[existingItemIndex].quantity : 0;
      const newQuantity = currentQuantity + quantity;

      // Validate stock availability
      if (newQuantity > availableStock) {
        res.status(400).json({
          status: 'error',
          message: `Insufficient stock for ${productName}. Available: ${availableStock}, Requested: ${newQuantity}`
        });
        return;
      }

      if (existingItemIndex >= 0) {
        // Update quantity
        cart.items[existingItemIndex].quantity = newQuantity;
      } else {
        // Add new item
        cart.items.push({
          productId,
          productName,
          price,
          quantity,
          image,
          variation,
          cartKey
        });
      }

      await cart.save();

      res.json({
        status: 'success',
        message: 'Item added to cart',
        data: {
          items: cart.items,
          discountType: cart.discountType,
          discount: cart.discount,
          shipping: cart.shipping
        }
      });
    } catch (e: any) {
      console.error('Error adding to cart:', e);
      res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
  }
];

// Update cart item quantity validators
export const updateCartItemValidators = [
  authenticate,
  body('cartKey').trim().notEmpty().withMessage('Cart key is required'),
  body('quantity').isInt({ min: 0 }).withMessage('Quantity must be >= 0'),
  body('warehouseId').trim().notEmpty().withMessage('Warehouse ID is required'),
  body('sessionId').optional().isString()
];

// Update cart item quantity
export const updateCartItem = [
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ status: 'error', message: errors.array()[0].msg });
        return;
      }

      if (!req.user) {
        res.status(401).json({ status: 'error', message: 'User not authenticated' });
        return;
      }

      const userId = req.user._id.toString();
      const { cartKey, quantity, warehouseId, sessionId } = req.body;

      const cart = await Cart.findOne({
        userId,
        ...(sessionId && { sessionId })
      });

      if (!cart) {
        res.status(404).json({ status: 'error', message: 'Cart not found' });
        return;
      }

      if (quantity === 0) {
        // Remove item
        cart.items = cart.items.filter(item => item.cartKey !== cartKey);
      } else {
        // Update quantity - check stock first
        const itemIndex = cart.items.findIndex(item => item.cartKey === cartKey);
        if (itemIndex < 0) {
          res.status(404).json({ status: 'error', message: 'Item not found in cart' });
          return;
        }

        const cartItem = cart.items[itemIndex];
        
        // Check stock availability
        const product = await Product.findById(cartItem.productId);
        if (!product) {
          res.status(404).json({ status: 'error', message: 'Product not found' });
          return;
        }

        const availableStock = getStockQuantity(product, warehouseId, cartItem.variation);
        
        // Validate stock availability
        if (quantity > availableStock) {
          res.status(400).json({
            status: 'error',
            message: `Insufficient stock for ${cartItem.productName}. Available: ${availableStock}, Requested: ${quantity}`
          });
          return;
        }

        cart.items[itemIndex].quantity = quantity;
      }

      await cart.save();

      res.json({
        status: 'success',
        message: 'Cart updated',
        data: {
          items: cart.items,
          discountType: cart.discountType,
          discount: cart.discount,
          shipping: cart.shipping
        }
      });
    } catch (e: any) {
      console.error('Error updating cart:', e);
      res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
  }
];

// Remove item from cart validators
export const removeCartItemValidators = [
  authenticate,
  param('cartKey').trim().notEmpty().withMessage('Cart key is required')
];

// Remove item from cart
export const removeCartItem = [
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ status: 'error', message: 'User not authenticated' });
        return;
      }

      const userId = req.user._id.toString();
      const { cartKey } = req.params;
      const { sessionId } = req.query as { sessionId?: string };

      const cart = await Cart.findOne({
        userId,
        ...(sessionId && { sessionId })
      });

      if (!cart) {
        res.status(404).json({ status: 'error', message: 'Cart not found' });
        return;
      }

      cart.items = cart.items.filter(item => item.cartKey !== cartKey);
      await cart.save();

      res.json({
        status: 'success',
        message: 'Item removed from cart',
        data: {
          items: cart.items,
          discountType: cart.discountType,
          discount: cart.discount,
          shipping: cart.shipping
        }
      });
    } catch (e: any) {
      console.error('Error removing from cart:', e);
      res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
  }
];

// Update cart discount/shipping validators
export const updateCartSettingsValidators = [
  authenticate,
  body('discountType').optional().isIn(['fixed', 'percentage']).withMessage('Discount type must be fixed or percentage'),
  body('discount').optional().isFloat({ min: 0 }).withMessage('Discount must be >= 0'),
  body('shipping').optional().isFloat({ min: 0 }).withMessage('Shipping must be >= 0'),
  body('sessionId').optional().isString()
];

// Update cart discount/shipping
export const updateCartSettings = [
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ status: 'error', message: errors.array()[0].msg });
        return;
      }

      if (!req.user) {
        res.status(401).json({ status: 'error', message: 'User not authenticated' });
        return;
      }

      const userId = req.user._id.toString();
      const { discountType, discount, shipping, sessionId } = req.body;

      let cart = await Cart.findOne({
        userId,
        ...(sessionId && { sessionId })
      });

      if (!cart) {
        // Create cart if it doesn't exist
        cart = await Cart.create({
          userId,
          sessionId: sessionId || undefined,
          items: [],
          discountType: discountType || 'fixed',
          discount: discount || 0,
          shipping: shipping || 0
        });
      } else {
        if (discountType !== undefined) cart.discountType = discountType;
        if (discount !== undefined) cart.discount = discount;
        if (shipping !== undefined) cart.shipping = shipping;
        await cart.save();
      }

      res.json({
        status: 'success',
        message: 'Cart settings updated',
        data: {
          items: cart.items,
          discountType: cart.discountType,
          discount: cart.discount,
          shipping: cart.shipping
        }
      });
    } catch (e: any) {
      console.error('Error updating cart settings:', e);
      res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
  }
];

// Clear cart validators
export const clearCartValidators = [
  authenticate
];

// Clear cart
export const clearCart = [
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ status: 'error', message: 'User not authenticated' });
        return;
      }

      const userId = req.user._id.toString();
      const { sessionId } = req.query as { sessionId?: string };

      const cart = await Cart.findOne({
        userId,
        ...(sessionId && { sessionId })
      });

      if (!cart) {
        res.status(404).json({ status: 'error', message: 'Cart not found' });
        return;
      }

      cart.items = [];
      cart.discount = 0;
      cart.shipping = 0;
      await cart.save();

      res.json({
        status: 'success',
        message: 'Cart cleared',
        data: {
          items: [],
          discountType: cart.discountType,
          discount: 0,
          shipping: 0
        }
      });
    } catch (e: any) {
      console.error('Error clearing cart:', e);
      res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
  }
];
