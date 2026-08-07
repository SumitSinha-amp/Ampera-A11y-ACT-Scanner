import { randomUUID } from "crypto";
import { Readable } from "stream";
import { Storage, type File } from "@google-cloud/storage";

const SIDECAR = "http://127.0.0.1:1106";
const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {}

export class ObjectStorageService {
  private privateDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR;
    if (!dir) throw new Error("PRIVATE_OBJECT_DIR is not configured");
    // PRIVATE_OBJECT_DIR is commonly provided as "/bucket/prefix". Keep the
    // internal representation slash-free so parsePath() and URL matching use
    // the same canonical form without accidentally producing "//bucket/...".
    return dir.replace(/^\/+|\/+$/g, "");
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const fullPath = `${this.privateDir()}/uploads/${randomUUID()}`;
    const { bucketName, objectName } = parsePath(fullPath);
    const response = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: objectName,
        method: "PUT",
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Unable to sign upload URL (${response.status})`);
    const data = await response.json() as { signed_url?: string };
    if (!data.signed_url) throw new Error("Storage returned no upload URL");
    return data.signed_url;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) return rawPath;
    const pathname = new URL(rawPath).pathname;
    const prefix = `/${this.privateDir()}/`;
    return pathname.startsWith(prefix) ? `/objects/${pathname.slice(prefix.length)}` : pathname;
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const { bucketName, objectName } = parsePath(`${this.privateDir()}/${objectPath.slice("/objects/".length)}`);
    const file = storage.bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }

  async downloadObject(file: File, cacheTtlSec: number, contentType?: string): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const stream = Readable.toWeb(file.createReadStream()) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      headers: {
        "Content-Type": contentType || String(metadata.contentType || "application/octet-stream"),
        "Cache-Control": `private, max-age=${cacheTtlSec}`,
      },
    });
  }
}

function parsePath(path: string): { bucketName: string; objectName: string } {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const parts = normalized.split("/");
  if (parts.length < 3 || !parts[1] || !parts.slice(2).join("/")) throw new Error("Invalid storage path");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}