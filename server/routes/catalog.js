import express from 'express';
import { requireAuth, requireCsrf } from './auth.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const categoryKinds = new Set(['income', 'expense', 'investment']);
const expenseClasses = new Set(['fixed', 'variable']);

function isUuid(value) {
  return typeof value === 'string' && uuidPattern.test(value);
}

function parseName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name.length > 0 && name.length <= 80 ? name : null;
}

function parseCategory(body) {
  const name = parseName(body?.name);
  const kind = body?.kind;
  const expenseClass = body?.expenseClass ?? null;
  if (!name || !categoryKinds.has(kind)) return null;
  if (kind === 'expense' && !expenseClasses.has(expenseClass)) return null;
  if (kind !== 'expense' && expenseClass !== null) return null;
  return { name, kind, expenseClass };
}

function sendCatalogError(error, response, next) {
  if (error.code === '23505') return response.status(409).json({ error: 'Já existe um cadastro ativo com este nome.' });
  return next(error);
}

export function createCatalogRouter({ pool, secureCookies = false, csrfSecret }) {
  const router = express.Router();
  const csrf = requireCsrf(csrfSecret);
  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAuth(pool, secureCookies));

  router.get('/categories', async (request, response, next) => {
    try {
      const includeArchived = request.query.includeArchived === 'true';
      const result = await pool.query(
        `
        SELECT id, name, kind, expense_class, archived_at, created_at
        FROM categories
        WHERE space_id = $1 AND ($2::boolean OR archived_at IS NULL)
        ORDER BY CASE kind WHEN 'income' THEN 1 WHEN 'expense' THEN 2 ELSE 3 END, lower(name)
      `,
        [request.auth.spaceId, includeArchived],
      );
      return response.json({ categories: result.rows });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/categories', csrf, async (request, response, next) => {
    const category = parseCategory(request.body);
    if (!category) return response.status(400).json({ error: 'Confira o nome, o tipo e a classificação da despesa.' });
    try {
      const result = await pool.query(
        `
        INSERT INTO categories (space_id, name, kind, expense_class)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, kind, expense_class, archived_at, created_at
      `,
        [request.auth.spaceId, category.name, category.kind, category.expenseClass],
      );
      return response.status(201).json({ category: result.rows[0] });
    } catch (error) {
      return sendCatalogError(error, response, next);
    }
  });

  router.put('/categories/:id', csrf, async (request, response, next) => {
    if (!isUuid(request.params.id)) return response.status(404).json({ error: 'Categoria não encontrada.' });
    const category = parseCategory(request.body);
    if (!category) return response.status(400).json({ error: 'Confira o nome, o tipo e a classificação da despesa.' });
    try {
      const current = await pool.query(
        `
        SELECT kind FROM categories
        WHERE id = $1 AND space_id = $2 AND archived_at IS NULL
      `,
        [request.params.id, request.auth.spaceId],
      );
      if (!current.rows[0]) return response.status(404).json({ error: 'Categoria não encontrada ou arquivada.' });
      if (current.rows[0].kind !== category.kind) {
        const referenced = await pool.query('SELECT 1 FROM financial_entries WHERE space_id = $1 AND category_id = $2 LIMIT 1', [
          request.auth.spaceId,
          request.params.id,
        ]);
        if (referenced.rowCount)
          return response
            .status(409)
            .json({ error: 'Não é possível alterar o tipo de uma categoria já usada em lançamentos; arquive-a para manter o histórico.' });
      }
      const result = await pool.query(
        `
        UPDATE categories SET name = $1, kind = $2, expense_class = $3
        WHERE id = $4 AND space_id = $5 AND archived_at IS NULL
        RETURNING id, name, kind, expense_class, archived_at, created_at
      `,
        [category.name, category.kind, category.expenseClass, request.params.id, request.auth.spaceId],
      );
      if (!result.rows[0]) return response.status(404).json({ error: 'Categoria não encontrada ou arquivada.' });
      return response.json({ category: result.rows[0] });
    } catch (error) {
      return sendCatalogError(error, response, next);
    }
  });

  router.post('/categories/:id/archive', csrf, async (request, response, next) => {
    if (!isUuid(request.params.id)) return response.status(404).json({ error: 'Categoria não encontrada.' });
    try {
      const result = await pool.query(
        `
        UPDATE categories SET archived_at = now()
        WHERE id = $1 AND space_id = $2 AND archived_at IS NULL
        RETURNING id
      `,
        [request.params.id, request.auth.spaceId],
      );
      if (!result.rowCount) return response.status(404).json({ error: 'Categoria não encontrada ou já arquivada.' });
      return response.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  router.post('/categories/:id/restore', csrf, async (request, response, next) => {
    if (!isUuid(request.params.id)) return response.status(404).json({ error: 'Categoria não encontrada.' });
    try {
      const result = await pool.query(
        `
        UPDATE categories SET archived_at = NULL
        WHERE id = $1 AND space_id = $2 AND archived_at IS NOT NULL
        RETURNING id
      `,
        [request.params.id, request.auth.spaceId],
      );
      if (!result.rowCount) return response.status(404).json({ error: 'Categoria não encontrada ou já ativa.' });
      return response.status(204).end();
    } catch (error) {
      return sendCatalogError(error, response, next);
    }
  });

  router.get('/payment-methods', async (request, response, next) => {
    try {
      const includeArchived = request.query.includeArchived === 'true';
      const result = await pool.query(
        `
        SELECT id, name, archived_at, created_at
        FROM payment_methods
        WHERE space_id = $1 AND ($2::boolean OR archived_at IS NULL)
        ORDER BY lower(name)
      `,
        [request.auth.spaceId, includeArchived],
      );
      return response.json({ paymentMethods: result.rows });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/payment-methods', csrf, async (request, response, next) => {
    const name = parseName(request.body?.name);
    if (!name) return response.status(400).json({ error: 'Informe um nome com até 80 caracteres.' });
    try {
      const result = await pool.query(
        `
        INSERT INTO payment_methods (space_id, name)
        VALUES ($1, $2)
        RETURNING id, name, archived_at, created_at
      `,
        [request.auth.spaceId, name],
      );
      return response.status(201).json({ paymentMethod: result.rows[0] });
    } catch (error) {
      return sendCatalogError(error, response, next);
    }
  });

  router.put('/payment-methods/:id', csrf, async (request, response, next) => {
    if (!isUuid(request.params.id)) return response.status(404).json({ error: 'Forma de pagamento não encontrada.' });
    const name = parseName(request.body?.name);
    if (!name) return response.status(400).json({ error: 'Informe um nome com até 80 caracteres.' });
    try {
      const result = await pool.query(
        `
        UPDATE payment_methods SET name = $1
        WHERE id = $2 AND space_id = $3 AND archived_at IS NULL
        RETURNING id, name, archived_at, created_at
      `,
        [name, request.params.id, request.auth.spaceId],
      );
      if (!result.rows[0]) return response.status(404).json({ error: 'Forma de pagamento não encontrada ou arquivada.' });
      return response.json({ paymentMethod: result.rows[0] });
    } catch (error) {
      return sendCatalogError(error, response, next);
    }
  });

  router.post('/payment-methods/:id/archive', csrf, async (request, response, next) => {
    if (!isUuid(request.params.id)) return response.status(404).json({ error: 'Forma de pagamento não encontrada.' });
    try {
      const result = await pool.query(
        `
        UPDATE payment_methods SET archived_at = now()
        WHERE id = $1 AND space_id = $2 AND archived_at IS NULL
        RETURNING id
      `,
        [request.params.id, request.auth.spaceId],
      );
      if (!result.rowCount) return response.status(404).json({ error: 'Forma de pagamento não encontrada ou já arquivada.' });
      return response.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  router.post('/payment-methods/:id/restore', csrf, async (request, response, next) => {
    if (!isUuid(request.params.id)) return response.status(404).json({ error: 'Forma de pagamento não encontrada.' });
    try {
      const result = await pool.query(
        `
        UPDATE payment_methods SET archived_at = NULL
        WHERE id = $1 AND space_id = $2 AND archived_at IS NOT NULL
        RETURNING id
      `,
        [request.params.id, request.auth.spaceId],
      );
      if (!result.rowCount) return response.status(404).json({ error: 'Forma de pagamento não encontrada ou já ativa.' });
      return response.status(204).end();
    } catch (error) {
      return sendCatalogError(error, response, next);
    }
  });

  return router;
}
