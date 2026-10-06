CREATE TABLE recurrence_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id uuid NOT NULL REFERENCES finance_spaces(id) ON DELETE RESTRICT,
    created_by_user_id uuid NOT NULL,
    updated_by_user_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('income', 'expense', 'investment')),
    description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 200),
    category_id uuid,
    payment_method_id uuid,
    start_competence_on date NOT NULL CHECK (extract(day FROM start_competence_on) = 1),
    end_competence_on date CHECK (end_competence_on IS NULL OR extract(day FROM end_competence_on) = 1),
    due_day smallint CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31),
    planned_cents bigint NOT NULL CHECK (planned_cents >= 0),
    notes text CHECK (notes IS NULL OR length(notes) <= 2000),
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (space_id, id),
    FOREIGN KEY (space_id, created_by_user_id)
        REFERENCES space_memberships(space_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (space_id, updated_by_user_id)
        REFERENCES space_memberships(space_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (space_id, category_id)
        REFERENCES categories(space_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (space_id, payment_method_id)
        REFERENCES payment_methods(space_id, id) ON DELETE RESTRICT,
    CHECK (end_competence_on IS NULL OR end_competence_on >= start_competence_on)
);

CREATE INDEX recurrence_rules_active_start_idx
    ON recurrence_rules (space_id, start_competence_on)
    WHERE archived_at IS NULL;

ALTER TABLE financial_entries
    ADD COLUMN recurrence_rule_id uuid,
    ADD COLUMN recurrence_overridden boolean NOT NULL DEFAULT false,
    ADD COLUMN recurrence_skipped boolean NOT NULL DEFAULT false,
    ADD CONSTRAINT financial_entries_recurrence_rule_fk
        FOREIGN KEY (space_id, recurrence_rule_id)
        REFERENCES recurrence_rules(space_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT financial_entries_recurrence_flags_check
        CHECK (recurrence_rule_id IS NOT NULL OR (NOT recurrence_overridden AND NOT recurrence_skipped));

CREATE UNIQUE INDEX financial_entries_recurrence_competence_idx
    ON financial_entries (space_id, recurrence_rule_id, competence_on)
    WHERE recurrence_rule_id IS NOT NULL;
