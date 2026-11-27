/*
 * The new UI's own preferences (the sidebar's width, the column lists'
 * order), kept in localStorage so that they last from one session to the
 * next. A preference is shared: every component that reads it shows a change
 * at once (in this window; other windows pick it up when they next open).
 *
 * localStorage can be missing or full; then a preference lasts only for the
 * session.
 */
import { useSyncExternalStore } from "react";

export interface Pref<T> {
  get: () => T;
  set: (value: T) => void;
  subscribe: (listener: () => void) => () => void;
}

const KEY_PREFIX = "tad.ui.";

export function pref<T>(name: string, fallback: T, valid: (v: unknown) => v is T): Pref<T> {
  const key = KEY_PREFIX + name;
  const listeners = new Set<() => void>();
  let value: T | undefined;
  const get = (): T => {
    if (value === undefined) {
      value = fallback;
      try {
        const stored = window.localStorage.getItem(key);
        const parsed = stored === null ? undefined : JSON.parse(stored);
        if (valid(parsed)) {
          value = parsed;
        }
      } catch (e) {
        // No storage, or something else's value: use the fallback.
      }
    }
    return value;
  };
  const set = (v: T) => {
    if (v === get()) {
      return;
    }
    value = v;
    try {
      window.localStorage.setItem(key, JSON.stringify(v));
    } catch (e) {
      // Remembered for this session only.
    }
    listeners.forEach((l) => l());
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  return { get, set, subscribe };
}

export const usePref = <T>(p: Pref<T>): T => useSyncExternalStore(p.subscribe, p.get);

// --- the sidebar's width (shared by the Data sources and View settings panels) ---

export const SIDEBAR_WIDTH = 336;
export const SIDEBAR_MIN_WIDTH = 280;
export const SIDEBAR_MAX_WIDTH = 640;

export const sidebarWidth = pref(
  "sidebarWidth",
  SIDEBAR_WIDTH,
  (v): v is number => typeof v === "number" && v >= SIDEBAR_MIN_WIDTH && v <= SIDEBAR_MAX_WIDTH
);

// --- the order of the column lists: the table's, or A to Z by name ---

export type ColumnListOrder = "table" | "az";

export const columnListOrder = pref(
  "columnListOrder",
  "table" as ColumnListOrder,
  (v): v is ColumnListOrder => v === "table" || v === "az"
);
