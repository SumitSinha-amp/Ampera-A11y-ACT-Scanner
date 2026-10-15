import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { pool } from "@workspace/db";
import { readEvidence, writeEvidence, sha256 } from "./evidenceStorage";

const TABLES = ["users", "projects", "sites", "project_sites", "app_issues", "app_issue_comments",
  "app_issue_activity", "app_issue_attachments", "app_issue_links", "scan_sessions", "crawler_sessions"] as const;
const MAX_PLAINTEXT = 32 * 1024 * 1024;
const MAGIC = Buffer.from("AMPERA-RECOVERY-1\n");
export function encryptRecovery(bytes: Buffer, passphrase: string): Buffer {
  if (passphrase.length < 16 || passphrase.length > 512) throw new Error("Recovery passphrase must be 16–512 characters");
  const salt = randomBytes(16), iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", scryptSync(passphrase, salt, 32), iv);
  const encrypted = Buffer.concat([cipher.update(gzipSync(bytes)), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), encrypted]);
}
export function decryptRecovery(bytes: Buffer, passphrase: string): Buffer {
  if (!bytes.subarray(0, MAGIC.length).equals(MAGIC) || bytes.length < MAGIC.length + 44) throw new Error("Invalid recovery export");
  const offset = MAGIC.length;
  const cipher = createDecipheriv("aes-256-gcm", scryptSync(passphrase, bytes.subarray(offset, offset + 16), 32), bytes.subarray(offset + 16, offset + 28));
  cipher.setAuthTag(bytes.subarray(offset + 28, offset + 44));
  const compressed = Buffer.concat([cipher.update(bytes.subarray(offset + 44)), cipher.final()]);
  return gunzipSync(compressed, { maxOutputLength: MAX_PLAINTEXT });
}

export async function createRecoveryExport(actorId: string, passphrase: string) {
  if (passphrase.length < 16 || passphrase.length > 512) throw new Error("Recovery passphrase must be 16–512 characters");
  const client = await pool.connect();
  const counts: Record<string, number> = {};
  const records: { table: string; row: Record<string, unknown> }[] = [];
  let byteCount = 0;
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout='30s'");
    for (const table of TABLES) {
      counts[table] = 0;
      let cursor = 0;
      for (;;) {
        const rows = (await client.query(`SELECT * FROM public.${table} WHERE id>$1 ORDER BY id LIMIT 100`, [cursor])).rows;
        if (!rows.length) break;
        for (const row of rows) {
          const record = { table, row };
          byteCount += Buffer.byteLength(JSON.stringify(record)) + 1;
          if (byteCount > MAX_PLAINTEXT - 1024 * 1024) throw new Error("Business metadata exceeds the 32 MB recovery export limit; use a native database backup");
          records.push(record);
          counts[table]++;
          cursor = row.id;
        }
      }
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  const id = randomUUID();
  const bytes = encryptRecovery(Buffer.from(JSON.stringify({
    format: "ampera-business-metadata-v1", createdAt: new Date().toISOString(),
    note: "Business metadata only. Not a full database backup. File bytes, page-level scan results, permissions and external storage are not included.",
    counts, records,
  })), passphrase);
  const key = `recovery/${id}.amperaenc`;
  const digest = await writeEvidence(key, bytes, "application/octet-stream");
  const result = await pool.query(`INSERT INTO data_recovery_exports(id,actor_id,object_key,sha256,size_bytes,counts)
    VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [id, actorId, key, digest, bytes.length, JSON.stringify(counts)]);
  return result.rows[0];
}

export async function verifyRecoveryExport(id: string, passphrase: string) {
  const record = (await pool.query("SELECT * FROM data_recovery_exports WHERE id=$1", [id])).rows[0];
  if (!record) throw new Error("Recovery export not found");
  const bytes = await readEvidence(record.object_key);
  if (sha256(bytes) !== record.sha256) throw new Error("Recovery export checksum does not match");
  const content = JSON.parse(decryptRecovery(bytes, passphrase).toString("utf8"));
  if (content.format !== "ampera-business-metadata-v1" || !Array.isArray(content.records)) throw new Error("Unsupported recovery export");
  const counts: Record<string, number> = {};
  for (const record of content.records) {
    if (!TABLES.includes(record.table) || !record.row || !Number.isSafeInteger(record.row.id)) throw new Error("Invalid recovery record");
    counts[record.table] = (counts[record.table] ?? 0) + 1;
  }
  for (const table of TABLES) {
    if ((counts[table] ?? 0) !== content.counts[table]) throw new Error("Recovery export record counts do not match");
  }
  return { verified: true, counts: content.counts, format: content.format, sizeBytes: bytes.length,
    note: "Decryption, authentication tag, checksum and record counts verified. No database records were changed." };
}
