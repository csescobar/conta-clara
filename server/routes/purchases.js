import express from 'express';
import { requireAuth } from './auth.js';
import { selectPurchase } from '../services/card-purchases.js';

export function createPurchasesRouter({ pool, secureCookies = false }) {
  const router = express.Router();
  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAuth(pool, secureCookies));

  router.get('/', async (request, response, next) => {
    try {
      const result = await pool.query('SELECT id FROM card_purchases WHERE space_id = $1 ORDER BY purchase_on DESC, created_at DESC, id', [request.auth.spaceId]);
      const purchases = [];
      for (const { id } of result.rows) purchases.push(await selectPurchase(pool, request.auth.spaceId, id));
      return response.json({ purchases });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
