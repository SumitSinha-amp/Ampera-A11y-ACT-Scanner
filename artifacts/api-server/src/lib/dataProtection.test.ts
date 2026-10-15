import { describe, it, expect, vi, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { encryptRecovery, decryptRecovery } from "./recoveryExport";
import { auditObjectKey, evidenceStorageConfig, sha256, writeEvidence } from "./evidenceStorage";
import { copyPendingEvidence, recordAdministrativeAudit, assertDataProtectionReady } from "./dataProtection";
import { pool } from "@workspace/db";
import { DATA_PROTECTION_SQL } from "./dataProtectionSql";
import { instrumentAuditPool, withAuditContext } from "../../../../lib/db/src/audit-context";

vi.mock("@workspace/db", () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));
vi.mock("./evidenceStorage", async (importOriginal) => ({
  ...await importOriginal<typeof import("./evidenceStorage")>(),
  writeEvidence: vi.fn(),
}));

describe("recovery envelope", () => {
  it("round-trips encrypted compressed metadata", () => {
    const original = Buffer.from(JSON.stringify({ private: "recovery test" }));
    const encrypted = encryptRecovery(original, "a recovery passphrase for testing");
    expect(encrypted.includes(Buffer.from("recovery test"))).toBe(false);
    expect(decryptRecovery(encrypted, "a recovery passphrase for testing")).toEqual(original);
  });
  it("rejects an incorrect passphrase and tampered bytes", () => {
    const encrypted = encryptRecovery(Buffer.from("private"), "a recovery passphrase for testing");
    expect(() => decryptRecovery(encrypted, "a different recovery passphrase")).toThrow();
    encrypted[encrypted.length - 1] ^= 1;
    expect(() => decryptRecovery(encrypted, "a recovery passphrase for testing")).toThrow();
  });
  it("requires a sufficiently long passphrase", () => {
    expect(() => encryptRecovery(Buffer.from("x"), "short")).toThrow(/passphrase/);
  });
});

describe("evidence naming and separation", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("uses a stable unique event ID and date", () => {
    const id = randomUUID();
    expect(auditObjectKey(id, "2026-10-13T11:00:00Z")).toBe(`audit/2026/10/13/${id}.json`);
    expect(() => auditObjectKey("../../wrong", new Date())).toThrow();
    expect(() => auditObjectKey(id, "invalid")).toThrow();
    expect(sha256(Buffer.from("evidence"))).toHaveLength(64);
  });
  it("requires separate complete bucket-scoped configuration", () => {
    vi.stubEnv("R2_EVIDENCE_ENDPOINT", "https://example.r2.cloudflarestorage.com");
    vi.stubEnv("R2_EVIDENCE_BUCKET_NAME", "evidence-bucket");
    vi.stubEnv("R2_EVIDENCE_ACCESS_KEY_ID", "test-id");
    vi.stubEnv("R2_EVIDENCE_SECRET_ACCESS_KEY", "test-secret");
    vi.stubEnv("R2_BUCKET_NAME", "attachments");
    expect(evidenceStorageConfig().bucket).toBe("evidence-bucket");
    vi.stubEnv("R2_BUCKET_NAME", "evidence-bucket");
    expect(() => evidenceStorageConfig()).toThrow(/separate/);
    vi.stubEnv("R2_BUCKET_NAME", "attachments");
    vi.stubEnv("R2_EVIDENCE_ENDPOINT", "https://untrusted.example");
    expect(() => evidenceStorageConfig()).toThrow(/secure/);
  });
});

describe("pooled audit provenance", () => {
  function fixture() {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const release = vi.fn();
    const client = { query, release };
    const pool = {
      connect(callback?: (error: Error | undefined, client: unknown, release: unknown) => void) {
        if (callback) { callback(undefined, client, release); return; }
        return Promise.resolve(client);
      },
    } as unknown as Parameters<typeof instrumentAuditPool>[0];
    instrumentAuditPool(pool);
    return { pool, query, release };
  }
  it("sets provenance on Promise checkout and clears it outside the request", async () => {
    const { pool, query } = fixture();
    await withAuditContext({ actorId: "42", requestId: "one", source: "POST /issues" }, async () => {
      const client = await pool.connect(); client.release();
    });
    const next = await pool.connect(); next.release();
    expect(query.mock.calls.map(call => call[1])).toEqual([
      ["42", "one", "POST /issues"], ["", "", ""],
    ]);
  });
  it("supports pg Pool.query callback checkout", async () => {
    const { pool, query } = fixture();
    await withAuditContext({ actorId: "84", requestId: "two", source: "DELETE /sites/1" }, () =>
      new Promise<void>((resolve, reject) => {
        pool.connect((error, _client, release) => {
          if (error) { reject(error); return; }
          release(); resolve();
        });
      }));
    expect(query.mock.calls[0][1]).toEqual(["84", "two", "DELETE /sites/1"]);
  });
  it("discards a connection if context initialization fails", async () => {
    const { pool, query, release } = fixture();
    query.mockRejectedValueOnce(new Error("failed"));
    await expect(withAuditContext({ actorId: "1", requestId: "three", source: "POST /test" },
      () => pool.connect())).rejects.toThrow("failed");
    expect(release).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe("audit migration safety", () => {
  it("has no cascading parent reference and enqueues inside the row trigger", () => {
    expect(DATA_PROTECTION_SQL).not.toMatch(/REFERENCES (users|app_issues)/);
    expect(DATA_PROTECTION_SQL).toContain("INSERT INTO public.data_evidence_outbox");
    expect(DATA_PROTECTION_SQL).toContain("BEFORE UPDATE OR DELETE OR TRUNCATE");
    expect(DATA_PROTECTION_SQL).toContain("SECURITY DEFINER SET search_path = pg_catalog, public");
  });
});

describe("independent evidence outbox", () => {
  afterEach(() => vi.clearAllMocks());
  it("keeps failed evidence queued with a redacted error and retry time", async () => {
    const id = randomUUID();
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ event_id: id, attempts: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ id, created_at: new Date("2026-10-13T10:00:00Z") }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    vi.mocked(writeEvidence).mockRejectedValueOnce(new Error("a private credential must never reach persisted errors"));
    await copyPendingEvidence();
    const calls = vi.mocked(pool.query).mock.calls;
    expect(calls[0][0]).toContain("FOR UPDATE SKIP LOCKED");
    expect(calls[2][0]).toContain("next_attempt_at=NOW()");
    expect(JSON.stringify(calls[2][1])).not.toContain("private credential");
    expect(JSON.stringify(calls[2][1])).toContain("queued records will retry");
  });
  it("only marks evidence delivered after independently verified storage succeeds", async () => {
    const id = randomUUID();
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ event_id: id, attempts: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ id, created_at: new Date("2026-10-13T10:00:00Z") }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    vi.mocked(writeEvidence).mockResolvedValueOnce("verified-digest");
    await copyPendingEvidence();
    const calls = vi.mocked(pool.query).mock.calls;
    expect(calls[2][0]).toContain("uploaded_at=NOW()");
    expect(calls[2][1]).toEqual([id, `audit/2026/10/13/${id}.json`, "verified-digest"]);
  });
});

describe("administrative audit inserts", () => {
  it("casts shared UUID/text parameters explicitly and commits audit/outbox together", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const release = vi.fn();
    vi.mocked(pool.connect).mockResolvedValueOnce({ query, release } as never);
    await recordAdministrativeAudit("recovery_verified", "8", { counts: { users: 1 } });
    expect(query.mock.calls[1][0]).toContain("$1::uuid");
    expect(query.mock.calls[1][0]).toContain("$1::text");
    expect(query.mock.calls[1][0]).toContain("current_setting('ampera.request_id',true)");
    expect(query.mock.calls[2][0]).toContain("INSERT INTO data_evidence_outbox");
    expect(query.mock.calls[3][0]).toBe("COMMIT");
    expect(release).toHaveBeenCalled();
  });
});

describe("restricted runtime startup", () => {
  it("refuses startup when explicit protection migrations or triggers are missing", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ ready: false }] } as never);
    await expect(assertDataProtectionReady()).rejects.toThrow(/apply explicit migrations/);
  });
  it("accepts an installed enabled protection schema without executing DDL", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ ready: true }] } as never);
    await expect(assertDataProtectionReady()).resolves.toBeUndefined();
    const last = vi.mocked(pool.query).mock.calls.at(-1);
    expect(last?.[0]).toContain("tgenabled IN ('O','A')");
    expect(last?.[0]).not.toMatch(/CREATE|ALTER|DROP/);
  });
});
