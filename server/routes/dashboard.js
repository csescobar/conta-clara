import express from 'express';
import { requireAuth } from './auth.js';
import { generateRecurrenceOccurrences } from '../services/recurrences.js';

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

function resultCents(income, expense, investment) {
  return (BigInt(income) - BigInt(expense) - BigInt(investment)).toString();
}

function extractList(result) {
  return {
    count: Number(result.rows[0]?.total_count ?? 0),
    entries: result.rows.map(({ total_count: _totalCount, ...entry }) => entry),
  };
}

export function createDashboardRouter({ pool, secureCookies = false }) {
  const router = express.Router();
  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAuth(pool, secureCookies));

  router.get('/', async (request, response, next) => {
    const requestedMonth = request.query.month;
    if (requestedMonth !== undefined && (typeof requestedMonth !== 'string' || !monthPattern.test(requestedMonth))) {
      return response.status(400).json({ error: 'Informe o mês no formato AAAA-MM.' });
    }
    try {
      await generateRecurrenceOccurrences(pool, { spaceId: request.auth.spaceId });
      const monthStart = requestedMonth
        ? `${requestedMonth}-01`
        : (await pool.query("SELECT to_char(date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS month_start"))
            .rows[0].month_start;

      const summaryResult = await pool.query(
        `
        SELECT
          COALESCE(SUM(planned_cents) FILTER (WHERE kind = 'income' AND competence_on >= $2::date AND competence_on < ($2::date + interval '1 month')), 0)::text AS planned_income_cents,
          COALESCE(SUM(planned_cents) FILTER (WHERE kind = 'expense' AND (
            (card_purchase_id IS NOT NULL AND due_on >= $2::date AND due_on < ($2::date + interval '1 month'))
            OR (card_purchase_id IS NULL AND competence_on >= $2::date AND competence_on < ($2::date + interval '1 month'))
          )), 0)::text AS planned_expense_cents,
          COALESCE(SUM(planned_cents) FILTER (WHERE kind = 'investment' AND competence_on >= $2::date AND competence_on < ($2::date + interval '1 month')), 0)::text AS planned_investment_cents,
          COALESCE(SUM(actual_cents) FILTER (WHERE kind = 'income' AND realized_on >= $2::date AND realized_on < ($2::date + interval '1 month')), 0)::text AS realized_income_cents,
          COALESCE(SUM(actual_cents) FILTER (WHERE kind = 'expense' AND realized_on >= $2::date AND realized_on < ($2::date + interval '1 month')), 0)::text AS realized_expense_cents,
          COALESCE(SUM(actual_cents) FILTER (WHERE kind = 'investment' AND realized_on >= $2::date AND realized_on < ($2::date + interval '1 month')), 0)::text AS realized_investment_cents
        FROM financial_entries
        WHERE space_id = $1 AND NOT recurrence_skipped
          AND (
            (competence_on >= $2::date AND competence_on < ($2::date + interval '1 month'))
            OR (card_purchase_id IS NOT NULL AND due_on >= $2::date AND due_on < ($2::date + interval '1 month'))
            OR (realized_on >= $2::date AND realized_on < ($2::date + interval '1 month'))
          )
      `,
        [request.auth.spaceId, monthStart],
      );

      const [upcomingResult, overdueResult, expenseCategoriesResult] = await Promise.all([
        pool.query(
          `
          SELECT count(*) OVER ()::integer AS total_count, id, description,
            competence_on::text AS competence_on, due_on::text AS due_on, planned_cents::text AS planned_cents
          FROM financial_entries
          WHERE space_id = $1 AND kind = 'expense' AND actual_cents IS NULL AND NOT recurrence_skipped
            AND due_on >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
            AND due_on <= (now() AT TIME ZONE 'America/Sao_Paulo')::date + interval '7 days'
          ORDER BY due_on, lower(description), id
          LIMIT 5
        `,
          [request.auth.spaceId],
        ),
        pool.query(
          `
          SELECT count(*) OVER ()::integer AS total_count, id, description,
            competence_on::text AS competence_on, due_on::text AS due_on, planned_cents::text AS planned_cents
          FROM financial_entries
          WHERE space_id = $1 AND kind = 'expense' AND actual_cents IS NULL AND NOT recurrence_skipped
            AND due_on < (now() AT TIME ZONE 'America/Sao_Paulo')::date
          ORDER BY due_on DESC, lower(description), id
          LIMIT 5
        `,
          [request.auth.spaceId],
        ),
        pool.query(
          `
          SELECT c.id AS category_id,
            COALESCE(c.name, 'Sem categoria') AS category_name,
            COALESCE(SUM(e.planned_cents) FILTER (WHERE
              (e.card_purchase_id IS NOT NULL AND e.due_on >= $2::date AND e.due_on < ($2::date + interval '1 month'))
              OR (e.card_purchase_id IS NULL AND e.competence_on >= $2::date AND e.competence_on < ($2::date + interval '1 month'))
            ), 0)::text AS planned_cents,
            COALESCE(SUM(e.actual_cents) FILTER (WHERE e.realized_on >= $2::date AND e.realized_on < ($2::date + interval '1 month')), 0)::text AS realized_cents
          FROM financial_entries e
          LEFT JOIN categories c ON c.space_id = e.space_id AND c.id = e.category_id
          WHERE e.space_id = $1 AND e.kind = 'expense' AND NOT e.recurrence_skipped
            AND (
              (e.competence_on >= $2::date AND e.competence_on < ($2::date + interval '1 month'))
              OR (e.card_purchase_id IS NOT NULL AND e.due_on >= $2::date AND e.due_on < ($2::date + interval '1 month'))
              OR (e.realized_on >= $2::date AND e.realized_on < ($2::date + interval '1 month'))
            )
          GROUP BY c.id, c.name
          HAVING COALESCE(SUM(e.planned_cents) FILTER (WHERE
              (e.card_purchase_id IS NOT NULL AND e.due_on >= $2::date AND e.due_on < ($2::date + interval '1 month'))
              OR (e.card_purchase_id IS NULL AND e.competence_on >= $2::date AND e.competence_on < ($2::date + interval '1 month'))
            ), 0) > 0
            OR COALESCE(SUM(e.actual_cents) FILTER (WHERE e.realized_on >= $2::date AND e.realized_on < ($2::date + interval '1 month')), 0) > 0
          ORDER BY
            COALESCE(SUM(e.planned_cents) FILTER (WHERE
              (e.card_purchase_id IS NOT NULL AND e.due_on >= $2::date AND e.due_on < ($2::date + interval '1 month'))
              OR (e.card_purchase_id IS NULL AND e.competence_on >= $2::date AND e.competence_on < ($2::date + interval '1 month'))
            ), 0)
              + COALESCE(SUM(e.actual_cents) FILTER (WHERE e.realized_on >= $2::date AND e.realized_on < ($2::date + interval '1 month')), 0) DESC,
            lower(COALESCE(c.name, 'Sem categoria'))
        `,
          [request.auth.spaceId, monthStart],
        ),
      ]);

      const totals = summaryResult.rows[0];
      const planned = {
        incomeCents: totals.planned_income_cents,
        expenseCents: totals.planned_expense_cents,
        investmentCents: totals.planned_investment_cents,
      };
      planned.resultCents = resultCents(planned.incomeCents, planned.expenseCents, planned.investmentCents);
      const realized = {
        incomeCents: totals.realized_income_cents,
        expenseCents: totals.realized_expense_cents,
        investmentCents: totals.realized_investment_cents,
      };
      realized.resultCents = resultCents(realized.incomeCents, realized.expenseCents, realized.investmentCents);

      return response.json({
        month: monthStart,
        planned,
        realized,
        charts: {
          expensesByCategory: expenseCategoriesResult.rows.map((row) => ({
            categoryId: row.category_id,
            categoryName: row.category_name,
            plannedCents: row.planned_cents,
            realizedCents: row.realized_cents,
          })),
        },
        upcoming: extractList(upcomingResult),
        overdue: extractList(overdueResult),
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
