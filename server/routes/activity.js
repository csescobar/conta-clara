import express from 'express';
import { requireAuth } from './auth.js';

export function createActivityRouter({ pool, secureCookies = false }) {
  const router = express.Router();
  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAuth(pool, secureCookies));

  router.get('/', async (request, response, next) => {
    try {
      const result = await pool.query(`
        SELECT id, entry_id, actor_user_id, actor_display_name AS actor_name,
          action, entry_kind, entry_description, occurred_at, details
        FROM financial_entry_audit
        WHERE space_id = $1
        ORDER BY occurred_at DESC, id DESC
        LIMIT 100
      `, [request.auth.spaceId]);
      return response.json({ events: result.rows });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
