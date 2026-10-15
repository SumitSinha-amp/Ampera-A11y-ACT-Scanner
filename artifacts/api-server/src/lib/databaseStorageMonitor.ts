import { pool } from "@workspace/db";
import type { DatabaseStorageStatus, DatabaseStorageConfig } from "@workspace/api-zod";
import { logger } from "./logger";
import { AZURE_RESOURCE_PATTERN, METRIC_MAX_AGE_MS, parseStorageFree, shouldNotifyStorageLow, STORAGE_THRESHOLD_BYTES } from "./azureStorageMetrics";

const CONFIG_KEY = "azure_database_storage_config";
const STATE_KEY = "azure_database_storage_state";
const LOCK = 173504215;
type Reading = { resourceId: string; freeBytes: number; sampledAt: string; checkedAt: string; notifiedLow: boolean };
let cached: Reading | null = null;
let failure: string | null = null;
let pending: Promise<void> | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let stopped = false;

async function readSetting<T>(key: string): Promise<T | null> {
  const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = $1", [key]);
  return rows[0] ? JSON.parse(rows[0].value) : null;
}
export async function getStorageConfig(): Promise<DatabaseStorageConfig> {
  return await readSetting<DatabaseStorageConfig>(CONFIG_KEY) ?? { enabled: false, resourceId: "" };
}
export function storageIdentityAvailable() {
  return Boolean(process.env.IDENTITY_ENDPOINT && process.env.IDENTITY_HEADER);
}
export async function getStorageStatus(): Promise<DatabaseStorageStatus> {
  const config = await getStorageConfig();
  const stored = await readSetting<Reading>(STATE_KEY);
  const valid = [cached, stored]
    .filter((reading): reading is Reading => Boolean(reading && reading.resourceId === config.resourceId))
    .sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt))[0] ?? null;
  const stale = valid ? Date.now() - Date.parse(valid.sampledAt) > METRIC_MAX_AGE_MS : false;
  const status = !config.enabled ? "disabled" : failure ? "unavailable" :
    stale ? "stale" : !valid ? "pending" :
      valid.freeBytes <= STORAGE_THRESHOLD_BYTES ? "low" : "healthy";
  return {
    ...config, thresholdGb: 5, thresholdBytes: STORAGE_THRESHOLD_BYTES,
    identityAvailable: storageIdentityAvailable(), status,
    freeBytes: valid?.freeBytes ?? null, sampledAt: valid?.sampledAt ?? null, checkedAt: valid?.checkedAt ?? null,
    message: !config.enabled ? "Storage monitoring is disabled." : failure ??
      (stale ? "The last Azure reading is stale. Current storage is unknown." :
        !valid ? "Waiting for the first Azure storage reading." :
          status === "low" ? "Azure PostgreSQL has 5 GB or less storage remaining." : "Storage remaining is above 5 GB."),
  };
}
export async function saveStorageConfig(config: DatabaseStorageConfig) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK]);
    await client.query("INSERT INTO app_settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value", [CONFIG_KEY, JSON.stringify(config)]);
    // Preserve the alert episode on idempotent saves; a different server starts a new episode.
    const state = await client.query("SELECT value FROM app_settings WHERE key=$1", [STATE_KEY]);
    if (state.rows[0] && JSON.parse(state.rows[0].value).resourceId !== config.resourceId) {
      await client.query("DELETE FROM app_settings WHERE key=$1", [STATE_KEY]);
    }
    await client.query("COMMIT");
    cached = null;
    failure = null;
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
}
async function fetchFreeStorage(resourceId: string) {
  if (!storageIdentityAvailable()) throw new Error("Enable the Azure App Service managed identity and grant Monitoring Reader on the PostgreSQL server.");
  if (!AZURE_RESOURCE_PATTERN.test(resourceId)) throw new Error("Configure a PostgreSQL Flexible Server resource ID.");
  const identity = new URL(process.env.IDENTITY_ENDPOINT!);
  identity.searchParams.set("resource", "https://management.azure.com/");
  identity.searchParams.set("api-version", "2019-08-01");
  const tokenResponse = await fetch(identity, {
    headers: { "X-IDENTITY-HEADER": process.env.IDENTITY_HEADER! },
    signal: AbortSignal.timeout(10_000), redirect: "error",
  });
  if (!tokenResponse.ok) throw new Error("Azure managed identity could not authenticate. Check the App Service identity.");
  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) throw new Error("Azure managed identity returned no access token.");
  const metrics = new URL(`https://management.azure.com${resourceId}/providers/Microsoft.Insights/metrics`);
  metrics.searchParams.set("api-version", "2018-01-01");
  metrics.searchParams.set("metricnames", "storage_free");
  metrics.searchParams.set("aggregation", "Minimum");
  metrics.searchParams.set("interval", "PT1M");
  metrics.searchParams.set("timespan", `${new Date(Date.now() - 20 * 60_000).toISOString()}/${new Date().toISOString()}`);
  const response = await fetch(metrics, {
    headers: { Authorization: `Bearer ${token.access_token}` },
    signal: AbortSignal.timeout(15_000), redirect: "error",
  });
  if (!response.ok) throw new Error(`Azure storage metrics request failed (HTTP ${response.status}). Check the server resource ID and Monitoring Reader permission.`);
  return parseStorageFree(await response.json());
}
async function performCheck() {
  try {
    const config = await getStorageConfig();
    if (!config.enabled || stopped) return;
    const metric = await fetchFreeStorage(config.resourceId);
    const reading: Reading = { ...metric, resourceId: config.resourceId, checkedAt: new Date().toISOString(), notifiedLow: false };
    if (stopped) return;
    // Keep the live warning available even if a full/read-only DB rejects notification writes.
    cached = reading;
    failure = null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const lock = await client.query("SELECT pg_try_advisory_xact_lock($1) AS locked", [LOCK]);
      if (!lock.rows[0]?.locked) { await client.query("ROLLBACK"); return; }
      const current = await client.query("SELECT value FROM app_settings WHERE key=$1", [CONFIG_KEY]);
      const latestConfig = current.rows[0] ? JSON.parse(current.rows[0].value) : null;
      if (!latestConfig?.enabled || latestConfig.resourceId !== config.resourceId) {
        cached = null; await client.query("ROLLBACK"); return;
      }
      const previous = await client.query("SELECT value FROM app_settings WHERE key=$1", [STATE_KEY]);
      const state: Reading | null = previous.rows[0] ? JSON.parse(previous.rows[0].value) : null;
      const admins = await client.query("SELECT id FROM users WHERE is_active=TRUE AND role IN ('admin','super_admin')");
      if (shouldNotifyStorageLow(state, config.resourceId, metric.freeBytes) && admins.rows.length) {
        const notification = await client.query(
          "INSERT INTO notifications (type,title,body,link) VALUES ($1,$2,$3,$4) RETURNING id",
          ["database_storage", "Database storage critically low", `Azure PostgreSQL has ${(metric.freeBytes / 1e9).toFixed(2)} GB remaining. Increase storage in Azure before writes are blocked.`, "/settings?section=database-storage"],
        );
        await client.query("INSERT INTO notification_recipients (notification_id,user_id) SELECT $1, unnest($2::int[])", [notification.rows[0].id, admins.rows.map(r => r.id)]);
      }
      reading.notifiedLow = metric.freeBytes <= STORAGE_THRESHOLD_BYTES && Boolean(admins.rows.length);
      await client.query("INSERT INTO app_settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value", [STATE_KEY, JSON.stringify(reading)]);
      await client.query("COMMIT");
      cached = reading;
    } catch {
      await client.query("ROLLBACK");
      logger.warn("Storage metric read succeeded, but its notification/state could not be saved. Live admin warning remains available.");
    } finally { client.release(); }
  } catch (err) {
    failure = err instanceof Error && /^(Azure|Enable|Configure)/.test(err.message)
      ? err.message : "Storage monitoring could not refresh. Check Azure connectivity; current storage is unknown.";
    logger.warn({ message: failure }, "Database storage monitor unavailable");
  }
}
export function checkStorage(): Promise<void> {
  if (stopped) return Promise.resolve();
  if (!pending) pending = performCheck().finally(() => { pending = null; });
  return pending;
}
export function startStorageMonitor() {
  stopped = false;
  void checkStorage();
  timer = setInterval(() => { void checkStorage(); }, 5 * 60_000);
  timer.unref();
}
export async function stopStorageMonitor() {
  stopped = true;
  if (timer) clearInterval(timer);
  await pending;
}
