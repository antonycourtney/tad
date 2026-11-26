/*
 * DuckDB work in progress, so an app can finish it before exiting.
 *
 * If a process exits while a DuckDB call is still running, the call
 * completes during Node's shutdown, when its result can no longer be
 * delivered to JavaScript, and @duckdb/node-api aborts the process. (In
 * Tad, quitting while a query ran crashed the app.) So apps call
 * finishPendingWork() before exiting: it interrupts running queries, stops
 * new work from starting, and waits for what's running to finish.
 */
import { DuckDBConnection } from "@duckdb/node-api";
import * as log from "loglevel";

const pending = new Set<Promise<unknown>>();
const busyConnections = new Set<DuckDBConnection>();
let finishing = false;

/** Track a DuckDB call, optionally on a connection that can be interrupted. */
export function trackWork<T>(work: () => Promise<T>, conn?: DuckDBConnection): Promise<T> {
  if (finishing) {
    return Promise.reject(new Error("DuckDB: shutting down"));
  }
  if (conn) {
    busyConnections.add(conn);
  }
  const p = work();
  pending.add(p);
  const done = () => {
    pending.delete(p);
    if (conn) {
      busyConnections.delete(conn);
    }
  };
  p.then(done, done);
  return p;
}

/** How many DuckDB calls are running. */
export const pendingWorkCount = (): number => pending.size;

/**
 * Interrupt running queries, refuse new ones, and wait (up to timeoutMs) for
 * all DuckDB calls to finish. Returns false if some were still running at
 * the deadline.
 */
export async function finishPendingWork(timeoutMs = 5000): Promise<boolean> {
  finishing = true;
  for (const conn of busyConnections) {
    try {
      conn.interrupt();
    } catch (err) {
      log.warn("finishPendingWork: interrupt failed: ", err);
    }
  }
  const deadline = Date.now() + timeoutMs;
  while (pending.size > 0) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      log.warn(`finishPendingWork: ${pending.size} DuckDB calls still running`);
      return false;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled([...pending]),
      new Promise((resolve) => {
        timer = setTimeout(resolve, remaining);
      }),
    ]);
    clearTimeout(timer);
  }
  return true;
}
