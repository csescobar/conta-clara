import { recordEntryAudit } from './financial-entry-audit.js';

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])-01$/;
export const RECURRENCE_HORIZON_MONTHS_AHEAD = 12;

export function recurrenceHorizonMonth(currentCompetence, monthsAhead = RECURRENCE_HORIZON_MONTHS_AHEAD) {
  if (!monthPattern.test(currentCompetence)) {
    throw new TypeError('A competência atual precisa estar no formato AAAA-MM-01.');
  }
  if (!Number.isInteger(monthsAhead) || monthsAhead < 0) {
    throw new TypeError('O horizonte precisa ser um número inteiro de meses não negativo.');
  }
  const [year, month] = currentCompetence.slice(0, 7).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + monthsAhead, 1)).toISOString().slice(0, 10);
}

export function listCompetenceMonths(startCompetenceOn, endCompetenceOn, throughMonth) {
  if (![startCompetenceOn, throughMonth].every((value) => monthPattern.test(value)) || (endCompetenceOn && !monthPattern.test(endCompetenceOn))) {
    throw new TypeError('As competências devem estar no formato AAAA-MM-01.');
  }
  const lastMonth = endCompetenceOn && endCompetenceOn < throughMonth ? endCompetenceOn : throughMonth;
  if (startCompetenceOn > lastMonth) return [];
  const [startYear, startMonth] = startCompetenceOn.slice(0, 7).split('-').map(Number);
  const [endYear, endMonth] = lastMonth.slice(0, 7).split('-').map(Number);
  const months = [];
  for (let year = startYear, month = startMonth; year < endYear || (year === endYear && month <= endMonth); month += 1) {
    if (month === 13) {
      year += 1;
      month = 1;
    }
    months.push(`${year}-${String(month).padStart(2, '0')}-01`);
  }
  return months;
}

export function recurrenceDueDate(competenceOn, dueDay) {
  if (dueDay === null || dueDay === undefined) return null;
  const [year, month] = competenceOn.slice(0, 7).split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const actualDay = Math.min(dueDay, lastDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(actualDay).padStart(2, '0')}`;
}

async function generateForClient(client, { spaceId = null, ruleId = null, throughMonth = null } = {}) {
  const throughResult = throughMonth
    ? { rows: [{ through_month: throughMonth }] }
    : await client.query("SELECT to_char(date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS current_month");
  const lastMonth = throughMonth
    ?? recurrenceHorizonMonth(throughResult.rows[0].current_month);
  if (!monthPattern.test(lastMonth)) throw new TypeError('A competência final precisa ser o primeiro dia do mês.');
  const rules = await client.query(`
    SELECT r.id, r.space_id, r.created_by_user_id, r.kind, r.description, r.category_id,
      r.payment_method_id, r.start_competence_on::text AS start_competence_on,
      r.end_competence_on::text AS end_competence_on, r.due_day, r.planned_cents,
      r.notes, u.display_name AS actor_name
    FROM recurrence_rules r
    JOIN users u ON u.id = r.created_by_user_id
    WHERE r.archived_at IS NULL
      AND ($1::uuid IS NULL OR r.space_id = $1)
      AND ($2::uuid IS NULL OR r.id = $2)
    ORDER BY r.space_id, r.id
    FOR UPDATE OF r
  `, [spaceId, ruleId]);
  let generated = 0;

  for (const rule of rules.rows) {
    const months = listCompetenceMonths(rule.start_competence_on, rule.end_competence_on, lastMonth);
    for (const competenceOn of months) {
      const inserted = await client.query(`
        INSERT INTO financial_entries (
          space_id, created_by_user_id, updated_by_user_id, kind, description, category_id,
          competence_on, due_on, planned_cents, payment_method_id, notes, recurrence_rule_id
        ) VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (space_id, recurrence_rule_id, competence_on)
          WHERE recurrence_rule_id IS NOT NULL DO NOTHING
        RETURNING id
      `, [rule.space_id, rule.created_by_user_id, rule.kind, rule.description, rule.category_id, competenceOn, recurrenceDueDate(competenceOn, rule.due_day), rule.planned_cents, rule.payment_method_id, rule.notes, rule.id]);
      if (!inserted.rows[0]) continue;

      const entryResult = await client.query(`
        SELECT e.id, e.kind, e.description, e.category_id, c.name AS category_name,
          e.competence_on::text AS competence_on, e.due_on::text AS due_on,
          e.planned_cents, e.actual_cents, e.realized_on::text AS realized_on,
          e.payment_method_id, pm.name AS payment_method_name,
          e.created_by_user_id, e.updated_by_user_id
        FROM financial_entries e
        LEFT JOIN categories c ON c.space_id = e.space_id AND c.id = e.category_id
        LEFT JOIN payment_methods pm ON pm.space_id = e.space_id AND pm.id = e.payment_method_id
        WHERE e.id = $1 AND e.space_id = $2
      `, [inserted.rows[0].id, rule.space_id]);
      const entry = entryResult.rows[0];
      await recordEntryAudit(client, {
        spaceId: rule.space_id,
        actorUserId: rule.created_by_user_id,
        actorName: rule.actor_name,
        entry,
        action: 'created',
        after: entry,
      });
      generated += 1;
    }
  }
  return generated;
}

export async function generateRecurrenceOccurrencesInTransaction(client, options = {}) {
  return generateForClient(client, options);
}

export async function generateRecurrenceOccurrences(pool, options = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const generated = await generateForClient(client, options);
    await client.query('COMMIT');
    return generated;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
