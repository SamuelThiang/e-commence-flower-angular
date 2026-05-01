/**
 * Payment routes — mount gateway-specific paths here (ToyyibPay today, iPay88 tomorrow).
 */
import express, { Router } from 'express';
import {
  postToyyibPayCallback,
  postToyyibPaySyncReturn,
} from '../controllers/paymentController.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

router.post(
  '/toyyibpay/callback',
  express.urlencoded({ extended: false }),
  postToyyibPayCallback,
);

router.post(
  '/toyyibpay/sync-return',
  requireAuth,
  postToyyibPaySyncReturn,
);

export default router;
