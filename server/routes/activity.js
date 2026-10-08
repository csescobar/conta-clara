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
    const offsetValue = request.query.offset ?? '0';
    if (typeof offsetValue !== 'string' || !/^\d+$/.test(offsetValue) || !Number.isSafeInteger(Number(offsetValue))) {
      return response.status(400).json({ error: 'Informe um deslocamento válido para o histórico.' });
    }
    try {
      const result = await pool.query(
        `
        SELECT id, entry_id, actor_user_id, actor_display_name AS actor_name,
          action, entry_kind, entry_description, occurred_at, details
        FROM financial_entry_audit
        WHERE space_id = $1
        ORDER BY occurred_at DESC, id DESC
        LIMIT 101 OFFSET $2
      `,
        [request.auth.spaceId, Number(offsetValue)],
      );
      const events = result.rows.slice(0, 100);
      return response.json({ events, hasMore: result.rows.length > 100, nextOffset: Number(offsetValue) + events.length });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
