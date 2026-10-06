ALTER TABLE financial_entries
    ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);

CREATE TABLE financial_sync_receipts (
    space_id uuid NOT NULL REFERENCES finance_spaces(id) ON DELETE RESTRICT,
    operation_id uuid NOT NULL,
    actor_user_id uuid NOT NULL,
    request jsonb NOT NULL CHECK (jsonb_typeof(request) = 'object'),
    response_status smallint NOT NULL CHECK (response_status BETWEEN 200 AND 299),
    response_body jsonb NOT NULL CHECK (jsonb_typeof(response_body) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (space_id, operation_id),
    FOREIGN KEY (space_id, actor_user_id)
        REFERENCES space_memberships(space_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX financial_sync_receipts_space_time_idx
    ON financial_sync_receipts (space_id, created_at DESC);
