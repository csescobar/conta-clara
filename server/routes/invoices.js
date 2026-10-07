import express from 'express';
import { requireAuth } from './auth.js';
import { isInvoiceMonth, listCardInvoices } from '../services/card-invoices.js';

export function createInvoicesRouter({ pool, secureCookies = false }) {
  const router = express.Router();
  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAuth(pool, secureCookies));

  router.get('/', async (request, response, next) => {
    const month = request.query.month ?? null;
    if (month !== null && (typeof month !== 'string' || !isInvoiceMonth(month))) {
      return response.status(400).json({ error: 'Informe o mês de vencimento no formato AAAA-MM.' });
    }
    try {
      const invoices = await listCardInvoices(pool, { spaceId: request.auth.spaceId, month });
      return response.json({ invoices });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
