import { createHash } from "node:crypto";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { Transform } from "node:stream";
import type { SqlBackupJob } from "@workspace/api-zod";
import { GetSqlBackupsResponseItem } from "@workspace/api-zod";
import { storage } from "../evidenceStorage";
import { recoveryNamespace } from "../issueRecoverySnapshot";
import type { Readable } from "node:stream";
import type { S3Client } from "@aws-sdk/client-s3";

const activeUploads = new Set<S3Client>();
export function cancelSqlUploads() {
  for (const client of activeUploads) client.destroy();
}

export const sqlBackupIdPattern = /^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function sqlPrefix() { return `recovery/sql/${recoveryNamespace()}/`; }
function key(id: string, extension: string) {
  if (!sqlBackupIdPattern.test(id)) throw new Error("Invalid SQL backup ID.");
  return `${sqlPrefix()}${extension === "json" ? "manifests" : "files"}/${id}.${extension}`;
}

export async function saveSqlJob(job: SqlBackupJob) {
  const { client, bucket } = storage();
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket, Key: key(job.id, "json"), Body: JSON.stringify({ ...job, heartbeatAt: new Date().toISOString() }),
      ContentType: "application/json",
    }));
  } finally { client.destroy(); }
}

function validateJob(value: unknown): SqlBackupJob {
  const parsed = GetSqlBackupsResponseItem.parse(value);
  if (!sqlBackupIdPattern.test(parsed.id) || !Number.isFinite(Date.parse(parsed.expiresAt)) ||
    !Number.isFinite(Date.parse(parsed.createdAt)) || parsed.sizeBytes < 0 ||
    (parsed.status === "ready" && !/^[a-f0-9]{64}$/.test(parsed.sha256))) {
    throw new Error("Invalid SQL backup manifest.");
  }
  return parsed;
}

export async function readSqlJob(id: string): Promise<SqlBackupJob> {
  const { client, bucket } = storage();
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key(id, "json") }));
    if (!result.Body || (result.ContentLength ?? 0) > 2 * 1024 * 1024) throw new Error("Invalid SQL backup manifest.");
    const raw = JSON.parse(await result.Body.transformToString());
    const job = validateJob(raw);
    if (job.id !== id) throw new Error("SQL backup identity mismatch.");
    if (job.status === "running" && (!Number.isFinite(Date.parse(raw.heartbeatAt)) ||
      Date.now() - Date.parse(raw.heartbeatAt) > 5 * 60_000)) {
      job.status = "failed"; job.stage = "Export interrupted";
      job.error = "The export worker stopped reporting progress. Create a fresh backup; incomplete exports cannot be downloaded.";
    }
    return job;
  } finally { client.destroy(); }
}

export async function listStoredSqlJobs(): Promise<SqlBackupJob[]> {
  const { client, bucket } = storage();
  try {
    const result = await client.send(new ListObjectsV2Command({
      Bucket: bucket, Prefix: `${sqlPrefix()}manifests/`, MaxKeys: 20,
    }));
    const ids = (result.Contents ?? []).map(item => item.Key!.split("/").pop()!.replace(/\.json$/, ""));
    return await Promise.all(ids.map(readSqlJob));
  } finally { client.destroy(); }
}

export function startSqlUpload(job: SqlBackupJob, estimatedBytes: number) {
  const { client, bucket } = storage(2 * 60 * 60_000);
  activeUploads.add(client);
  let bytes = 0;
  const hash = createHash("sha256");
  const body = new Transform({
    highWaterMark: 1024 * 1024,
    transform(chunk, _encoding, callback) {
      bytes += chunk.length; job.sizeBytes = bytes; hash.update(chunk); callback(null, chunk);
    },
  });
  const MiB = 1024 * 1024;
  // Scale part size to source estimates (4x allowance for SQL expansion).
  // One part in flight bounds memory; no complete file is held on disk/in RAM.
  const partSize = Math.max(16 * MiB, Math.min(256 * MiB, Math.ceil(estimatedBytes * 4 / 9999 / MiB) * MiB));
  const uploader = new Upload({
    client, queueSize: 1, partSize, leavePartsOnError: false,
    params: {
      Bucket: bucket, Key: key(job.id, "sql"), Body: body,
      ContentType: "application/sql", Metadata: { "ampera-backup-id": job.id },
      IfNoneMatch: "*",
    },
  });
  const promise = uploader.done().then(async () => {
    job.sizeBytes = bytes;
    job.sha256 = hash.digest("hex");
    job.stage = "Verifying uploaded SQL bytes";
    // Verify the uploaded bytes without buffering a potentially multi-GB file.
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key(job.id, "sql") }));
    if (!result.Body || result.ContentLength !== job.sizeBytes || result.Metadata?.["ampera-backup-id"] !== job.id) {
      throw new Error("Independent SQL backup integrity check failed.");
    }
    const verified = createHash("sha256");
    for await (const chunk of result.Body as Readable) verified.update(chunk);
    if (verified.digest("hex") !== job.sha256) throw new Error("Independent SQL backup integrity check failed.");
  }).finally(() => { body.destroy(); activeUploads.delete(client); client.destroy(); });
  // Attach immediately; producers may still be writing when upload fails.
  void promise.catch(() => body.destroy());
  return { body, promise, abort: async () => { body.destroy(); await uploader.abort(); } };
}

const matchesObject = (job: SqlBackupJob, size: number | undefined, metadata: Record<string, string> | undefined) =>
  size === job.sizeBytes && (metadata?.sha256 === job.sha256 || metadata?.["ampera-backup-id"] === job.id);

export async function openSqlDownload(job: SqlBackupJob) {
  const { client, bucket } = storage(20 * 60_000);
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key(job.id, "sql") }));
    if (!result.Body || !matchesObject(job, result.ContentLength, result.Metadata)) {
      throw new Error("SQL backup size or checksum metadata does not match its manifest.");
    }
    return { stream: result.Body as Readable, close: () => client.destroy() };
  } catch (error) { client.destroy(); throw error; }
}

export async function checkSqlDownload(job: SqlBackupJob) {
  const { client, bucket } = storage();
  try {
    const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key(job.id, "sql") }));
    if (!matchesObject(job, result.ContentLength, result.Metadata)) {
      throw new Error("SQL backup size or checksum metadata does not match its manifest.");
    }
  } finally { client.destroy(); }
}
