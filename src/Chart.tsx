/*
 * TimeSeriesChart & CategoricalChart - React components for data visualization
 *
 * Uses D3 for scales/line generation, renders as React SVG elements.
 *
 * TimeSeriesChart PROPS:
 *   title?: string          - chart title
 *   timeSeries: []          - array of {label, color, variant?, data: number[]}
 *                             variant: "line" (default) | "area" | "bars"
 *   time: Date[]            - x-axis dates (same length as data arrays)
 *   timeFormat: fn          - (date: Date) => string for x-axis labels
 *   legendWidth?: number[]  - column widths for legend, e.g. [120, 120] = 2 columns
 *                             omit to hide legend
 *   showAxis?: boolean      - show X/Y axes (default: true)
 *   stackedAreas?: boolean  - stack area variants (lines/bars not stacked)
 *   layoutRows?: []         - vertical order: "title" | "chart" | "legend"
 *                             (default: ["title", "chart", "legend"])
 *
 * CategoricalChart PROPS:
 *   title?: string          - chart title
 *   labels: string[]        - x-axis category labels
 *   series: []              - array of {label, color, variant?, values: number[]}
 *                             variant: "bar" (default) | "line"
 *   legendWidth?: number[]  - column widths for legend
 *   showAxis?: boolean      - show X/Y axes (default: true)
 *   stackedBars?: boolean   - stack bar variants (lines not stacked)
 *   layoutRows?: []         - vertical order: "title" | "chart" | "legend"
 *
 * FEATURES:
 *   - Supports negative values with automatic zero line
 *   - Bottom inset added only when data has negative values
 *
 * LAYOUT:
 *   - Elements positioned with absolute coords (no <g transform>)
 *   - Axes always attached to "chart" (Y-left, X-bottom)
 *   - CHART.width/height = fixed axis line length
 *   - CHART.inset = data padding inside chart area
 *
 * CONSTANTS (adjust as needed):
 *   TITLE    - fontSize, height, color
 *   CHART    - width, height, lineWidth, barWidth, zeroLine, inset{top, bottom, left, right}
 *   AXIS     - leftWidth, bottomHeight, fontSize, tickSize, tickCount
 *   LEGEND   - rowHeight, colorBoxSize, fontSize
 *   PADDING  - top, right (outer SVG margins)
 *   GAP      - spacing between layout elements
 *   CATEGORICAL - barWidth, stackedBarWidth, barGap, groupGap
 *
 * ============================================================================
 * PLANNED REFACTORING: CombinedChart Architecture
 * ============================================================================
 *
 * Goal: More flexible, composable API while simplifying internals.
 *
 * ARCHITECTURE OVERVIEW:
 *
 *   1. CombinedChart - Core layout component (new)
 *   2. createTimeSeriesChart() - Pure helper function for time series
 *   3. createCategoricalChart() - Pure helper function for categorical
 *   4. TimeSeriesChart / CategoricalChart - Convenience wrappers (keep existing API)
 *   5. Chart elements - Reusable SVG components (AxisY, AxisX, ChartLines, etc.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. CombinedChart Component
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   type CombinedChartProps = {
 *     title?: string;
 *     layoutRows?: ("title" | "legend" | "chart")[];
 *     legendCols?: number[];                         // column widths
 *     legendItems?: { label: string; color: string }[];
 *     children: (ctx: ChartContext) => {
 *       svg: ReactNode;
 *       width: number;
 *       height: number;
 *     };
 *   }
 *
 *   type ChartContext = {
 *     offsetX: number;  // where chart area starts (for absolute positioning)
 *     offsetY: number;
 *   }
 *
 *   What CombinedChart does:
 *   - Calculates legend dimensions from legendCols + legendItems
 *   - Calculates title height (if present)
 *   - Determines layout order from layoutRows
 *   - Calls children(ctx) to get chart content + dimensions
 *   - Renders <svg> with total dimensions
 *   - Positions title, legend, and chart content at correct offsets
 *   - All elements use ABSOLUTE positioning (no <g transform>)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 2. createTimeSeriesChart() - Pure Helper Function
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   function createTimeSeriesChart(params: {
 *     time: Date[];
 *     series: TimeSeriesItem[];
 *     width?: number;           // chart content width (default: CHART.width)
 *     height?: number;          // chart content height (default: CHART.height)
 *     stackedAreas?: boolean;
 *     showAxis?: boolean;       // adds axis dimensions to total width/height
 *   }): {
 *     // Scales
 *     xScale: d3.ScaleTime<number, number>;
 *     yScale: d3.ScaleLinear<number, number>;
 *
 *     // Dimensions (total, including axes if showAxis=true)
 *     width: number;
 *     height: number;
 *
 *     // Chart area info (for positioning elements)
 *     chartArea: {
 *       x: number;        // offset from left (axis width if shown)
 *       y: number;        // offset from top
 *       width: number;    // content area width
 *       height: number;   // content area height
 *       inset: { top, bottom, left, right };
 *       baseline: number; // Y position of zero line
 *     };
 *
 *     // Data
 *     hasNegative: boolean;
 *     areaSeries: TimeSeriesItem[];
 *     nonAreaSeries: TimeSeriesItem[];
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 3. createCategoricalChart() - Pure Helper Function
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   function createCategoricalChart(params: {
 *     labels: string[];
 *     series: CategoricalSeriesItem[];
 *     height?: number;
 *     stackedBars?: boolean;
 *     showAxis?: boolean;
 *   }): {
 *     yScale: d3.ScaleLinear<number, number>;
 *     width: number;            // auto-calculated from labels + bar count
 *     height: number;
 *     chartArea: { ... };
 *     hasNegative: boolean;
 *     barSeries: CategoricalSeriesItem[];
 *     lineSeries: CategoricalSeriesItem[];
 *     groupWidth: number;       // for positioning lines on bar groups
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 4. Chart Elements - Refactored for chartArea
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   Components receive chartArea + scales, render with absolute coords:
 *
 *   <AxisY yScale={yScale} chartArea={chartArea} />
 *   <AxisX xScale={xScale} chartArea={chartArea} format={formatDate} />
 *   <CategoricalAxisX labels={labels} chartArea={chartArea} groupWidth={groupWidth} />
 *   <ZeroLine yScale={yScale} chartArea={chartArea} />
 *   <ChartLines series={series} time={time} xScale={xScale} yScale={yScale} chartArea={chartArea} />
 *   <StackedAreas series={series} time={time} xScale={xScale} yScale={yScale} chartArea={chartArea} />
 *   <CategoricalBars series={series} yScale={yScale} chartArea={chartArea} />
 *   <StackedCategoricalBars series={series} yScale={yScale} chartArea={chartArea} />
 *   <CategoricalLines series={series} yScale={yScale} chartArea={chartArea} groupWidth={groupWidth} />
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 5. Usage Example
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   <CombinedChart
 *     title="Revenue Analysis"
 *     layoutRows={["title", "legend", "chart"]}
 *     legendCols={[80, 80]}
 *     legendItems={[
 *       { label: "Revenue", color: "#2ca02c" },
 *       { label: "Costs", color: "#d62728" },
 *     ]}
 *   >
 *     {({ offsetX, offsetY }) => {
 *       const chart = createTimeSeriesChart({
 *         time: dates,
 *         series: mySeries,
 *         stackedAreas: true,
 *         showAxis: true,
 *       });
 *
 *       // Adjust chartArea positions with parent offsets
 *       const chartArea = {
 *         ...chart.chartArea,
 *         x: chart.chartArea.x + offsetX,
 *         y: chart.chartArea.y + offsetY,
 *       };
 *
 *       return {
 *         width: chart.width,
 *         height: chart.height,
 *         svg: (
 *           <>
 *             <AxisY yScale={chart.yScale} chartArea={chartArea} />
 *             <AxisX xScale={chart.xScale} chartArea={chartArea} format={formatDate} />
 *             {chart.hasNegative && <ZeroLine yScale={chart.yScale} chartArea={chartArea} />}
 *             <StackedAreas
 *               series={chart.areaSeries}
 *               time={dates}
 *               xScale={chart.xScale}
 *               yScale={chart.yScale}
 *               chartArea={chartArea}
 *             />
 *             <ChartLines
 *               series={chart.nonAreaSeries}
 *               time={dates}
 *               xScale={chart.xScale}
 *               yScale={chart.yScale}
 *               chartArea={chartArea}
 *             />
 *           </>
 *         ),
 *       };
 *     }}
 *   </CombinedChart>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 6. Convenience Wrappers (Keep Existing API)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   TimeSeriesChart and CategoricalChart become thin wrappers around
 *   CombinedChart + createTimeSeriesChart/createCategoricalChart.
 *   This preserves backward compatibility while using the new internals.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 7. Exports
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   // Core
 *   export { CombinedChart }
 *   export { createTimeSeriesChart, createCategoricalChart }
 *
 *   // Convenience (existing API)
 *   export { TimeSeriesChart, CategoricalChart }
 *
 *   // Chart elements (for custom composition)
 *   export { AxisY, AxisX, CategoricalAxisX, ZeroLine }
 *   export { ChartLines, StackedAreas }
 *   export { CategoricalBars, StackedCategoricalBars, CategoricalLines }
 *
 *   // Types
 *   export type { TimeSeriesItem, CategoricalSeriesItem }
 *   export type { ChartArea, ChartContext }
 *
 * ============================================================================
 */

/*

   possible example (might contain mistakes):

     <CombinedChart
        layoutRows={["title", "legend", "chart"]}
        title="My combided chart"
        legendCols={[80, 80]}
        legendItems={[
          { label: "Profit", color: "red" },
          // etc
        ]}
      >
        {(something) => {
          const { xScale, yScale, layout, ...somethingElse } =
            someTimeSeriesHelper(someParams);

          return {
            svg: (
              <>
                <AxisY layout={layout} yScale={yScale} />
                <ChartLines
                  timeSeries={data}
                  time={time}
                  layout={layout}
                  xScale={xScale}
                  yScale={yScale}
                />
                 ... rest
              </>
            ),
            width: 600,
            height: 200,
          };
        }}
      </CombinedChart>

*/

import * as d3 from "d3";
import { useMemo } from "react";

export type TimeSeriesItem = {
  legend: string;
  color: string;
  variant?: "line" | "area" | "bars";
  data: number[];
};

export type TimeSeriesChartProps = {
  title?: string | null;
  timeSeries: TimeSeriesItem[];
  time: Date[];
  timeFormat: (date: Date) => string;
  legendWidth?: number[];
  showAxis?: boolean;
  stackedAreas?: boolean;
  layoutRows?: ("title" | "legend" | "chart")[];
};

export type CategoricalSeriesItem = {
  legend: string;
  color: string;
  variant?: "bar" | "line";
  values: number[];
};

export type CategoricalChartProps = {
  title?: string | null;
  labels: string[];
  series: CategoricalSeriesItem[];
  legendWidth?: number[];
  showAxis?: boolean;
  stackedBars?: boolean;
  layoutRows?: ("title" | "legend" | "chart")[];
};

const defaultLayoutRows = ["title", "chart", "legend"];

const TITLE = {
  fontSize: 16,
  fontFamily: "sans-serif",
  color: "#333",
  height: 24,
};

const CHART = {
  width: 500,
  height: 100,
  lineWidth: 2,
  barWidth: 4,
  areaOpacity: 0.3,
  zeroLine: {
    color: "#999",
    width: 1,
    dashArray: "4,3",
  },
  inset: {
    top: 5,
    bottom: 5,
    left: 5,
    right: 12,
  },
};

const AXIS = {
  leftWidth: 60,
  bottomHeight: 20,
  fontSize: 12,
  fontFamily: "sans-serif",
  color: "#666",
  tickSize: 5,
  tickCount: 5,
  tickLabelGap: 4,
  lineWidth: 1,
};

const PADDING = {
  top: 2,
  right: 16,
};

const LEGEND = {
  rowHeight: 20,
  colorBoxSize: 10,
  colorBoxMargin: 8,
  fontSize: 12,
  fontFamily: "sans-serif",
  color: "#333",
};

const GAP = 5;

const CATEGORICAL = {
  barWidth: 20,
  stackedBarWidth: 40,
  barGap: 2,
  groupGap: 16,
};

type Layout = {
  totalWidth: number;
  totalHeight: number;
  title: { x: number; y: number } | null;
  chart: { x: number; y: number; width: number; height: number } | null;
  axisY: { x: number; y: number } | null;
  axisX: { x: number; y: number } | null;
  legend: { x: number; y: number; rows: number } | null;
};

type YScale = d3.ScaleLinear<number, number>;
type XScale = d3.ScaleTime<number, number>;

type LayoutParams = {
  title?: string | null;
  showAxis?: boolean;
  layoutRows?: ("title" | "legend" | "chart")[];
  legendWidth?: number[];
  seriesCount: number;
  chartWidth: number;
};

type LegendItem = { label: string; color: string };

function getBaselineY(offsetY: number, yScale: YScale): number {
  const chartTop = offsetY + CHART.inset.top;
  const chartBottom = offsetY + CHART.height;
  return Math.max(chartTop, Math.min(chartBottom, offsetY + yScale(0)));
}

function getCategoricalGroupWidth(barCount: number, stacked?: boolean): number {
  if (stacked) return CATEGORICAL.stackedBarWidth;

  return (
    barCount * CATEGORICAL.barWidth +
    Math.max(0, barCount - 1) * CATEGORICAL.barGap
  );
}

function calculateLayout(params: LayoutParams): Layout {
  const hasAxis = params.showAxis ?? true;
  const chartX = hasAxis ? AXIS.leftWidth : 0;

  const columnCount = params.legendWidth ? params.legendWidth.length : 0;
  const legendRowCount = Math.ceil(params.seriesCount / columnCount);

  let currentY = PADDING.top;

  let titleLayout: Layout["title"] = null;
  let chartLayout: Layout["chart"] = null;
  let axisYLayout: Layout["axisY"] = null;
  let axisXLayout: Layout["axisX"] = null;
  let legendLayout: Layout["legend"] = null;
  const rows = params.layoutRows || defaultLayoutRows;

  for (let i = 0; i < rows.length; i++) {
    const item = rows[i];

    if (i > 0) {
      currentY += GAP;
    }

    if (item === "title") {
      if (params.title !== null) {
        titleLayout = { x: chartX, y: currentY };
        currentY += TITLE.height;
      }
    } else if (item === "chart") {
      chartLayout = {
        x: chartX,
        y: currentY,
        width: params.chartWidth,
        height: CHART.height,
      };
      if (hasAxis) {
        axisYLayout = { x: 0, y: currentY };
        axisXLayout = { x: chartX, y: currentY + CHART.height };
      }
      currentY += CHART.height;
      if (hasAxis) {
        currentY += AXIS.bottomHeight;
      }
    } else if (item === "legend") {
      legendLayout = { x: chartX, y: currentY, rows: legendRowCount };
      currentY += legendRowCount * LEGEND.rowHeight;
    }
  }

  const totalWidth = chartX + params.chartWidth + PADDING.right;
  const totalHeight = currentY;

  return {
    totalWidth,
    totalHeight,
    title: titleLayout,
    chart: chartLayout,
    axisY: axisYLayout,
    axisX: axisXLayout,
    legend: legendLayout,
  };
}

function ChartTitle({ title, layout }: { title: string; layout: Layout }) {
  if (!layout.title) return null;
  const { x, y } = layout.title;

  return (
    <text
      x={x}
      y={y + TITLE.fontSize}
      fontSize={TITLE.fontSize}
      fontFamily={TITLE.fontFamily}
      fill={TITLE.color}
    >
      {title}
    </text>
  );
}

function AxisY({ layout, yScale }: { layout: Layout; yScale: YScale }) {
  if (!layout.axisY) return null;

  const ticks = yScale.ticks(AXIS.tickCount);
  const tickFormat = yScale.tickFormat(AXIS.tickCount, "s");
  const { x, y } = layout.axisY;
  const chartRight = x + AXIS.leftWidth;

  return (
    <g className="y-axis">
      <line
        x1={chartRight}
        y1={y}
        x2={chartRight}
        y2={y + CHART.height}
        stroke={AXIS.color}
        strokeWidth={AXIS.lineWidth}
      />
      {ticks.map((tick) => {
        const tickY = y + yScale(tick);
        return (
          <g key={tick}>
            <line
              x1={chartRight - AXIS.tickSize}
              y1={tickY}
              x2={chartRight}
              y2={tickY}
              stroke={AXIS.color}
            />
            <text
              x={chartRight - AXIS.tickSize - AXIS.tickLabelGap}
              y={tickY}
              fontSize={AXIS.fontSize}
              fontFamily={AXIS.fontFamily}
              fill={AXIS.color}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {tickFormat(tick)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function ChartLegend({
  items,
  legendWidth,
  layout,
}: {
  items: LegendItem[];
  legendWidth?: number[];
  layout: Layout;
}) {
  if (!layout.legend || !legendWidth) return null;
  const { x: startX, y: startY } = layout.legend;
  const columnCount = legendWidth.length;

  return (
    <g className="legend">
      {items.map((item, index) => {
        const col = index % columnCount;
        const row = Math.floor(index / columnCount);

        const colX =
          startX + legendWidth.slice(0, col).reduce((a, b) => a + b, 0);
        const itemY = startY + row * LEGEND.rowHeight;
        const boxY = itemY + (LEGEND.rowHeight - LEGEND.colorBoxSize) / 2;

        return (
          <g key={index}>
            <rect
              x={colX}
              y={boxY}
              width={LEGEND.colorBoxSize}
              height={LEGEND.colorBoxSize}
              fill={item.color}
            />
            <text
              x={colX + LEGEND.colorBoxSize + LEGEND.colorBoxMargin}
              y={itemY + LEGEND.rowHeight / 2}
              fontSize={LEGEND.fontSize}
              fontFamily={LEGEND.fontFamily}
              fill={LEGEND.color}
              dominantBaseline="middle"
            >
              {item.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function ZeroLine({ layout, yScale }: { layout: Layout; yScale: YScale }) {
  if (!layout.chart) return null;
  const { x: offsetX, y: offsetY, width: chartWidth } = layout.chart;

  const zeroY = offsetY + yScale(0);

  return (
    <line
      x1={offsetX + CHART.inset.left}
      y1={zeroY}
      x2={offsetX + chartWidth - CHART.inset.right}
      y2={zeroY}
      stroke={CHART.zeroLine.color}
      strokeWidth={CHART.zeroLine.width}
      strokeDasharray={CHART.zeroLine.dashArray}
    />
  );
}

function AxisX({
  layout,
  xScale,
  timeFormat,
}: {
  layout: Layout;
  xScale: XScale;
  timeFormat: (date: Date) => string;
}) {
  if (!layout.axisX || !layout.chart) return null;

  const ticks = xScale.ticks(AXIS.tickCount);
  const { x, y } = layout.axisX;

  return (
    <g className="x-axis">
      <line
        x1={x}
        y1={y}
        x2={x + layout.chart.width}
        y2={y}
        stroke={AXIS.color}
        strokeWidth={AXIS.lineWidth}
      />
      {ticks.map((tick) => {
        const tickX = x + xScale(tick);
        return (
          <g key={tick.getTime()}>
            <line
              x1={tickX}
              y1={y}
              x2={tickX}
              y2={y + AXIS.tickSize}
              stroke={AXIS.color}
            />
            <text
              x={tickX}
              y={y + AXIS.tickSize + AXIS.fontSize}
              fontSize={AXIS.fontSize}
              fontFamily={AXIS.fontFamily}
              fill={AXIS.color}
              textAnchor="middle"
            >
              {timeFormat(tick)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function ChartLines({
  timeSeries,
  time,
  layout,
  xScale,
  yScale,
}: {
  timeSeries: TimeSeriesItem[];
  time: Date[];
  layout: Layout;
  xScale: XScale;
  yScale: YScale;
}) {
  if (!layout.chart) return null;
  const { x: offsetX, y: offsetY } = layout.chart;
  const baselineY = getBaselineY(offsetY, yScale);

  return (
    <g className="time-series">
      {timeSeries.map((series, idx) => {
        const variant = series.variant ?? "line";

        if (variant === "area") {
          const areaGenerator = d3
            .area<number>()
            .x((_, i) => offsetX + xScale(time[i]))
            .y0(baselineY)
            .y1((d) => offsetY + yScale(d));

          const pathD = areaGenerator(series.data);

          return (
            <path
              key={idx}
              d={pathD ?? undefined}
              fill={series.color}
              fillOpacity={CHART.areaOpacity}
            />
          );
        }

        if (variant === "bars") {
          return (
            <g key={idx}>
              {series.data.map((d, i) => {
                const x = offsetX + xScale(time[i]) - CHART.barWidth / 2;
                const yVal = offsetY + yScale(d);
                const y = Math.min(yVal, baselineY);
                const height = Math.abs(yVal - baselineY);

                return (
                  <rect
                    key={i}
                    x={x}
                    y={y}
                    width={CHART.barWidth}
                    height={height}
                    fill={series.color}
                  />
                );
              })}
            </g>
          );
        }

        const lineGenerator = d3
          .line<number>()
          .x((_, i) => offsetX + xScale(time[i]))
          .y((d) => offsetY + yScale(d));

        const pathD = lineGenerator(series.data);

        return (
          <path
            key={idx}
            d={pathD ?? undefined}
            fill="none"
            stroke={series.color}
            strokeWidth={CHART.lineWidth}
          />
        );
      })}
    </g>
  );
}

function StackedAreas({
  areaSeries,
  time,
  layout,
  xScale,
  yScale,
}: {
  areaSeries: TimeSeriesItem[];
  time: Date[];
  layout: Layout;
  xScale: XScale;
  yScale: YScale;
}) {
  if (!layout.chart || areaSeries.length === 0) return null;
  const { x: offsetX, y: offsetY } = layout.chart;

  // Transform data for d3.stack(): array of objects with series keys
  const keys = areaSeries.map((_, i) => `s${i}`);
  const stackData = time.map((_, timeIdx) => {
    const point: Record<string, number> = {};
    areaSeries.forEach((s, i) => {
      point[keys[i]] = s.data[timeIdx];
    });
    return point;
  });

  const stack = d3
    .stack<Record<string, number>>()
    .keys(keys)
    .offset(d3.stackOffsetDiverging);
  const stackedLayers = stack(stackData);

  return (
    <g className="stacked-areas">
      {stackedLayers.map((layer, seriesIdx) => {
        const areaGenerator = d3
          .area<d3.SeriesPoint<Record<string, number>>>()
          .x((_, i) => offsetX + xScale(time[i]))
          .y0((d) => offsetY + yScale(d[0]))
          .y1((d) => offsetY + yScale(d[1]));

        const pathD = areaGenerator(layer);

        return (
          <path
            key={seriesIdx}
            d={pathD ?? undefined}
            fill={areaSeries[seriesIdx].color}
            fillOpacity={CHART.areaOpacity}
          />
        );
      })}
    </g>
  );
}

function CategoricalAxisX({
  layout,
  labels,
  seriesCount,
  stacked,
}: {
  layout: Layout;
  labels: string[];
  seriesCount: number;
  stacked?: boolean;
}) {
  if (!layout.axisX || !layout.chart) return null;

  const { x, y } = layout.axisX;
  const groupWidth = getCategoricalGroupWidth(seriesCount, stacked);

  return (
    <g className="x-axis">
      <line
        x1={x}
        y1={y}
        x2={x + layout.chart.width}
        y2={y}
        stroke={AXIS.color}
        strokeWidth={AXIS.lineWidth}
      />
      {labels.map((label, i) => {
        const groupX =
          CHART.inset.left + i * (groupWidth + CATEGORICAL.groupGap);
        const tickX = x + groupX + groupWidth / 2;
        return (
          <g key={i}>
            <line
              x1={tickX}
              y1={y}
              x2={tickX}
              y2={y + AXIS.tickSize}
              stroke={AXIS.color}
            />
            <text
              x={tickX}
              y={y + AXIS.tickSize + AXIS.fontSize}
              fontSize={AXIS.fontSize}
              fontFamily={AXIS.fontFamily}
              fill={AXIS.color}
              textAnchor="middle"
            >
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function CategoricalBars({
  barSeries,
  layout,
  yScale,
}: {
  barSeries: CategoricalSeriesItem[];
  layout: Layout;
  yScale: YScale;
}) {
  if (!layout.chart) return null;
  const { x: offsetX, y: offsetY } = layout.chart;
  const baselineY = getBaselineY(offsetY, yScale);
  const groupWidth = getCategoricalGroupWidth(barSeries.length);

  return (
    <g className="categorical-bars">
      {barSeries.map((s, seriesIdx) => (
        <g key={seriesIdx}>
          {s.values.map((value, catIdx) => {
            const groupX =
              CHART.inset.left + catIdx * (groupWidth + CATEGORICAL.groupGap);
            const barX =
              offsetX +
              groupX +
              seriesIdx * (CATEGORICAL.barWidth + CATEGORICAL.barGap);
            const yVal = offsetY + yScale(value);
            const y = Math.min(yVal, baselineY);
            const height = Math.abs(yVal - baselineY);

            return (
              <rect
                key={catIdx}
                x={barX}
                y={y}
                width={CATEGORICAL.barWidth}
                height={height}
                fill={s.color}
              />
            );
          })}
        </g>
      ))}
    </g>
  );
}

function StackedCategoricalBars({
  barSeries,
  layout,
  yScale,
}: {
  barSeries: CategoricalSeriesItem[];
  layout: Layout;
  yScale: YScale;
}) {
  if (!layout.chart || barSeries.length === 0) return null;
  const { x: offsetX, y: offsetY } = layout.chart;
  const groupWidth = getCategoricalGroupWidth(barSeries.length, true);

  // Transform data for d3.stack(): array of objects with series keys
  const keys = barSeries.map((_, i) => `s${i}`);
  const categoryCount = barSeries[0]?.values.length ?? 0;
  const stackData = Array.from({ length: categoryCount }, (_, catIdx) => {
    const point: Record<string, number> = {};
    barSeries.forEach((s, i) => {
      point[keys[i]] = s.values[catIdx];
    });
    return point;
  });

  const stack = d3
    .stack<Record<string, number>>()
    .keys(keys)
    .offset(d3.stackOffsetDiverging);
  const stackedLayers = stack(stackData);

  return (
    <g className="categorical-bars-stacked">
      {stackedLayers.map((layer, seriesIdx) =>
        layer.map((d, catIdx) => {
          const groupX =
            CHART.inset.left + catIdx * (groupWidth + CATEGORICAL.groupGap);
          const barX = offsetX + groupX;
          const y0 = offsetY + yScale(d[0]);
          const y1 = offsetY + yScale(d[1]);

          return (
            <rect
              key={`${seriesIdx}-${catIdx}`}
              x={barX}
              y={Math.min(y0, y1)}
              width={CATEGORICAL.stackedBarWidth}
              height={Math.abs(y0 - y1)}
              fill={barSeries[seriesIdx].color}
            />
          );
        }),
      )}
    </g>
  );
}

function CategoricalLines({
  lineSeries,
  barSeriesCount,
  layout,
  yScale,
  stacked,
}: {
  lineSeries: CategoricalSeriesItem[];
  barSeriesCount: number;
  layout: Layout;
  yScale: YScale;
  stacked?: boolean;
}) {
  if (!layout.chart || lineSeries.length === 0) return null;
  const { x: offsetX, y: offsetY } = layout.chart;
  const groupWidth = getCategoricalGroupWidth(barSeriesCount, stacked);

  return (
    <g className="categorical-lines">
      {lineSeries.map((s, seriesIdx) => {
        const lineGenerator = d3
          .line<number>()
          .x((_, catIdx) => {
            const groupX =
              CHART.inset.left + catIdx * (groupWidth + CATEGORICAL.groupGap);
            return offsetX + groupX + groupWidth / 2;
          })
          .y((d) => offsetY + yScale(d));

        const pathD = lineGenerator(s.values);

        return (
          <path
            key={seriesIdx}
            d={pathD ?? undefined}
            fill="none"
            stroke={s.color}
            strokeWidth={CHART.lineWidth}
          />
        );
      })}
    </g>
  );
}

export function TimeSeriesChart(props: TimeSeriesChartProps) {
  const { timeSeries, time, title, timeFormat, legendWidth, stackedAreas } =
    props;
  const showAxis = props.showAxis ?? true;

  const { layout, xScale, yScale, hasNegative, areaSeries, nonAreaSeries } =
    useMemo(() => {
      if (timeSeries.length === 0 || time.length === 0) {
        return {
          layout: null,
          xScale: null,
          yScale: null,
          hasNegative: false,
          areaSeries: [],
          nonAreaSeries: [],
        };
      }

      const areaSeries = timeSeries.filter((s) => s.variant === "area");
      const nonAreaSeries = timeSeries.filter((s) => s.variant !== "area");

      const layout = calculateLayout({
        ...props,
        seriesCount: timeSeries.length,
        chartWidth: CHART.width,
      });

      let yMin: number, yMax: number;
      if (stackedAreas && areaSeries.length > 0) {
        // For diverging stacks: positives stack up, negatives stack down
        const positiveSums = time.map((_, timeIdx) =>
          areaSeries.reduce((sum, s) => sum + Math.max(0, s.data[timeIdx]), 0),
        );
        const negativeSums = time.map((_, timeIdx) =>
          areaSeries.reduce((sum, s) => sum + Math.min(0, s.data[timeIdx]), 0),
        );
        const nonAreaValues = nonAreaSeries.flatMap((s) => s.data);
        yMax = Math.max(
          0,
          d3.max(positiveSums) ?? 0,
          d3.max(nonAreaValues) ?? 0,
        );
        yMin = Math.min(
          0,
          d3.min(negativeSums) ?? 0,
          d3.min(nonAreaValues) ?? 0,
        );
      } else {
        yMin = d3.min(timeSeries.map((s) => d3.min(s.data) ?? 0)) ?? 0;
        yMax = d3.max(timeSeries.map((s) => d3.max(s.data) ?? 0)) ?? 0;
      }

      if (!yMin && !yMax) {
        return {
          layout: null,
          xScale: null,
          yScale: null,
          hasNegative: false,
          areaSeries: [],
          nonAreaSeries: [],
        };
      }

      const hasNegative = yMin < 0;
      const bottomInset = hasNegative ? CHART.inset.bottom : 0;

      const xScale = d3
        .scaleTime()
        .domain(d3.extent(time) as [Date, Date])
        .range([CHART.inset.left, CHART.width - CHART.inset.right]);

      const yScale: YScale = d3
        .scaleLinear()
        .domain([yMax, yMin])
        .nice()
        .range([CHART.inset.top, CHART.height - bottomInset]);

      return { layout, xScale, yScale, hasNegative, areaSeries, nonAreaSeries };
    }, [props, timeSeries, time, stackedAreas]);

  if (!layout || !xScale || !yScale) {
    return <svg />;
  }

  const legendItems = timeSeries.map((s) => ({
    label: s.legend,
    color: s.color,
  }));

  return (
    <svg
      width={layout.totalWidth}
      height={layout.totalHeight}
      style={{ backgroundColor: "#fff" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title && <ChartTitle title={title} layout={layout} />}
      {showAxis && (
        <>
          <AxisY layout={layout} yScale={yScale} />
          <AxisX layout={layout} xScale={xScale} timeFormat={timeFormat} />
        </>
      )}
      {hasNegative && <ZeroLine layout={layout} yScale={yScale} />}
      {stackedAreas && (
        <StackedAreas
          areaSeries={areaSeries}
          time={time}
          layout={layout}
          xScale={xScale}
          yScale={yScale}
        />
      )}
      <ChartLines
        timeSeries={stackedAreas ? nonAreaSeries : timeSeries}
        time={time}
        layout={layout}
        xScale={xScale}
        yScale={yScale}
      />
      <ChartLegend
        items={legendItems}
        legendWidth={legendWidth}
        layout={layout}
      />
    </svg>
  );
}

export function CategoricalChart(props: CategoricalChartProps) {
  const { labels, series, title, legendWidth, stackedBars } = props;
  const showAxis = props.showAxis ?? true;

  const { layout, yScale, hasNegative, barSeries, lineSeries } = useMemo(() => {
    if (series.length === 0 || labels.length === 0) {
      return {
        layout: null,
        yScale: null,
        hasNegative: false,
        barSeries: [],
        lineSeries: [],
      };
    }

    const barSeries = series.filter((s) => (s.variant ?? "bar") === "bar");
    const lineSeries = series.filter((s) => s.variant === "line");

    const groupWidth = getCategoricalGroupWidth(barSeries.length, stackedBars);

    const chartWidth =
      CHART.inset.left +
      labels.length * groupWidth +
      (labels.length - 1) * CATEGORICAL.groupGap +
      CHART.inset.right;

    const layout = calculateLayout({
      ...props,
      seriesCount: series.length,
      chartWidth,
    });

    // For stacked bars, calculate the sum of all bar values per category
    let yMin: number, yMax: number;
    if (stackedBars) {
      // For diverging stacks: positives stack up, negatives stack down
      const positiveSums = labels.map((_, catIdx) =>
        barSeries.reduce((sum, s) => sum + Math.max(0, s.values[catIdx]), 0),
      );
      const negativeSums = labels.map((_, catIdx) =>
        barSeries.reduce((sum, s) => sum + Math.min(0, s.values[catIdx]), 0),
      );
      const lineValues = lineSeries.flatMap((s) => s.values);
      yMax = Math.max(0, d3.max(positiveSums) ?? 0, d3.max(lineValues) ?? 0);
      yMin = Math.min(0, d3.min(negativeSums) ?? 0, d3.min(lineValues) ?? 0);
    } else {
      const allValues = series.flatMap((s) => s.values);
      yMin = d3.min(allValues) ?? 0;
      yMax = d3.max(allValues) ?? 0;
    }

    if (!yMin && !yMax) {
      return {
        layout: null,
        yScale: null,
        hasNegative: false,
        barSeries: [],
        lineSeries: [],
      };
    }

    const hasNegative = yMin < 0;
    const bottomInset = hasNegative ? CHART.inset.bottom : 0;

    const yScale: YScale = d3
      .scaleLinear()
      .domain([yMax, yMin])
      .nice()
      .range([CHART.inset.top, CHART.height - bottomInset]);

    return { layout, yScale, hasNegative, barSeries, lineSeries };
  }, [props, series, labels, stackedBars]);

  if (!layout || !yScale) {
    return <svg />;
  }

  const legendItems = series.map((s) => ({ label: s.legend, color: s.color }));

  return (
    <svg
      width={layout.totalWidth}
      height={layout.totalHeight}
      style={{ backgroundColor: "#fff" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title && <ChartTitle title={title} layout={layout} />}
      {showAxis && (
        <>
          <AxisY layout={layout} yScale={yScale} />
          <CategoricalAxisX
            layout={layout}
            labels={labels}
            seriesCount={barSeries.length}
            stacked={stackedBars}
          />
        </>
      )}
      {hasNegative && <ZeroLine layout={layout} yScale={yScale} />}
      {stackedBars ? (
        <StackedCategoricalBars
          barSeries={barSeries}
          layout={layout}
          yScale={yScale}
        />
      ) : (
        <CategoricalBars
          barSeries={barSeries}
          layout={layout}
          yScale={yScale}
        />
      )}
      <CategoricalLines
        lineSeries={lineSeries}
        barSeriesCount={barSeries.length}
        layout={layout}
        yScale={yScale}
        stacked={stackedBars}
      />
      <ChartLegend
        items={legendItems}
        legendWidth={legendWidth}
        layout={layout}
      />
    </svg>
  );
}
