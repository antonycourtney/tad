/**
 *
 * Column histograms using reltab
 */

import { ColumnType, colIsNumeric } from "./ColumnType";
import { DataSourceConnection } from "./DataSource";
import { QueryExp } from "./QueryExp";
import { NumericSummaryStats, Schema } from "./Schema";
import { TableRep } from "./TableRep";
import { nice, thresholdSturges } from "./d3utils";
import { constVal, cast, minus, col, round, divide } from "./defs";
import { DuckDBDialect } from "./dialectRegistry";

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

// TODO: adjust to work with any dialect:
// grab dialect.coreColumnTypes.real
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
  colId: string,
  colType: ColumnType,
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

// histogram data for rendering a single column histogram
export interface NumericColumnHistogramData {
  colId: string;
  niceMinVal: number;
  niceMaxVal: number;
  binCount: number;
  binWidth: number;
  binData: number[];
}

/*
 *
 * Given the result of running a histogram query, extract the histogram data for a single column
 */
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

export type ColumnHistogramMap = {
  [colId: string]: NumericColumnHistogramData;
};

export async function getColumnHistogramMap(
  dsConn: DataSourceConnection,
  baseQuery: QueryExp,
  baseSchema: Schema
): Promise<ColumnHistogramMap> {
  const histoMap: ColumnHistogramMap = {};

  // TODO: join this into one mega-query that does a union all
  for (const colId of baseSchema.columns) {
    const colType = baseSchema.columnType(colId);
    if (colIsNumeric(colType)) {
      const colStats = baseSchema.columnStats(colId);
      if (colStats != null) {
        const histoInfo = columnHistogramQuery(
          baseQuery,
          colId,
          colType,
          colStats as NumericSummaryStats
        );
        if (histoInfo) {
          console.log("getting histo for colId: ", colId);
          const histoRes = await dsConn.evalQuery(histoInfo!.histoQuery);
          const histoData = getNumericColumnHistogramData(
            colId,
            histoInfo,
            histoRes
          );
          console.log("histogram data: ", histoData);
          histoMap[colId] = histoData;
        }
      }
    }
  }
  return histoMap;
}
