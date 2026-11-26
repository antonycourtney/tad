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
  /**
   * The chart's size in pixels. When given (as by DomDataGrid), the chart is
   * drawn at that size in the grid's style: bars, the brush and the min / max
   * values, with no y axis. Otherwise it scales to fit its container (as in
   * the SlickGrid header row).
   */
  width?: number;
  height?: number;
}

// gross hack to round to two decimal places:
function round(value: number, decimals: number): number {
  return Number(
    Math.round(Number(value.toString() + "e" + decimals.toString())) +
      "e-" +
      decimals
  );
}
export const NumericColumnHistogram = React.memo(function NumericColumnHistogram({
  colType,
  histData,
  onHistogramBrushRange,
  onHistogramBrushFilter,
  width,
  height,
}: NumericColumnHistogramProps) {
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

  if (width != null && height != null) {
    const padding = { top: 6, bottom: 17, left: 8, right: 8 };
    const domainMax = niceMinVal + binData.length * binWidth;
    const plotWidth = Math.max(1, width - padding.left - padding.right);
    const barWidth = Math.max(1, plotWidth / binData.length - 1);
    const label = (tick: number) => tick.toLocaleString(undefined, fmtOpts);
    // Only draw the brush when it selects part of the range:
    const brushed = brushMinVal > niceMinVal || brushMaxVal < niceMaxVal;
    return (
      <VictoryChart
        width={width}
        height={height}
        padding={padding}
        domain={{ x: [niceMinVal, domainMax] }}
        containerComponent={
          <VictoryBrushContainer
            responsive={false}
            brushDimension="x"
            brushDomain={{ x: [brushMinVal, brushMaxVal] }}
            brushStyle={
              brushed
                ? {
                    fill: "var(--tad-grid-histogram-brush)",
                    stroke: "var(--tad-grid-selection-ring)",
                    strokeWidth: 1,
                  }
                : { fill: "transparent", stroke: "none" }
            }
            onBrushDomainChange={handleBrush}
            onBrushDomainChangeEnd={handleBrushEnd}
          />
        }
      >
        <VictoryAxis
          tickValues={[niceMinVal, domainMax]}
          tickFormat={(_tick: number, index: number) =>
            label(index === 0 ? niceMinVal : niceMaxVal)
          }
          style={{
            axis: { stroke: "var(--tad-grid-header-line)" },
            ticks: { stroke: "none" },
            tickLabels: {
              fontSize: 9,
              fontFamily: "inherit",
              fill: "var(--tad-grid-text-dim)",
              padding: 3,
              textAnchor: ({ index }: any) => (index === 0 ? "start" : "end"),
            },
          }}
        />
        <VictoryBar
          style={{ data: { fill: "var(--tad-grid-histogram-bar)" } }}
          data={chartData}
          x="binMid"
          y="count"
          barWidth={barWidth}
        />
      </VictoryChart>
    );
  }

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
});
