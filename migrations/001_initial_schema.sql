CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE CHECK (email = lower(btrim(email))),
    display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 160),
    password_hash text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE finance_spaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE space_memberships (
    space_id uuid NOT NULL REFERENCES finance_spaces(id) ON DELETE RESTRICT,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    role text NOT NULL CHECK (role IN ('admin', 'member')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (space_id, user_id)
);

CREATE INDEX space_memberships_user_idx ON space_memberships (user_id, space_id);

CREATE TABLE categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id uuid NOT NULL REFERENCES finance_spaces(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
    kind text NOT NULL CHECK (kind IN ('income', 'expense', 'investment')),
    expense_class text CHECK (expense_class IN ('fixed', 'variable')),
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (space_id, id),
    CHECK (kind = 'expense' OR expense_class IS NULL)
);

CREATE UNIQUE INDEX categories_active_name_idx ON categories (space_id, kind, lower(name))
    WHERE archived_at IS NULL;

CREATE TABLE payment_methods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id uuid NOT NULL REFERENCES finance_spaces(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (space_id, id)
);

CREATE UNIQUE INDEX payment_methods_active_name_idx ON payment_methods (space_id, lower(name))
    WHERE archived_at IS NULL;

CREATE TABLE financial_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id uuid NOT NULL REFERENCES finance_spaces(id) ON DELETE RESTRICT,
    created_by_user_id uuid NOT NULL,
    updated_by_user_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('income', 'expense', 'investment')),
    description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 200),
    category_id uuid,
    competence_on date NOT NULL CHECK (extract(day FROM competence_on) = 1),
    due_on date,
    planned_cents bigint NOT NULL CHECK (planned_cents >= 0),
    actual_cents bigint CHECK (actual_cents >= 0),
    realized_on date,
    payment_method_id uuid,
    notes text CHECK (notes IS NULL OR length(notes) <= 2000),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (space_id, created_by_user_id)
        REFERENCES space_memberships(space_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (space_id, updated_by_user_id)
        REFERENCES space_memberships(space_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (space_id, category_id)
        REFERENCES categories(space_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (space_id, payment_method_id)
        REFERENCES payment_methods(space_id, id) ON DELETE RESTRICT,
    CHECK ((actual_cents IS NULL AND realized_on IS NULL) OR
           (actual_cents IS NOT NULL AND realized_on IS NOT NULL))
);

CREATE INDEX financial_entries_competence_idx ON financial_entries (space_id, competence_on);
CREATE INDEX financial_entries_due_idx ON financial_entries (space_id, due_on)
    WHERE due_on IS NOT NULL AND realized_on IS NULL;
