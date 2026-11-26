/*
 * Which UI to show around the grid while the new one (see doc/ui-todo.md)
 * replaces the Blueprint one: "blueprint" (the default) or "new". Chosen
 * with TAD_UI in the environment (Electron, where the renderer can read
 * process.env) or localStorage.tadUI (e.g. the web app), like TAD_GRID for
 * the grid (see GridPane.tsx).
 */
export type UIImpl = "blueprint" | "new";

const DEFAULT_UI: UIImpl = "blueprint";

const known = (s: string | null | undefined): UIImpl | null =>
  s === "blueprint" || s === "new" ? s : null;

export const uiImpl: UIImpl = (() => {
  try {
    if (typeof process !== "undefined") {
      const impl = known(process.env?.TAD_UI);
      if (impl) {
        return impl;
      }
    }
  } catch (e) {}
  try {
    return known(globalThis.localStorage?.getItem("tadUI")) ?? DEFAULT_UI;
  } catch (e) {
    return DEFAULT_UI;
  }
})();

export const newUI = uiImpl === "new";
