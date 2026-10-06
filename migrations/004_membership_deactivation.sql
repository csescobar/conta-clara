ALTER TABLE space_memberships
    ADD COLUMN deactivated_at timestamptz;

CREATE INDEX space_memberships_active_space_idx
    ON space_memberships (space_id, user_id)
    WHERE deactivated_at IS NULL;
