export type NumericSummaryStats = {
  statsType: "numeric";
  min: number | null;
  max: number | null;
  approxUnique: number | null;
  count: number;
  pctNull: number | null;
};

export type TextSummaryStats = {
  statsType: "text";
  min: number | null;
  max: number | null;
  approxUnique: number | null;
  count: number;
  pctNull: number | null;
};

export type ColumnStatsMap = Record<
  string,
  NumericSummaryStats | TextSummaryStats | null
>;
