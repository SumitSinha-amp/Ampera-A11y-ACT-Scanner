// Kept in the built API bundle so external Azure deployments cannot omit it.
export const DATA_PROTECTION_SQL = `
CREATE TABLE IF NOT EXISTS data_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT,
  database_actor TEXT NOT NULL DEFAULT session_user,
  request_id TEXT,
  source TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS data_audit_events_created_idx ON data_audit_events(created_at DESC, id);
CREATE INDEX IF NOT EXISTS data_audit_events_entity_idx ON data_audit_events(entity_type, entity_id, created_at DESC);
CREATE TABLE IF NOT EXISTS data_evidence_outbox (
  event_id UUID PRIMARY KEY REFERENCES data_audit_events(id) ON DELETE RESTRICT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_until TIMESTAMPTZ,
  uploaded_at TIMESTAMPTZ,
  object_key TEXT,
  sha256 TEXT,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS data_evidence_pending_idx ON data_evidence_outbox(next_attempt_at)
  WHERE uploaded_at IS NULL;
CREATE TABLE IF NOT EXISTS data_protection_checks (
  id BIGSERIAL PRIMARY KEY,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  counts JSONB NOT NULL,
  warnings JSONB NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS data_recovery_exports (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  counts JSONB NOT NULL
);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS issue_recovery_state (
  id INTEGER PRIMARY KEY CHECK (id=1),
  dataset_id UUID NOT NULL DEFAULT gen_random_uuid(),
  lease_until TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_started_at TIMESTAMPTZ,
  last_backup_at TIMESTAMPTZ,
  last_backup_id TEXT,
  last_error TEXT,
  counts JSONB NOT NULL DEFAULT '{}'
);
INSERT INTO issue_recovery_state(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS issue_recovery_mappings (
  dataset_id UUID NOT NULL,
  source_table TEXT NOT NULL,
  source_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  identity TEXT NOT NULL,
  PRIMARY KEY(dataset_id,source_table,source_id)
);
ALTER TABLE sites ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION ampera_audit_redact(value JSONB) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
DECLARE result JSONB; entry RECORD; string_value TEXT;
BEGIN
  IF jsonb_typeof(value) = 'object' THEN
    result := '{}';
    FOR entry IN SELECT key, val FROM jsonb_each(value) AS pair(key,val) LOOP
      IF entry.key !~* '(password|secret|token|credential|api.?key|connection.?string|captured_html|screenshot|snapshot|html_content)' THEN
        result := result || jsonb_build_object(entry.key, public.ampera_audit_redact(entry.val));
      END IF;
    END LOOP;
    RETURN result;
  ELSIF jsonb_typeof(value) = 'array' THEN
    SELECT coalesce(jsonb_agg(public.ampera_audit_redact(item)), '[]') INTO result FROM jsonb_array_elements(value) item;
    RETURN result;
  ELSIF jsonb_typeof(value) = 'string' THEN
    string_value := value #>> '{}';
    string_value := regexp_replace(string_value, '(https?://)[^/[:space:]@]+@', '\\1[redacted]@', 'gi');
    string_value := regexp_replace(string_value,
      '([?&](access_token|token|api[_-]?key|secret|password|credential|authorization|code)=)[^&#[:space:]]*',
      '\\1[redacted]', 'gi');
    RETURN to_jsonb(string_value);
  END IF;
  RETURN value;
END;
$$;
CREATE OR REPLACE FUNCTION ampera_capture_audit() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE before_row JSONB; after_row JSONB; raw_before JSONB; raw_after JSONB; event_id UUID; event_action TEXT; changed JSONB;
BEGIN
  raw_before := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE NULL END;
  raw_after := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE NULL END;
  before_row := public.ampera_audit_redact(raw_before);
  after_row := public.ampera_audit_redact(raw_after);
  -- Settings are key/value records; values may contain credentials under innocuous names.
  IF TG_TABLE_NAME = 'app_settings' THEN
    before_row := before_row - 'value';
    after_row := after_row - 'value';
  END IF;
  -- Progress/heartbeat noise is not a business edit. Never discard terminal transitions.
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME IN ('scan_sessions','crawler_sessions') AND
    (before_row->'status') IS NOT DISTINCT FROM (after_row->'status') AND
    (before_row->'name') IS NOT DISTINCT FROM (after_row->'name') AND
    (before_row->'site_id') IS NOT DISTINCT FROM (after_row->'site_id') AND
    (before_row->'project_id') IS NOT DISTINCT FROM (after_row->'project_id') AND
    (raw_before->'options') IS NOT DISTINCT FROM (raw_after->'options') AND
    (raw_before->'config') IS NOT DISTINCT FROM (raw_after->'config') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND raw_before = raw_after THEN RETURN NEW; END IF;
  event_action := lower(TG_OP);
  IF TG_OP = 'UPDATE' AND before_row->'archived' IS DISTINCT FROM after_row->'archived' THEN
    event_action := CASE WHEN after_row->'archived' = 'true'::jsonb THEN 'archived' ELSE 'restored' END;
  END IF;
  SELECT coalesce(jsonb_agg(key), '[]') INTO changed
    FROM jsonb_each(coalesce(raw_after,raw_before)) AS pair(key,value)
    WHERE TG_OP <> 'UPDATE' OR raw_before->key IS DISTINCT FROM raw_after->key;
  INSERT INTO public.data_audit_events(entity_type,entity_id,action,actor_id,request_id,source,details)
  VALUES(TG_TABLE_NAME, coalesce(after_row->>'id',before_row->>'id',after_row->>'key',before_row->>'key',
    after_row->>'user_id',before_row->>'user_id'), event_action,
    nullif(current_setting('ampera.actor_id',true),''),
    nullif(current_setting('ampera.request_id',true),''),
    coalesce(nullif(current_setting('ampera.source',true),''),'database'),
    jsonb_build_object('before',before_row,'after',after_row,'changedFields',changed,
      'reason',nullif(current_setting('ampera.reason',true),'')))
  RETURNING id INTO event_id;
  INSERT INTO public.data_evidence_outbox(event_id) VALUES(event_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
CREATE OR REPLACE FUNCTION ampera_keep_audit() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN RAISE EXCEPTION 'Audit evidence is append-only'; END;
$$;
CREATE OR REPLACE FUNCTION ampera_prevent_protected_delete() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN RAISE EXCEPTION 'Protected records must be archived, not deleted'; END;
$$;
DROP TRIGGER IF EXISTS ampera_audit_immutable ON data_audit_events;
CREATE TRIGGER ampera_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON data_audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION ampera_keep_audit();
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['users','projects','sites','app_issues','app_issue_comments','app_issue_activity',
    'app_issue_links','app_issue_attachments','scan_sessions','crawler_sessions','issue_decisions','data_recovery_exports',
    'user_groups','user_group_members','user_permissions','site_user_access','site_group_access','project_sites',
    'site_content_rules','app_settings'] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS ampera_audit ON public.%I',table_name);
      EXECUTE format('CREATE TRIGGER ampera_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.ampera_capture_audit()',table_name);
      EXECUTE format('DROP TRIGGER IF EXISTS ampera_no_truncate ON public.%I',table_name);
      EXECUTE format('CREATE TRIGGER ampera_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.ampera_prevent_protected_delete()',table_name);
    END IF;
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['users','projects','sites','app_issues'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS ampera_no_delete ON public.%I',table_name);
    EXECUTE format('CREATE TRIGGER ampera_no_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.ampera_prevent_protected_delete()',table_name);
  END LOOP;
END;
$$;
REVOKE UPDATE, DELETE, TRUNCATE ON data_audit_events FROM PUBLIC;
REVOKE ALL ON FUNCTION ampera_capture_audit() FROM PUBLIC;
`;
