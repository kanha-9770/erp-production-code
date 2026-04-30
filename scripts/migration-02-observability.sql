-- =============================================================================
-- MIGRATION 02: OBSERVABILITY
-- =============================================================================
-- Risk addressed:
--   * Workflow trigger swallows every error (lib/workflow/trigger.ts:13).
--     There is currently no DB record of when a rule fired, succeeded, or
--     failed. The AKASH automation broke today and we had to write a SQL
--     backfill blind because there was no execution log.
--   * Email send failures are warnings only (trigger.ts:374-385). Time-
--     sensitive recruitment emails can be silently dropped.
--   * No record-level audit -- "who changed this employee's salary on
--     which day" is unanswerable.
--
-- What this does:
--   1. workflow_executions: every workflow rule fire is logged here.
--   2. email_outbox: queue/log of every workflow email send.
--   3. record_history: append-only diff log for every record write.
--
-- All three tables are write-heavy and read-occasionally. Indexed for the
-- common queries: "show me failed workflows", "show me the history of this
-- record", "what's pending in the email outbox".
--
-- Idempotent: safe to re-run.
-- =============================================================================

BEGIN;

-- ---- workflow_executions ----------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_executions (
    id              text PRIMARY KEY,
    rule_id         text NOT NULL,
    rule_name       text,
    function_id     text,
    function_name   text,
    organization_id text NOT NULL,
    record_id       text,
    form_id         text,
    module_name     text,
    trigger_action  text,                              -- 'Create' | 'Edit' | 'Delete'
    status          text NOT NULL DEFAULT 'pending',   -- pending|running|success|failed|retry|skipped
    attempts        int  NOT NULL DEFAULT 0,
    result          jsonb,                             -- function return value
    error           text,                              -- error message if any
    started_at      timestamptz NOT NULL DEFAULT now(),
    finished_at     timestamptz,
    duration_ms     int GENERATED ALWAYS AS (
        CASE WHEN finished_at IS NOT NULL
             THEN EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000
             ELSE NULL END
    ) STORED,
    CONSTRAINT wf_exec_status_chk CHECK (status IN ('pending','running','success','failed','retry','skipped'))
);

-- Hot path: "show me what's broken right now"
CREATE INDEX IF NOT EXISTS wf_exec_status_idx
    ON workflow_executions (status, started_at DESC)
 WHERE status IN ('pending','retry','failed');

-- "Show me everything that fired for this record"
CREATE INDEX IF NOT EXISTS wf_exec_record_idx
    ON workflow_executions (record_id, started_at DESC);

-- Per-org dashboards
CREATE INDEX IF NOT EXISTS wf_exec_org_idx
    ON workflow_executions (organization_id, started_at DESC);

-- Per-rule debugging
CREATE INDEX IF NOT EXISTS wf_exec_rule_idx
    ON workflow_executions (rule_id, started_at DESC);

COMMENT ON TABLE workflow_executions IS
    'Append-only log of every workflow rule fire. Insert pending row at start, '
    'update to success/failed/retry on completion. Read by ops dashboards and '
    'by retry workers polling status IN (pending, retry).';


-- ---- email_outbox -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_outbox (
    id               text PRIMARY KEY,
    organization_id  text NOT NULL,
    to_address       text NOT NULL,
    from_address     text,
    reply_to         text,
    subject          text NOT NULL,
    body             text NOT NULL,
    body_format      text NOT NULL DEFAULT 'html',     -- 'html' | 'text'
    status           text NOT NULL DEFAULT 'queued',   -- queued|sending|sent|failed|bounced
    attempts         int  NOT NULL DEFAULT 0,
    last_error       text,
    retry_after      timestamptz,                       -- next retry time
    sent_at          timestamptz,
    rule_id          text,                              -- which workflow rule queued it (if any)
    record_id        text,                              -- record that triggered it (if any)
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT email_outbox_status_chk CHECK (status IN ('queued','sending','sent','failed','bounced')),
    CONSTRAINT email_outbox_format_chk CHECK (body_format IN ('html','text'))
);

-- Worker poll: "what's due to send?"
CREATE INDEX IF NOT EXISTS email_outbox_due_idx
    ON email_outbox (retry_after NULLS FIRST, created_at)
 WHERE status IN ('queued','sending');

-- Failure dashboard
CREATE INDEX IF NOT EXISTS email_outbox_failed_idx
    ON email_outbox (organization_id, created_at DESC)
 WHERE status = 'failed';

-- "All emails about this record"
CREATE INDEX IF NOT EXISTS email_outbox_record_idx
    ON email_outbox (record_id, created_at DESC);

COMMENT ON TABLE email_outbox IS
    'Outbox pattern. The workflow trigger no longer sends SMTP directly -- '
    'it inserts a row here. A background worker polls and sends, with retries '
    'and exponential backoff. Status reflects the most recent attempt.';


-- ---- record_history ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS record_history (
    id               bigserial PRIMARY KEY,
    record_id        text NOT NULL,
    organization_id  text NOT NULL,
    form_id          text NOT NULL,
    action           text NOT NULL,                    -- 'create' | 'update' | 'delete'
    changed_by       text,
    changed_at       timestamptz NOT NULL DEFAULT now(),
    diff             jsonb NOT NULL,                   -- key => [old, new] for updates; full snapshot for create
    source           text,                              -- 'user' | 'workflow' | 'binding' | 'import'
    rule_id          text,                              -- if action came from a workflow rule
    CONSTRAINT record_history_action_chk CHECK (action IN ('create','update','delete'))
);

-- "Show me this record's history"
CREATE INDEX IF NOT EXISTS record_history_record_idx
    ON record_history (record_id, changed_at DESC);

-- Per-org compliance reports
CREATE INDEX IF NOT EXISTS record_history_org_idx
    ON record_history (organization_id, changed_at DESC);

-- "Who has been editing in the last 24h?"
CREATE INDEX IF NOT EXISTS record_history_user_idx
    ON record_history (changed_by, changed_at DESC) WHERE changed_by IS NOT NULL;

COMMENT ON TABLE record_history IS
    'Append-only audit trail for every record write. Populated either by app '
    'code (in the submit handler) or by a DB trigger on form_records_*. The '
    '`diff` column holds {field_id: [old, new]} for updates, full snapshot for '
    'create. Soft-delete-safe: action="delete" preserves the last known state.';

COMMIT;

-- =============================================================================
-- VERIFY
-- =============================================================================
-- All three tables exist:
--   SELECT table_name FROM information_schema.tables
--    WHERE table_name IN ('workflow_executions','email_outbox','record_history');
--
-- Indexes look right:
--   SELECT indexname, tablename FROM pg_indexes
--    WHERE tablename IN ('workflow_executions','email_outbox','record_history')
--    ORDER BY tablename, indexname;
--
-- =============================================================================
-- APP-SIDE WIRING (required before these tables actually do anything)
-- =============================================================================
-- 1. lib/workflow/trigger.ts:
--    Wrap the body of triggerWorkflowsForRecord and each rule iteration so
--    that every fire INSERTs a row into workflow_executions with status
--    'running', then updates it to 'success' / 'failed' / 'skipped' at the
--    end. Failures stay swallowed (request can't fail), but they're now
--    visible in the table.
--
-- 2. lib/workflow/trigger.ts (Email Notification action, ~line 357):
--    Replace the direct sendWorkflowEmail call with an INSERT into
--    email_outbox. Add a worker (e.g. a Vercel cron + small script) that
--    selects WHERE status IN ('queued','retry') AND retry_after <= now()
--    and sends, retrying with backoff on failure.
--
-- 3. app/api/forms/[formId]/submit/route.ts:
--    On successful create/update/delete, INSERT into record_history with
--    the diff. (Tip: if you'd rather do this DB-side, add a trigger on
--    form_records_* that fires AFTER INSERT/UPDATE/DELETE.)
--
-- IMPORTANT: After running this migration, run `prisma db pull` to add
-- WorkflowExecution/EmailOutbox/RecordHistory models to schema.prisma.
