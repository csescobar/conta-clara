CREATE TABLE sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    FOREIGN KEY (space_id, user_id)
        REFERENCES space_memberships(space_id, user_id) ON DELETE CASCADE,
    CHECK (expires_at > created_at)
);

CREATE INDEX sessions_user_expiry_idx ON sessions (user_id, expires_at);
