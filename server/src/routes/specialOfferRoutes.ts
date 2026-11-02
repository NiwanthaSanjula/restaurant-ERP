import express from 'express';
import {
  createOffer,
  deleteOffer,
  getOffers,
  updateOffer
} from '../controllers/specialOfferController';
import { authenticate } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';

const router = express.Router();

router.get('/', authenticate, getOffers);

router.post('/', authenticate, checkPermission('manageSpecialOffers', 'create'), createOffer);

router.put('/:id', authenticate, checkPermission('manageSpecialOffers', 'update'), updateOffer);

router.delete('/:id', authenticate, checkPermission('manageSpecialOffers', 'delete'), deleteOffer);

export default router;