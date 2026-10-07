CREATE TABLE card_invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id uuid NOT NULL REFERENCES finance_spaces(id) ON DELETE RESTRICT,
    card_id uuid NOT NULL,
    invoice_month date NOT NULL CHECK (extract(day FROM invoice_month) = 1),
    due_on date NOT NULL,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'needs_review')),
    actual_cents bigint CHECK (actual_cents >= 0),
    paid_on date,
    payment_method_id uuid,
    created_by_user_id uuid NOT NULL,
    updated_by_user_id uuid NOT NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (space_id, card_id, invoice_month),
    UNIQUE (space_id, id),
    FOREIGN KEY (space_id, card_id) REFERENCES credit_cards(space_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (space_id, payment_method_id) REFERENCES payment_methods(space_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (space_id, created_by_user_id) REFERENCES space_memberships(space_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (space_id, updated_by_user_id) REFERENCES space_memberships(space_id, user_id) ON DELETE RESTRICT,
    CHECK (date_trunc('month', due_on)::date = invoice_month),
    CHECK (
      (status = 'paid' AND actual_cents IS NOT NULL AND paid_on IS NOT NULL)
      OR (status <> 'paid' AND actual_cents IS NULL AND paid_on IS NULL AND payment_method_id IS NULL)
    )
);

CREATE INDEX card_invoices_space_month_idx ON card_invoices (space_id, invoice_month DESC, card_id);

-- Existing installment rows remain intact. A partially confirmed legacy invoice is
-- marked for review so the user can confirm it as one invoice payment.
INSERT INTO card_invoices (
    space_id, card_id, invoice_month, due_on, status, actual_cents, paid_on,
    created_by_user_id, updated_by_user_id
)
SELECT p.space_id, p.card_id, date_trunc('month', e.due_on)::date,
    min(e.due_on),
    CASE
      WHEN count(*) FILTER (WHERE e.actual_cents IS NOT NULL) = count(*) THEN 'paid'
      WHEN count(*) FILTER (WHERE e.actual_cents IS NOT NULL) > 0 THEN 'needs_review'
      ELSE 'open'
    END,
    CASE WHEN count(*) FILTER (WHERE e.actual_cents IS NOT NULL) = count(*) THEN sum(e.actual_cents) END,
    CASE WHEN count(*) FILTER (WHERE e.actual_cents IS NOT NULL) = count(*) THEN max(e.realized_on) END,
    min(p.created_by_user_id::text)::uuid, min(p.updated_by_user_id::text)::uuid
FROM financial_entries e
JOIN card_purchases p ON p.space_id = e.space_id AND p.id = e.card_purchase_id
WHERE e.due_on IS NOT NULL
GROUP BY p.space_id, p.card_id, date_trunc('month', e.due_on)::date;
