/**
 *
 * Column histograms using reltab-duckdb
 */

import {
  DuckDBDialect,
  NumericSummaryStats,
  QueryExp,
  Schema,
  cast,
  col,
  constVal,
  divide,
  minus,
  round,
  sqlQuery,
} from "reltab";
import { nice, thresholdSturges } from "./d3utils";

export interface Bin {
  lower: number;
  upper: number;
}

export function binsForColumn(colStats: NumericSummaryStats): number {
  const nullsCount = colStats.pctNull
    ? Math.ceil(colStats.pctNull * colStats.count)
    : 0;
  const valuesCount = colStats.count - nullsCount;
  const numBins = thresholdSturges(valuesCount) + 1;
  return numBins;
}

const doubleType = DuckDBDialect.columnTypes["DOUBLE"];
const intType = DuckDBDialect.columnTypes["INTEGER"];

// Query and metadata needed to form histogram query for a single column
// We return this way so that we can combine multiple histogram queries
// into a single query.
export interface NumericColumnHistogramQuery {
  colId: string;
  histoQuery: QueryExp; // query to compute histogram
  minVal: number;
  maxVal: number;
  niceMinVal: number;
  niceMaxVal: number;
  binWidth: number;
}

export function columnHistogramQuery(
  baseQuery: QueryExp,
  querySchema: Schema,
  colId: string,
  colStats: NumericSummaryStats
): NumericColumnHistogramQuery | null {
  const minVal = colStats.min;
  const maxVal = colStats.max;

  if (minVal == null || maxVal == null) {
    return null;
  }
  const numBins = binsForColumn(colStats);

  const [niceMinVal, niceMaxVal] = nice(minVal, maxVal, numBins);

  const binWidth = (niceMaxVal - niceMinVal) / numBins;

  // add a column with bin number:

  const colType = querySchema.columnType(colId);

  const binQuery = baseQuery
    .extend("column", constVal(colId))
    .extend(
      "bin",
      cast(
        round(
          divide(
            minus(
              cast(col(colId), doubleType),
              cast(constVal(niceMinVal), doubleType)
            ),
            cast(constVal(binWidth), doubleType)
          )
        ),
        intType
      )
    );

  const histoQuery = binQuery
    .extend("binCount", constVal(1))
    .groupBy(["column", "bin"], [["count", "binCount"]]);

  const ret = {
    colId,
    histoQuery,
    minVal,
    maxVal,
    niceMinVal,
    niceMaxVal,
    binWidth,
  };
  return ret;
}
