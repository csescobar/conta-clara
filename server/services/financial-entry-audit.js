// @ts-check

/**
 * Campos de um lançamento guardados no histórico de alterações.
 * @param {import('../types.js').EntryRow} entry
 */
export function auditSnapshot(entry) {
  return {
    kind: entry.kind,
    description: entry.description,
    categoryId: entry.category_id,
    categoryName: entry.category_name,
    competenceOn: entry.competence_on,
    dueOn: entry.due_on,
    plannedCents: entry.planned_cents,
    actualCents: entry.actual_cents,
    realizedOn: entry.realized_on,
    paymentMethodId: entry.payment_method_id,
    paymentMethodName: entry.payment_method_name,
  };
}

/**
 * @param {import('../types.js').Queryable} client
 * @param {{
 *   spaceId: string,
 *   actorUserId: string,
 *   actorName: string,
 *   entry: import('../types.js').EntryRow,
 *   action: 'created' | 'updated' | 'confirmed' | 'unconfirmed' | 'deleted',
 *   before?: import('../types.js').EntryRow | null,
 *   after?: import('../types.js').EntryRow | null,
 * }} audit
 */
export async function recordEntryAudit(client, { spaceId, actorUserId, actorName, entry, action, before, after }) {
  /** @type {{ before?: ReturnType<typeof auditSnapshot>, after?: ReturnType<typeof auditSnapshot> }} */
  const details = {};
  if (before) details.before = auditSnapshot(before);
  if (after) details.after = auditSnapshot(after);
  await client.query(
    `
    INSERT INTO financial_entry_audit (
      space_id, entry_id, actor_user_id, actor_display_name,
      action, entry_kind, entry_description, details
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `,
    [spaceId, entry.id, actorUserId, actorName, action, entry.kind, entry.description, JSON.stringify(details)],
  );
}
