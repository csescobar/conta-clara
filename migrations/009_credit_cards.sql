CREATE TABLE credit_cards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id uuid NOT NULL REFERENCES finance_spaces(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
    holder_user_id uuid NOT NULL,
    closing_day smallint NOT NULL CHECK (closing_day BETWEEN 1 AND 31),
    due_day smallint NOT NULL CHECK (due_day BETWEEN 1 AND 31),
    archived_at timestamptz,
    created_by_user_id uuid NOT NULL,
    updated_by_user_id uuid NOT NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (space_id, id),
    FOREIGN KEY (space_id, holder_user_id)
        REFERENCES space_memberships(space_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (space_id, created_by_user_id)
        REFERENCES space_memberships(space_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (space_id, updated_by_user_id)
        REFERENCES space_memberships(space_id, user_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX credit_cards_active_name_idx
    ON credit_cards (space_id, lower(name))
    WHERE archived_at IS NULL;

CREATE INDEX credit_cards_space_status_idx
    ON credit_cards (space_id, archived_at, lower(name));
