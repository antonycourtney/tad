/**
 *
 * Column histograms using reltab-duckdb
 */

import {
  DuckDBDialect,
  NumericSummaryStats,
  QueryExp,
  Schema,
  TableRep,
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
  binCount: number;
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
  const binCount = binsForColumn(colStats);

  const [niceMinVal, niceMaxVal] = nice(minVal, maxVal, binCount);

  const binWidth = (niceMaxVal - niceMinVal) / binCount;

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
    binCount,
    binWidth,
  };
  return ret;
}

export interface NumericColumnHistogramData {
  colId: string;
  niceMinVal: number;
  niceMaxVal: number;
  binCount: number;
  binWidth: number;
  binData: number[];
}

export function getNumericColumnHistogramData(
  colId: string,
  histoQuery: NumericColumnHistogramQuery,
  queryRes: TableRep
): NumericColumnHistogramData {
  const { niceMinVal, niceMaxVal, binCount, binWidth } = histoQuery;
  const numBins = Math.ceil((niceMaxVal - niceMinVal) / binWidth);
  const binData = new Array(numBins).fill(0);
  const { rowData } = queryRes;
  // we could do better by partitioning by column id, but unlikely to be a lot of data for now
  for (const row of rowData) {
    if (row.column === colId) {
      const bin = row.bin as number;
      const binCount = row.binCount;
      binData[bin] = binCount;
    }
  }
  return {
    colId,
    niceMinVal,
    niceMaxVal,
    binCount,
    binWidth,
    binData,
  };
}
