import { Router } from 'express';
import { pool } from '../db.js';
import { fetchCheckoutSettings } from '../services/checkoutPricing.js';

const router = Router();

/** GET /api/checkout-settings — public; drives cart / checkout labels and fees */
router.get('/', async (_req, res) => {
  try {
    const s = await fetchCheckoutSettings(pool);
    res.json({
      priorityCourierFeeMyr: s.priorityCourierFeeMyr,
      courierFeeLabel: s.courierFeeLabel,
      sstServiceTaxRatePercent: s.sstServiceTaxRatePercent,
      taxBase: s.taxBase,
      taxDisplayLabel: s.taxDisplayLabel,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load checkout settings' });
  }
});

export default router;
