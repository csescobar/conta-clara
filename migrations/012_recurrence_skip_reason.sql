ALTER TABLE financial_entries
    ADD COLUMN recurrence_skip_reason text;

UPDATE financial_entries
SET recurrence_skip_reason = 'user'
WHERE recurrence_skipped;

ALTER TABLE financial_entries
    ADD CONSTRAINT financial_entries_recurrence_skip_reason_check
    CHECK (
        (recurrence_skipped AND recurrence_skip_reason IN ('user', 'rule'))
        OR (NOT recurrence_skipped AND recurrence_skip_reason IS NULL)
    );
