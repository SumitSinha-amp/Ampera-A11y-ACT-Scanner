import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  notifications: [] as unknown[][],
  recipients: [] as unknown[][],
  writesFail: false,
  locks: true,
}));
vi.mock("@workspace/db", () => {
  async function query(text: string, args: unknown[] = []) {
    if (text.includes("pg_try_advisory")) return { rows: [{ locked: fake.locks }] };
    if (text.startsWith("SELECT value FROM app_settings")) {
      const value = fake.settings.get(args[0] as string);
      return { rows: value ? [{ value }] : [] };
    }
    if (text.startsWith("INSERT INTO app_settings")) {
      if (fake.writesFail) throw new Error("read-only");
      fake.settings.set(args[0] as string, args[1] as string);
    }
    if (text.startsWith("SELECT id FROM users")) return { rows: [{ id: 41 }] };
    if (text.startsWith("INSERT INTO notifications ")) {
      if (fake.writesFail) throw new Error("read-only");
      fake.notifications.push(args);
      return { rows: [{ id: fake.notifications.length }] };
    }
    if (text.startsWith("INSERT INTO notification_recipients")) fake.recipients.push(args);
    return { rows: [] };
  }
  return { pool: { query, connect: async () => ({ query, release() {} }) } };
});

function azureReading(freeBytes: number) {
  const token = { ok: true, json: async () => ({ access_token: "synthetic-test-token" }) };
  const metric = { ok: true, json: async () => ({
    value: [{ name: { value: "storage_free" }, timeseries: [{
      data: [{ timeStamp: new Date().toISOString(), minimum: freeBytes }],
    }] }],
  }) };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(token).mockResolvedValueOnce(metric));
}
const resourceId = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/test/providers/Microsoft.DBforPostgreSQL/flexibleServers/test";
describe("database storage monitoring lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    fake.settings.clear(); fake.notifications.length = 0; fake.recipients.length = 0;
    fake.writesFail = false; fake.locks = true;
    fake.settings.set("azure_database_storage_config", JSON.stringify({ enabled: true, resourceId }));
    vi.stubEnv("IDENTITY_ENDPOINT", "http://127.0.0.1/synthetic-test-identity");
    vi.stubEnv("IDENTITY_HEADER", "synthetic-test-header");
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("notifies only once in an episode, persists across instances, and rearms after recovery", async () => {
    const monitor = await import("./databaseStorageMonitor");
    azureReading(4e9); await monitor.checkStorage();
    azureReading(4e9); await monitor.checkStorage();
    expect(fake.notifications).toHaveLength(1);
    expect(fake.recipients[0]).toEqual([1, [41]]);
    expect(fake.notifications[0][0]).toBe("database_storage");
    vi.resetModules();
    const anotherInstance = await import("./databaseStorageMonitor");
    azureReading(4e9); await anotherInstance.checkStorage();
    expect(fake.notifications).toHaveLength(1);
    azureReading(7e9); await anotherInstance.checkStorage();
    expect((await anotherInstance.getStorageStatus()).status).toBe("healthy");
    azureReading(5e9); await anotherInstance.checkStorage();
    expect(fake.notifications).toHaveLength(2);
    expect((await anotherInstance.getStorageStatus()).status).toBe("low");
  });
  it("shows unavailable, never healthy, when managed identity is absent", async () => {
    vi.stubEnv("IDENTITY_ENDPOINT", "");
    const monitor = await import("./databaseStorageMonitor");
    await monitor.checkStorage();
    expect((await monitor.getStorageStatus()).status).toBe("unavailable");
    expect(fake.notifications).toHaveLength(0);
  });
  it("keeps the live low-space warning when the database cannot accept writes", async () => {
    fake.writesFail = true;
    const monitor = await import("./databaseStorageMonitor");
    azureReading(1e9); await monitor.checkStorage();
    const result = await monitor.getStorageStatus();
    expect(result.status).toBe("low");
    expect(result.freeBytes).toBe(1e9);
    expect(fake.notifications).toHaveLength(0);
  });
  it("does not contact Azure when disabled", async () => {
    fake.settings.set("azure_database_storage_config", JSON.stringify({ enabled: false, resourceId }));
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const monitor = await import("./databaseStorageMonitor");
    await monitor.checkStorage();
    expect(fetch).not.toHaveBeenCalled();
    expect((await monitor.getStorageStatus()).status).toBe("disabled");
  });
  it("does not insert notifications when another instance holds the alert lock", async () => {
    fake.locks = false;
    const monitor = await import("./databaseStorageMonitor");
    azureReading(0); await monitor.checkStorage();
    expect(fake.notifications).toHaveLength(0);
    expect((await monitor.getStorageStatus()).status).toBe("low");
  });
});
