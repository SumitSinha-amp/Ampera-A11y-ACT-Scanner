import { AsyncLocalStorage } from "node:async_hooks";
import type pg from "pg";

export interface AuditContext {
  actorId: string;
  requestId: string;
  source: string;
}

const context = new AsyncLocalStorage<AuditContext>();
export const withAuditContext = <T>(value: AuditContext, work: () => T): T => context.run(value, work);

/** Covers both pg callback checkouts and Drizzle's Promise checkouts. */
export function instrumentAuditPool(pool: pg.Pool): void {
  const original = pool.connect.bind(pool);
  const dirty = new WeakSet<pg.PoolClient>();
  type Callback = (error: Error | undefined, client?: pg.PoolClient, release?: (error?: Error | boolean) => void) => void;
  pool.connect = function(callback?: Callback) {
    const value = context.getStore();
    async function initialize(client: pg.PoolClient): Promise<pg.PoolClient> {
      if (value || dirty.has(client)) {
        // Parameterized values; reset on the next checkout even outside HTTP.
        await client.query(
          "SELECT set_config('ampera.actor_id',$1,false), set_config('ampera.request_id',$2,false), set_config('ampera.source',$3,false), set_config('ampera.reason','',false)",
          [value?.actorId ?? "", value?.requestId ?? "", value?.source ?? ""],
        );
        if (value) dirty.add(client); else dirty.delete(client);
      }
      return client;
    }
    if (callback) {
      original((error, client, release) => {
        if (error || !client) { callback(error ?? new Error("Database checkout failed")); return; }
        void initialize(client).then(
          () => callback(undefined, client, release),
          (failure: Error) => { release(failure); callback(failure); },
        );
      });
      return;
    }
    return original().then(async (client) => {
      try { return await initialize(client); }
      catch (error) { client.release(error as Error); throw error; }
    });
  } as typeof pool.connect;
}
