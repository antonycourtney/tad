/**
 * Aggregation functions.
 *
 */

// We'll eventually want to turn this into a richer type like ColumnType, but let's
// stick with the simple enum for now:
// We'll add "nullstr" here, but don't expect it to show up in any UI; generated
// during toSql elaboration step.
export type AggFn =
  | "avg"
  | "count"
  | "min"
  | "max"
  | "sum"
  | "uniq"
  | "null"
  | "nullstr";

export const basicAggFns: AggFn[] = ["min", "max", "uniq", "null"];
export const numericAggFns: AggFn[] = [
  "avg",
  "count",
  "min",
  "max",
  "sum",
  "uniq",
  "null",
];
