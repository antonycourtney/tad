/*
 * Requests between parts of the new UI that don't share a parent close by:
 * the header menu's "Filter…" asks the filter bar to open the column's chip.
 */
type Listener = (column: string) => void;

const filterListeners = new Set<Listener>();

/** Ask the filter bar to open the column's chip (adding one if needed). */
export const requestColumnFilter = (column: string): void => {
  filterListeners.forEach((l) => l(column));
};

/** Listen for requestColumnFilter; returns a function that stops listening. */
export const onColumnFilterRequest = (listener: Listener): (() => void) => {
  filterListeners.add(listener);
  return () => {
    filterListeners.delete(listener);
  };
};
