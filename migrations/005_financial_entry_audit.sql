CREATE TABLE financial_entry_audit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    space_id uuid NOT NULL REFERENCES finance_spaces(id) ON DELETE RESTRICT,
    entry_id uuid NOT NULL,
    actor_user_id uuid NOT NULL,
    actor_display_name text NOT NULL CHECK (length(btrim(actor_display_name)) BETWEEN 1 AND 160),
    action text NOT NULL CHECK (action IN ('created', 'updated', 'confirmed', 'unconfirmed', 'deleted')),
    entry_kind text NOT NULL CHECK (entry_kind IN ('income', 'expense', 'investment')),
    entry_description text NOT NULL CHECK (length(btrim(entry_description)) BETWEEN 1 AND 200),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
    FOREIGN KEY (space_id, actor_user_id)
        REFERENCES space_memberships(space_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX financial_entry_audit_space_time_idx
    ON financial_entry_audit (space_id, occurred_at DESC, id DESC);
CREATE INDEX financial_entry_audit_entry_time_idx
    ON financial_entry_audit (space_id, entry_id, occurred_at DESC, id DESC);

INSERT INTO financial_entry_audit (
    space_id, entry_id, actor_user_id, actor_display_name,
    action, entry_kind, entry_description, occurred_at, details
)
SELECT e.space_id, e.id, e.created_by_user_id, u.display_name,
    'created', e.kind, e.description, e.created_at,
    jsonb_build_object('after', jsonb_build_object(
        'kind', e.kind,
        'description', e.description,
        'categoryId', e.category_id,
        'categoryName', c.name,
        'competenceOn', e.competence_on,
        'dueOn', e.due_on,
        'plannedCents', e.planned_cents,
        'actualCents', e.actual_cents,
        'realizedOn', e.realized_on,
        'paymentMethodId', e.payment_method_id,
        'paymentMethodName', pm.name
    ))
FROM financial_entries e
JOIN users u ON u.id = e.created_by_user_id
LEFT JOIN categories c ON c.space_id = e.space_id AND c.id = e.category_id
LEFT JOIN payment_methods pm ON pm.space_id = e.space_id AND pm.id = e.payment_method_id;

CREATE FUNCTION prevent_financial_entry_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'financial_entry_audit is append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER financial_entry_audit_immutable
    BEFORE UPDATE OR DELETE ON financial_entry_audit
    FOR EACH ROW EXECUTE FUNCTION prevent_financial_entry_audit_mutation();
