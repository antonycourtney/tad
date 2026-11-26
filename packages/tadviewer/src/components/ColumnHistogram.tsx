/**
 * A histogram of a numeric column's values, with a brush for selecting a
 * range (used to filter the column). Shown in the grid header when column
 * histograms are enabled.
 */
import * as React from "react";
import { ColumnType, NumericColumnHistogramData } from "reltab";
import {
  VictoryAxis,
  VictoryBar,
  VictoryBrushContainer,
  VictoryChart,
} from "victory";

export interface NumericColumnHistogramProps {
  histData: NumericColumnHistogramData;
  colType: ColumnType;
  onHistogramBrushRange?: (
    colId: string,
    range: [number, number] | null
  ) => void;
  onHistogramBrushFilter?: (
    colId: string,
    range: [number, number] | null
  ) => void;
}

// gross hack to round to two decimal places:
function round(value: number, decimals: number): number {
  return Number(
    Math.round(Number(value.toString() + "e" + decimals.toString())) +
      "e-" +
      decimals
  );
}
export const NumericColumnHistogram = ({
  colType,
  histData,
  onHistogramBrushRange,
  onHistogramBrushFilter,
}: NumericColumnHistogramProps) => {
  const {
    colId,
    binWidth,
    niceMinVal,
    niceMaxVal,
    binData,
    brushMinVal,
    brushMaxVal,
  } = histData;
  const chartData = binData.map((count: number, binIndex: number) => ({
    binMid: niceMinVal + (binIndex + 0.5) * binWidth,
    count,
  }));
  const fmtOpts = {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    useGrouping: true,
  };

  const handleBrush = (brushInfo: any) => {
    onHistogramBrushRange?.(colId, brushInfo.x);
  };
  const handleBrushEnd = (brushInfo: any) => {
    let [minVal, maxVal] = brushInfo.x;
    if (colType.kind === "integer") {
      minVal = Math.round(minVal);
      maxVal = Math.round(maxVal);
    } else {
      minVal = round(minVal, 2);
      maxVal = round(maxVal, 2);
    }
    onHistogramBrushFilter?.(colId, [minVal, maxVal]);
  };

  return (
    <VictoryChart
      padding={60}
      domain={{ x: [niceMinVal, niceMaxVal + binWidth * 2] }}
      containerComponent={
        <VictoryBrushContainer
          responsive={true}
          brushDimension="x"
          brushDomain={{ x: [brushMinVal, brushMaxVal] }}
          onBrushDomainChange={handleBrush}
          onBrushDomainChangeEnd={handleBrushEnd}
        />
      }
    >
      <VictoryAxis
        tickValues={[niceMinVal, niceMaxVal]}
        tickFormat={(tick: number) => tick.toLocaleString(undefined, fmtOpts)}
        style={{
          axis: { stroke: "none" },
          tickLabels: { fontSize: 40 },
        }}
      />
      <VictoryAxis
        dependentAxis
        tickCount={2}
        style={{
          axis: { stroke: "none" },
          tickLabels: { fontSize: 40 },
        }}
      />
      <VictoryBar
        style={{ data: { fill: "rgb(25, 118, 210)" } }}
        data={chartData}
        x="binMid"
        y="count"
      />
    </VictoryChart>
  );
};
