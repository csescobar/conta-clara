CREATE TABLE spreadsheet_import_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id uuid NOT NULL REFERENCES finance_spaces(id) ON DELETE RESTRICT,
    imported_by_user_id uuid NOT NULL,
    fingerprint char(64) NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
    item_count integer NOT NULL CHECK (item_count BETWEEN 1 AND 500),
    imported_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (space_id, imported_by_user_id)
        REFERENCES space_memberships(space_id, user_id) ON DELETE RESTRICT,
    UNIQUE (space_id, fingerprint)
);

CREATE INDEX spreadsheet_import_batches_space_time_idx
    ON spreadsheet_import_batches (space_id, imported_at DESC, id DESC);
