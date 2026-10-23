import { AsyncLocalStorage } from "node:async_hooks";
import type pg from "pg";

const authPriority = new AsyncLocalStorage<boolean>();

export function withAuthDatabasePriority<T>(work: () => T): T {
  return authPriority.run(true, work);
}

/** Reserve capacity without increasing the deployment's connection budget. */
export function databasePoolBudget(configured: string | undefined, azure: boolean) {
  const parsed = Number.parseInt(configured ?? "", 10);
  const total = Number.isFinite(parsed) ? Math.min(50, Math.max(5, parsed)) : azure ? 20 : 10;
  const auth = Math.min(4, Math.max(2, Math.floor(total / 5)));
  return { total, auth, shared: total - auth };
}

/** pg Pool.query and Drizzle both acquire clients through Pool.connect. */
export function routeAuthCheckouts(shared: pg.Pool, auth: pg.Pool): void {
  const sharedConnect = shared.connect.bind(shared);
  const authConnect = auth.connect.bind(auth);
  type Callback = (error: Error | undefined, client?: pg.PoolClient, release?: (error?: Error | boolean) => void) => void;
  shared.connect = function(callback?: Callback) {
    const connect = authPriority.getStore() ? authConnect : sharedConnect;
    return callback ? connect(callback) : connect();
  } as typeof shared.connect;
}
