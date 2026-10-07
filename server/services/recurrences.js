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

async function currentRecurrenceHorizon(client) {
  const result = await client.query("SELECT to_char(date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS current_month");
  const currentMonth = result.rows[0].current_month;
  return { currentMonth, horizonMonth: recurrenceHorizonMonth(currentMonth) };
}

async function selectOccurrenceForAudit(client, spaceId, entryId) {
  const result = await client.query(`
    SELECT e.id, e.kind, e.description, e.category_id, c.name AS category_name,
      e.competence_on::text AS competence_on, e.due_on::text AS due_on,
      e.planned_cents, e.actual_cents, e.realized_on::text AS realized_on,
      e.payment_method_id, pm.name AS payment_method_name
    FROM financial_entries e
    LEFT JOIN categories c ON c.space_id = e.space_id AND c.id = e.category_id
    LEFT JOIN payment_methods pm ON pm.space_id = e.space_id AND pm.id = e.payment_method_id
    WHERE e.id = $1 AND e.space_id = $2
  `, [entryId, spaceId]);
  return result.rows[0];
}

/** Reconciles only future, rule-owned projections inside the rolling forecast horizon. */
export async function synchronizeRecurrenceOccurrencesInTransaction(client, { spaceId, ruleId, actorUserId, actorName }) {
  const { currentMonth, horizonMonth } = await currentRecurrenceHorizon(client);
  const ruleResult = await client.query(`
    SELECT id, kind, description, category_id, payment_method_id,
      start_competence_on::text AS start_competence_on,
      end_competence_on::text AS end_competence_on, due_day, planned_cents, notes,
      archived_at
    FROM recurrence_rules
    WHERE id = $1 AND space_id = $2
  `, [ruleId, spaceId]);
  const rule = ruleResult.rows[0];
  if (!rule) return { updated: 0, removed: 0, restored: 0 };

  const occurrences = await client.query(`
    SELECT e.id, e.kind, e.description, e.category_id, c.name AS category_name,
      e.competence_on::text AS competence_on, e.due_on::text AS due_on,
      e.planned_cents, e.actual_cents, e.realized_on::text AS realized_on,
      e.payment_method_id, pm.name AS payment_method_name, e.notes,
      e.recurrence_overridden, e.recurrence_skipped, e.recurrence_skip_reason
    FROM financial_entries e
    LEFT JOIN categories c ON c.space_id = e.space_id AND c.id = e.category_id
    LEFT JOIN payment_methods pm ON pm.space_id = e.space_id AND pm.id = e.payment_method_id
    WHERE e.space_id = $1 AND e.recurrence_rule_id = $2
      AND e.competence_on > $3::date
    ORDER BY e.competence_on, e.id
    FOR UPDATE OF e
  `, [spaceId, ruleId, currentMonth]);

  const eligible = (entry) => !entry.recurrence_overridden && entry.actual_cents === null;
  let updated = 0;
  let removed = 0;
  let restored = 0;

  for (const entry of occurrences.rows) {
    if (!eligible(entry)) continue;
    const competenceOn = entry.competence_on;
    const inRulePeriod = !rule.archived_at
      && competenceOn >= rule.start_competence_on
      && (!rule.end_competence_on || competenceOn <= rule.end_competence_on);
    const inForecast = competenceOn <= horizonMonth;
    const shouldBeVisible = inRulePeriod && inForecast;

    if (entry.recurrence_skipped) {
      if (entry.recurrence_skip_reason !== 'rule' || !shouldBeVisible) continue;
      await client.query(`
        UPDATE financial_entries
        SET kind = $1, description = $2, category_id = $3, due_on = $4,
          planned_cents = $5, payment_method_id = $6, notes = $7,
          recurrence_skipped = false, recurrence_skip_reason = NULL,
          updated_by_user_id = $8, updated_at = now(), version = version + 1
        WHERE id = $9 AND space_id = $10
      `, [rule.kind, rule.description, rule.category_id, recurrenceDueDate(competenceOn, rule.due_day), rule.planned_cents, rule.payment_method_id, rule.notes, actorUserId, entry.id, spaceId]);
      const after = await selectOccurrenceForAudit(client, spaceId, entry.id);
      await recordEntryAudit(client, { spaceId, actorUserId, actorName, entry: after, action: 'updated', before: entry, after });
      restored += 1;
      continue;
    }

    if (!shouldBeVisible) {
      await recordEntryAudit(client, { spaceId, actorUserId, actorName, entry, action: 'deleted', before: entry });
      await client.query(`
        UPDATE financial_entries
        SET recurrence_skipped = true, recurrence_skip_reason = 'rule',
          updated_by_user_id = $1, updated_at = now(), version = version + 1
        WHERE id = $2 AND space_id = $3
      `, [actorUserId, entry.id, spaceId]);
      removed += 1;
      continue;
    }

    const dueOn = recurrenceDueDate(competenceOn, rule.due_day);
    const hasChanges = entry.kind !== rule.kind
      || entry.description !== rule.description
      || entry.category_id !== rule.category_id
      || entry.due_on !== dueOn
      || String(entry.planned_cents) !== String(rule.planned_cents)
      || entry.payment_method_id !== rule.payment_method_id
      || entry.notes !== rule.notes;
    if (!hasChanges) continue;

    await client.query(`
      UPDATE financial_entries SET kind = $1, description = $2, category_id = $3,
        due_on = $4, planned_cents = $5, payment_method_id = $6, notes = $7,
        updated_by_user_id = $8, updated_at = now(), version = version + 1
      WHERE id = $9 AND space_id = $10
    `, [rule.kind, rule.description, rule.category_id, dueOn, rule.planned_cents, rule.payment_method_id, rule.notes, actorUserId, entry.id, spaceId]);
    const after = await selectOccurrenceForAudit(client, spaceId, entry.id);
    await recordEntryAudit(client, { spaceId, actorUserId, actorName, entry: after, action: 'updated', before: entry, after });
    updated += 1;
  }

  return { updated, removed, restored };
}

async function generateForClient(client, { spaceId = null, ruleId = null, throughMonth = null, actorUserId = null, actorName = null } = {}) {
  const horizon = throughMonth ? null : await currentRecurrenceHorizon(client);
  const lastMonth = throughMonth ?? horizon.horizonMonth;
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
        actorUserId: actorUserId ?? rule.created_by_user_id,
        actorName: actorName ?? rule.actor_name,
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
