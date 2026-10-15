import { createHash, randomUUID } from "node:crypto";
import { S3Client, GetObjectCommand, HeadBucketCommand, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

export function evidenceStorageConfig() {
  const endpoint = process.env.R2_EVIDENCE_ENDPOINT?.trim();
  const bucket = process.env.R2_EVIDENCE_BUCKET_NAME?.trim();
  const accessKeyId = (process.env.R2_EVIDENCE_ACCESS_KEY_ID_1 || process.env.R2_EVIDENCE_ACCESS_KEY_ID)?.trim();
  const secretAccessKey = (process.env.R2_EVIDENCE_SECRET_ACCESS_KEY_1 || process.env.R2_EVIDENCE_SECRET_ACCESS_KEY)?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error("Independent R2 evidence storage is not configured");
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(bucket)) throw new Error("Invalid evidence bucket name");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.endsWith(".r2.cloudflarestorage.com")) {
    throw new Error("Evidence endpoint must be a secure Cloudflare R2 S3 endpoint");
  }
  if (bucket === (process.env.R2_BUCKET_NAME?.trim() || "issue-attachments")) throw new Error("Evidence must use a separate bucket from issue attachments");
  return { endpoint, bucket, accessKeyId, secretAccessKey };
}

function storage() {
  const config = evidenceStorageConfig();
  return {
    bucket: config.bucket,
    client: new S3Client({
      endpoint: config.endpoint, region: "auto", forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      requestHandler: { connectionTimeout: 5_000, requestTimeout: 30_000 },
      maxAttempts: 2,
    }),
  };
}
export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export function auditObjectKey(id: string, createdAt: Date | string): string {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid audit event ID");
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid audit event date");
  return `audit/${date.toISOString().slice(0, 10).replaceAll("-", "/")}/${id}.json`;
}

export async function readEvidence(key: string, verifyStoredChecksum = false): Promise<Buffer> {
  if (!/^(audit|health|recovery)\//.test(key) || key.includes("..")) throw new Error("Invalid evidence path");
  const { client, bucket } = storage();
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body) throw new Error("Evidence object is empty");
    if ((result.ContentLength ?? 0) > 64 * 1024 * 1024) throw new Error("Evidence object exceeds the supported verification limit");
    const bytes = Buffer.from(await result.Body.transformToByteArray());
    if (bytes.length > 64 * 1024 * 1024) throw new Error("Evidence object exceeds the supported verification limit");
    if (verifyStoredChecksum && (!result.Metadata?.sha256 || sha256(bytes) !== result.Metadata.sha256)) {
      throw new Error("Independent evidence checksum mismatch");
    }
    return bytes;
  } finally { client.destroy(); }
}

/** R2, not a database index, is the authoritative recovery catalogue. */
export async function listEvidence(prefix: string, cursor?: string) {
  if (!prefix.startsWith("recovery/issues/") || prefix.includes("..")) throw new Error("Invalid recovery prefix");
  const { client, bucket } = storage();
  try {
    const result = await client.send(new ListObjectsV2Command({
      Bucket: bucket, Prefix: prefix, MaxKeys: 20, ContinuationToken: cursor,
    }));
    return { objects: (result.Contents ?? []).map(object => ({
      key: object.Key!, sizeBytes: object.Size ?? 0, createdAt: object.LastModified?.toISOString() ?? null,
    })), nextCursor: result.NextContinuationToken ?? null };
  } finally { client.destroy(); }
}

/** Conditional writes never replace a previously stored evidence object. */
export async function writeEvidence(key: string, bytes: Buffer, contentType = "application/json"): Promise<string> {
  if (!/^(audit|health|recovery)\//.test(key) || key.includes("..")) throw new Error("Invalid evidence path");
  if (bytes.length > 64 * 1024 * 1024) throw new Error("Evidence object exceeds the supported verification limit");
  const digest = sha256(bytes);
  const { client, bucket } = storage();
  try {
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket, Key: key, Body: bytes, ContentLength: bytes.length,
        ContentType: contentType, IfNoneMatch: "*", Metadata: { sha256: digest },
      }));
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 412) throw error;
      // A retry after an upload succeeded must match the original bytes.
    }
    if (sha256(await readEvidence(key)) !== digest) throw new Error("Independent evidence integrity verification failed");
    return digest;
  } finally { client.destroy(); }
}

export async function checkEvidenceStorage(): Promise<{ bucket: string; verified: boolean }> {
  const { client, bucket } = storage();
  try { await client.send(new HeadBucketCommand({ Bucket: bucket })); }
  finally { client.destroy(); }
  const key = `health/${randomUUID()}.json`;
  await writeEvidence(key, Buffer.from(JSON.stringify({ kind: "ampera-evidence-storage-check", checkedAt: new Date().toISOString() })));
  return { bucket, verified: true };
}
