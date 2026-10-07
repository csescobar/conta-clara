CREATE TABLE card_purchases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id uuid NOT NULL REFERENCES finance_spaces(id) ON DELETE RESTRICT,
    card_id uuid NOT NULL,
    description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 200),
    category_id uuid NOT NULL,
    purchase_on date NOT NULL,
    first_invoice_on date NOT NULL CHECK (extract(day FROM first_invoice_on) = 1),
    total_cents bigint NOT NULL CHECK (total_cents > 0),
    installment_count smallint NOT NULL CHECK (installment_count BETWEEN 1 AND 120),
    canceled_at timestamptz,
    created_by_user_id uuid NOT NULL,
    updated_by_user_id uuid NOT NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (space_id, id),
    FOREIGN KEY (space_id, card_id) REFERENCES credit_cards(space_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (space_id, category_id) REFERENCES categories(space_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (space_id, created_by_user_id) REFERENCES space_memberships(space_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (space_id, updated_by_user_id) REFERENCES space_memberships(space_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX card_purchases_space_created_idx ON card_purchases (space_id, created_at DESC, id);

ALTER TABLE financial_entries
    ADD COLUMN card_purchase_id uuid,
    ADD COLUMN installment_number smallint,
    ADD COLUMN installment_count smallint,
    ADD CONSTRAINT financial_entries_card_purchase_fk
        FOREIGN KEY (space_id, card_purchase_id) REFERENCES card_purchases(space_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT financial_entries_card_installment_check CHECK (
        (card_purchase_id IS NULL AND installment_number IS NULL AND installment_count IS NULL)
        OR (card_purchase_id IS NOT NULL AND installment_number IS NOT NULL
            AND installment_count IS NOT NULL AND installment_number BETWEEN 1 AND 120
            AND installment_count BETWEEN installment_number AND 120 AND kind = 'expense'
            AND recurrence_rule_id IS NULL)
    );

CREATE UNIQUE INDEX financial_entries_card_installment_idx
    ON financial_entries (space_id, card_purchase_id, installment_number)
    WHERE card_purchase_id IS NOT NULL;
