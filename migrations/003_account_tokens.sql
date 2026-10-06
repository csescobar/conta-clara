CREATE TABLE account_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id uuid NOT NULL REFERENCES finance_spaces(id) ON DELETE RESTRICT,
    purpose text NOT NULL CHECK (purpose IN ('invite', 'password_reset')),
    email text NOT NULL CHECK (email = lower(btrim(email))),
    token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    issued_by_user_id uuid NOT NULL,
    target_user_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    revoked_at timestamptz,
    FOREIGN KEY (space_id, issued_by_user_id)
        REFERENCES space_memberships(space_id, user_id) ON DELETE CASCADE,
    FOREIGN KEY (space_id, target_user_id)
        REFERENCES space_memberships(space_id, user_id) ON DELETE CASCADE,
    CHECK (expires_at > created_at),
    CHECK ((purpose = 'invite' AND target_user_id IS NULL) OR
           (purpose = 'password_reset' AND target_user_id IS NOT NULL)),
    CHECK (used_at IS NULL OR revoked_at IS NULL)
);

CREATE INDEX account_tokens_space_purpose_created_idx
    ON account_tokens (space_id, purpose, created_at DESC);
CREATE INDEX account_tokens_target_expiry_idx
    ON account_tokens (target_user_id, expires_at)
    WHERE target_user_id IS NOT NULL;
