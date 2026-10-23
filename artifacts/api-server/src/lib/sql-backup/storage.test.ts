import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { S3Client } from "@aws-sdk/client-s3";
import type { SqlBackupJob } from "@workspace/api-zod";
import { startSqlUpload, checkSqlDownload } from "./storage";

const fixture = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock("../evidenceStorage", () => ({
  storage: () => ({ client: fixture.client, bucket: "fixture" }),
}));
vi.mock("../issueRecoverySnapshot", () => ({ recoveryNamespace: () => "isolated-test" }));

let server: Server, endpoint: string, uploaded = Buffer.alloc(0), partCount = 0;
let corrupt = false;
const parts = new Map<number, Buffer>();
let metadataId = "";
function job(): SqlBackupJob {
  return {
    id: "8200000000000-11111111-1111-4111-8111-111111111111",
    status: "running", stage: "Exporting", createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    scope: "all", content: "schema-and-data", tableIds: [], addedDependencies: [],
    database: "fixture", serverVersion: "16", filename: "ampera-fixture.sql",
    sizeBytes: 0, sha256: "", error: "",
  };
}

describe("native AWS multipart adapter with an isolated local S3 fixture", () => {
  beforeAll(async () => {
    server = createServer(async (req, res) => {
      const url = new URL(req.url!, "http://fixture");
      const xml = (body: string) => { res.setHeader("Content-Type", "application/xml"); res.end(body); };
      if (req.method === "POST" && url.searchParams.has("uploads")) {
        metadataId = String(req.headers["x-amz-meta-ampera-backup-id"] || "");
        parts.clear(); partCount = 0;
        xml("<InitiateMultipartUploadResult><Bucket>fixture</Bucket><Key>backup.sql</Key><UploadId>fixture-upload</UploadId></InitiateMultipartUploadResult>");
      } else if (req.method === "PUT" && url.searchParams.has("partNumber")) {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        parts.set(Number(url.searchParams.get("partNumber")), Buffer.concat(chunks));
        partCount++;
        res.setHeader("ETag", `"part-${partCount}"`); res.end();
      } else if (req.method === "POST" && url.searchParams.has("uploadId")) {
        for await (const _chunk of req) { /* consume completion document */ }
        uploaded = Buffer.concat([...parts].sort((a, b) => a[0] - b[0]).map(entry => entry[1]));
        xml("<CompleteMultipartUploadResult><Location>fixture</Location><Bucket>fixture</Bucket><Key>backup.sql</Key><ETag>fixture-final</ETag></CompleteMultipartUploadResult>");
      } else if (req.method === "PUT") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        metadataId = String(req.headers["x-amz-meta-ampera-backup-id"] || "");
        uploaded = Buffer.concat(chunks);
        res.setHeader("ETag", '"single-part"'); res.end();
      } else if (req.method === "GET" || req.method === "HEAD") {
        res.setHeader("Content-Length", uploaded.length);
        res.setHeader("x-amz-meta-ampera-backup-id", metadataId);
        res.end(req.method === "HEAD" ? undefined : corrupt ? Buffer.alloc(uploaded.length, 0) : uploaded);
      } else if (req.method === "DELETE") {
        parts.clear(); res.statusCode = 204; res.end();
      } else { res.statusCode = 400; res.end(); }
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(async () => {
    (fixture.client as S3Client | undefined)?.destroy();
    await new Promise<void>(resolve => server?.close(() => resolve()));
    uploaded = Buffer.alloc(0); parts.clear();
  });
  function client() {
    fixture.client = new S3Client({
      endpoint, region: "auto", forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED", maxAttempts: 1,
      credentials: { accessKeyId: "fixture-only", secretAccessKey: "fixture-only" },
    });
  }
  it("streams multiple real SDK parts and verifies the stored bytes before resolving", async () => {
    client(); corrupt = false;
    const backup = job();
    const upload = startSqlUpload(backup, 17 * 1024 * 1024);
    // More than one 16 MiB multipart chunk, with actual backpressure.
    const chunk = Buffer.alloc(1024 * 1024, 65);
    const expected = createHash("sha256");
    for (let index = 0; index < 17; index++) {
      expected.update(chunk);
      if (!upload.body.write(chunk)) await once(upload.body, "drain");
    }
    upload.body.end();
    await upload.promise;
    expect(partCount).toBe(2);
    expect(backup.sizeBytes).toBe(17 * 1024 * 1024);
    expect(backup.sha256).toBe(expected.digest("hex"));
    expect(backup.stage).toBe("Verifying uploaded SQL bytes");
    client();
    await expect(checkSqlDownload(backup)).resolves.toBeUndefined();
  }, 20_000);
  it("rejects corrupted remote bytes instead of making a backup ready", async () => {
    client(); corrupt = true;
    const upload = startSqlUpload(job(), 0);
    upload.body.end("SELECT 1;\n");
    await expect(upload.promise).rejects.toThrow("integrity check failed");
    corrupt = false;
  }, 20_000);
});
