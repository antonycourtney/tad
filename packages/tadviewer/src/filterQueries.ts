/*
 * Queries for the filter bar's popovers: a column's values with their
 * counts, and a number column's histogram, under the other filters.
 */
import {
  and,
  cast,
  col,
  colIsString,
  columnHistogramQuery,
  constVal,
  DataSourceConnection,
  divide,
  FilterExp,
  floor,
  getNumericColumnHistogramData,
  minus,
  NumericSummaryStats,
  QueryExp,
  Schema,
} from "reltab";

/** How many of a column's values the value list shows (most common first). */
export const VALUE_LIMIT = 200;

const COUNT = "__tad_n";
const VALUE = "__tad_v";

export interface ValueCount {
  /** The value (as text), or null for rows with no value. */
  value: string | null;
  count: number;
}

export interface ValueCounts {
  /** The most common values (and NULL), at most VALUE_LIMIT. */
  values: ValueCount[];
  /** How many distinct values there are (including NULL). */
  distinct: number;
}

const filtered = (q: QueryExp, fe: FilterExp | null): QueryExp =>
  fe !== null && fe.opArgs.length > 0 ? q.filter(fe) : q;

/**
 * The column's values as text. Values of other types (dates, booleans...)
 * are compared as text too, which the filter's IN lists then match.
 */
function valueQuery(baseQuery: QueryExp, schema: Schema, column: string): QueryExp {
  const ct = schema.columnType(column);
  const v = colIsString(ct)
    ? col(column)
    : cast(col(column), schema.dialect.coreColumnTypes.string);
  return baseQuery.extend(VALUE, v).extend(COUNT, constVal(1));
}

const toValueCounts = (rows: any[]): ValueCount[] =>
  rows.map((r) => ({
    value: r[VALUE] == null ? null : String(r[VALUE]),
    count: Number(r[COUNT]),
  }));

/**
 * The column's values and how many rows have each, in rows that pass
 * `others` (the other filters), most common first. With `search`, only
 * values containing it (ignoring case).
 */
export async function getValueCounts(
  dbc: DataSourceConnection,
  baseQuery: QueryExp,
  schema: Schema,
  column: string,
  others: FilterExp | null,
  search: string
): Promise<ValueCounts> {
  let q = valueQuery(filtered(baseQuery, others), schema, column);
  if (search !== "") {
    q = q.filter(and().contains(col(VALUE), constVal(search)));
  }
  const grouped = q.project([VALUE, COUNT]).groupBy([VALUE], [["sum", COUNT]]);
  const [res, distinct] = await Promise.all([
    dbc.evalQuery(
      grouped.sort([
        [COUNT, false],
        [VALUE, true],
      ]),
      0,
      VALUE_LIMIT
    ),
    dbc.rowCount(grouped),
  ]);
  return { values: toValueCounts(res.rowData), distinct };
}

/** Counts for particular values (e.g. ticked ones beyond the most common). */
export async function getCountsFor(
  dbc: DataSourceConnection,
  baseQuery: QueryExp,
  schema: Schema,
  column: string,
  others: FilterExp | null,
  values: string[]
): Promise<ValueCount[]> {
  if (values.length === 0) {
    return [];
  }
  const q = valueQuery(filtered(baseQuery, others), schema, column)
    .filter(and().chainBinRelExp("IN", col(VALUE), constVal(values as any)))
    .project([VALUE, COUNT])
    .groupBy([VALUE], [["sum", COUNT]]);
  const res = await dbc.evalQuery(q);
  return toValueCounts(res.rowData);
}

/** How many rows pass a filter. */
export async function countRows(
  dbc: DataSourceConnection,
  baseQuery: QueryExp,
  fe: FilterExp | null
): Promise<number> {
  return dbc.rowCount(filtered(baseQuery, fe));
}

/** Bin i counts values from start + i * binWidth, up to the next bin's start. */
export interface Histogram {
  start: number;
  binWidth: number;
  counts: number[];
}

/** About how many bars an integer column's histogram has (at most). */
const INT_BINS = 30;

export interface NumberSummary {
  histogram: Histogram | null;
  min: number | null;
  max: number | null;
  /** Rows (passing the other filters) with no value. */
  nullCount: number;
}

/**
 * A number column's histogram, over the column's whole range but counting
 * only rows that pass `others`, and how many of those rows have no value.
 */
export async function getNumberSummary(
  dbc: DataSourceConnection,
  baseQuery: QueryExp,
  schema: Schema,
  column: string,
  others: FilterExp | null
): Promise<NumberSummary> {
  const lo = "__tad_lo";
  const hi = "__tad_hi";
  const statsQuery = baseQuery
    .extend(lo, col(column))
    .extend(hi, col(column))
    .extend(COUNT, constVal(1))
    .filter(and().isNotNull(col(column)))
    .project([lo, hi, COUNT])
    .extend(VALUE, constVal(1))
    .groupBy(
      [VALUE],
      [
        ["min", lo],
        ["max", hi],
        ["sum", COUNT],
      ]
    );
  const nullsQuery = filtered(baseQuery, others).filter(and().isNull(col(column)));
  const [statsRes, nullCount] = await Promise.all([
    dbc.evalQuery(statsQuery),
    dbc.rowCount(nullsQuery),
  ]);
  const row = statsRes.rowData[0];
  const min = row && row[lo] != null ? Number(row[lo]) : null;
  const max = row && row[hi] != null ? Number(row[hi]) : null;
  if (min === null || max === null) {
    return { histogram: null, min, max, nullCount };
  }
  if (schema.columnType(column).kind === "integer") {
    const histogram = await getIntegerHistogram(dbc, baseQuery, column, others, min, max);
    return { histogram, min, max, nullCount };
  }
  const stats: NumericSummaryStats = {
    statsType: "numeric",
    min,
    max,
    approxUnique: 0,
    count: Number(row[COUNT]),
    pctNull: 0,
  };
  const hq = columnHistogramQuery(
    filtered(baseQuery, others),
    column,
    schema.columnType(column),
    stats
  );
  if (hq === null) {
    return { histogram: null, min, max, nullCount };
  }
  const res = await dbc.evalQuery(hq.histoQuery);
  const h = getNumericColumnHistogramData(column, hq, res);
  return {
    histogram: { start: h.niceMinVal, binWidth: h.binWidth, counts: h.binData },
    min,
    max,
    nullCount,
  };
}

/**
 * An integer column's histogram, with bins a whole number of values wide
 * (so that none is empty just for falling between two integers).
 */
async function getIntegerHistogram(
  dbc: DataSourceConnection,
  baseQuery: QueryExp,
  column: string,
  others: FilterExp | null,
  min: number,
  max: number
): Promise<Histogram> {
  const BIN = "__tad_bin";
  const binWidth = Math.max(1, Math.ceil((max - min + 1) / INT_BINS));
  const binCount = Math.floor((max - min) / binWidth) + 1;
  const q = filtered(baseQuery, others)
    .filter(and().isNotNull(col(column)))
    .extend(BIN, floor(divide(minus(col(column), constVal(min)), constVal(binWidth))))
    .extend(COUNT, constVal(1))
    .project([BIN, COUNT])
    .groupBy([BIN], [["sum", COUNT]]);
  const res = await dbc.evalQuery(q);
  const counts = new Array(binCount).fill(0);
  for (const row of res.rowData) {
    const i = Number(row[BIN]);
    if (i >= 0 && i < binCount) {
      counts[i] = Number(row[COUNT]);
    }
  }
  return { start: min, binWidth, counts };
}
