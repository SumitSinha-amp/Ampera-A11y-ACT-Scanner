import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import type { DatabasePoolClient } from "@workspace/db";
import { EventEmitter } from "node:events";
import { databasePoolBudget, routeAuthCheckouts, withAuthDatabasePriority } from "../../../../lib/db/src/connection-priority";

type DatabasePool = Parameters<typeof routeAuthCheckouts>[0];
// pg belongs to the DB workspace; resolve it there rather than relying on
// hoisted/transitive dependencies in the API workspace.
const { Pool } = createRequire(new URL("../../../../lib/db/package.json", import.meta.url))("pg") as {
  Pool: new (options: { max: number }) => DatabasePool;
};

function fixture() {
  const sharedClient = { source: "shared", release: vi.fn() };
  const authClient = { source: "auth", release: vi.fn() };
  const make = (client: typeof sharedClient) => ({
    connect: vi.fn((callback?: (error: undefined, client: typeof sharedClient, release: typeof client.release) => void) => {
      if (callback) { callback(undefined, client, client.release); return; }
      return Promise.resolve(client);
    }),
  });
  const shared = make(sharedClient);
  const auth = make(authClient);
  routeAuthCheckouts(shared as unknown as DatabasePool, auth as unknown as DatabasePool);
  return { shared, auth, sharedClient, authClient };
}

describe("reserved session/auth database capacity", () => {
  it.each([
    [undefined, true, 20, 4], [undefined, false, 10, 2],
    ["20", false, 20, 4], ["5", true, 5, 2], ["999", true, 50, 4],
    ["-10", false, 5, 2], ["invalid", true, 20, 4],
  ])("preserves the total connection budget (%s, Azure=%s)", (configured, azure, total, auth) => {
    const budget = databasePoolBudget(configured, azure);
    expect(budget).toEqual({ total, auth, shared: total - auth });
    expect(budget.shared).toBeGreaterThan(0);
  });
  it("routes async auth checkouts while leaving background work on the shared pool", async () => {
    const { shared, sharedClient, authClient } = fixture();
    const [interactive, background] = await Promise.all([
      withAuthDatabasePriority(async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return shared.connect();
      }),
      shared.connect(),
    ]);
    expect(interactive).toBe(authClient);
    expect(background).toBe(sharedClient);
    expect(await shared.connect()).toBe(sharedClient);
  });
  it("preserves callback checkouts and the originating pool's release function", async () => {
    const { shared, authClient } = fixture();
    await withAuthDatabasePriority(() => new Promise<void>((resolve) => {
      shared.connect((error, client, release) => {
        expect(error).toBeUndefined();
        expect(client).toBe(authClient);
        release();
        resolve();
      });
    }));
    expect(authClient.release).toHaveBeenCalledOnce();
  });
  it("does not wait for a saturated shared pool to service auth", async () => {
    const { shared, auth, authClient } = fixture();
    const held = new Promise<never>(() => {});
    shared.connect = vi.fn(() => held);
    routeAuthCheckouts(shared as unknown as DatabasePool, auth as unknown as DatabasePool);
    expect(await withAuthDatabasePriority(() => shared.connect())).toBe(authClient);
  });
  it("routes real pg Pool.query Promise and callback paths without acquiring shared capacity", async () => {
    const shared = new Pool({ max: 1 });
    const auth = new Pool({ max: 1 });
    const release = vi.fn();
    const client = Object.assign(new EventEmitter(), {
      release,
      query: vi.fn((_text, _values, done) => {
        queueMicrotask(() => done(undefined, { rows: [{ ready: true }] }));
      }),
    }) as unknown as DatabasePoolClient;
    type Callback = (error: Error | undefined, client?: DatabasePoolClient, release?: (error?: Error | boolean) => void) => void;
    const sharedConnect = vi.fn(() => new Promise<never>(() => {}));
    shared.connect = sharedConnect as typeof shared.connect;
    auth.connect = vi.fn((callback?: Callback) => {
      if (callback) { callback(undefined, client, release); return; }
      return Promise.resolve(client);
    }) as typeof auth.connect;
    routeAuthCheckouts(shared, auth);
    try {
      const result = await withAuthDatabasePriority(() => shared.query("SELECT true AS ready"));
      expect(result.rows).toEqual([{ ready: true }]);
      await withAuthDatabasePriority(() => new Promise<void>((resolve, reject) => {
        shared.query("SELECT true AS ready", (error, result) => {
          if (error) { reject(error); return; }
          expect(result.rows).toEqual([{ ready: true }]);
          resolve();
        });
      }));
      expect(sharedConnect).not.toHaveBeenCalled();
      expect(release).toHaveBeenCalledTimes(2);
    } finally { await Promise.all([shared.end(), auth.end()]); }
  });
  it("does not fall back to saturated shared capacity when auth checkout fails", async () => {
    const { shared, auth } = fixture();
    auth.connect.mockRejectedValueOnce(new Error("auth database unavailable"));
    routeAuthCheckouts(shared as unknown as DatabasePool, auth as unknown as DatabasePool);
    await expect(withAuthDatabasePriority(() => shared.connect())).rejects.toThrow("auth database unavailable");
  });
});
