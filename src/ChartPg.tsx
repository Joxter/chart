/*
 * TimeSeriesChart - React component for time series visualization
 *
 * Uses D3 for scales/line generation, renders as React SVG elements.
 *
 * PROPS:
 *   title?: string         - chart title (optional)
 *   timeSeries: []         - array of {label, color, data: number[]}
 *   time: Date[]           - x-axis dates (same length as data arrays)
 *   timeFormat: fn         - (date: Date) => string for x-axis labels
 *   legendWidth: number[]  - column widths for legend, e.g. [120, 120] = 2 columns
 *   showAxis: boolean      - show X/Y axes
 *   layoutRows: []         - vertical order of elements, e.g. ["title", "chart", "legend"]
 *                            GAP constant controls spacing between elements
 *
 * LAYOUT:
 *   - Elements positioned with absolute coords (no <g transform>)
 *   - Axes always attached to "chart" (Y-left, X-bottom)
 *   - CHART.width/height = fixed axis line length
 *   - CHART.inset = data padding inside chart area
 *
 * CONSTANTS (adjust as needed):
 *   TITLE    - fontSize, height, color
 *   CHART    - width, height, lineWidth, inset{top, right}
 *   AXIS     - leftWidth, bottomHeight, fontSize, tickSize, tickCount
 *   LEGEND   - rowHeight, colorBoxSize, fontSize
 *   PADDING  - top, right (outer SVG margins)
 *   GAP      - spacing between layout elements
 */

import * as d3 from "d3";
import { useMemo } from "react";

type TimeSeriesItem = {
  label: string;
  color: string;
  variant?: "line" | "area" | "bars"; // "line" by default
  data: number[];
};

type TimeSeriesChartProps = {
  title?: string | null;
  timeSeries: TimeSeriesItem[];
  time: Date[];
  timeFormat: (date: Date) => string;
  legendWidth: number[];
  showAxis: boolean;
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
  inset: {
    top: 5,
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

type Layout = {
  totalWidth: number;
  totalHeight: number;
  title: { x: number; y: number } | null;
  chart: { x: number; y: number; width: number; height: number } | null;
  axisY: { x: number; y: number } | null;
  axisX: { x: number; y: number } | null;
  legend: { x: number; y: number; rows: number } | null;
};

type Scales = {
  x: d3.ScaleTime<number, number>;
  y: d3.ScaleLinear<number, number>;
};

function calculateLayout(props: TimeSeriesChartProps): Layout {
  const hasAxis = props.showAxis;
  const chartX = hasAxis ? AXIS.leftWidth : 0;

  const columnCount = props.legendWidth.length;
  const legendRowCount = Math.ceil(props.timeSeries.length / columnCount);

  let currentY = PADDING.top;

  let titleLayout: Layout["title"] = null;
  let chartLayout: Layout["chart"] = null;
  let axisYLayout: Layout["axisY"] = null;
  let axisXLayout: Layout["axisX"] = null;
  let legendLayout: Layout["legend"] = null;
  const rows = props.layoutRows || defaultLayoutRows;

  for (let i = 0; i < rows.length; i++) {
    const item = rows[i];

    // Add gap before element (except first)
    if (i > 0) {
      currentY += GAP;
    }

    if (item === "title") {
      if (props.title !== null) {
        titleLayout = { x: chartX, y: currentY };
        currentY += TITLE.height;
      }
    } else if (item === "chart") {
      chartLayout = {
        x: chartX,
        y: currentY,
        width: CHART.width,
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

  const totalWidth = chartX + CHART.width + PADDING.right;
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

// --- React Components ---

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

function AxisY({ layout, scales }: { layout: Layout; scales: Scales }) {
  if (!layout.axisY) return null;

  const ticks = scales.y.ticks(AXIS.tickCount);
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
        const tickY = y + scales.y(tick);
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
              x={chartRight - AXIS.tickSize - 4}
              y={tickY}
              fontSize={AXIS.fontSize}
              fontFamily={AXIS.fontFamily}
              fill={AXIS.color}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {tick}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function AxisX({
  layout,
  scales,
  timeFormat,
}: {
  layout: Layout;
  scales: Scales;
  timeFormat: (date: Date) => string;
}) {
  if (!layout.axisX) return null;

  const ticks = scales.x.ticks(AXIS.tickCount);
  const { x, y } = layout.axisX;

  return (
    <g className="x-axis">
      <line
        x1={x}
        y1={y}
        x2={x + CHART.width}
        y2={y}
        stroke={AXIS.color}
        strokeWidth={AXIS.lineWidth}
      />
      {ticks.map((tick) => {
        const tickX = x + scales.x(tick);
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
  scales,
}: {
  timeSeries: TimeSeriesItem[];
  time: Date[];
  layout: Layout;
  scales: Scales;
}) {
  if (!layout.chart) return null;
  const { x: offsetX, y: offsetY } = layout.chart;

  // Baseline for area charts (y=0 position, clamped to chart bounds)
  const chartTop = offsetY + CHART.inset.top;
  const chartBottom = offsetY + CHART.height;
  const baselineY = Math.max(
    chartTop,
    Math.min(chartBottom, offsetY + scales.y(0)),
  );

  return (
    <g className="time-series">
      {timeSeries.map((series, idx) => {
        const variant = series.variant ?? "line";

        if (variant === "area") {
          const areaGenerator = d3
            .area<number>()
            .x((_, i) => offsetX + scales.x(time[i]))
            .y0(baselineY)
            .y1((d) => offsetY + scales.y(d));

          const pathD = areaGenerator(series.data);

          return (
            <path
              key={idx}
              d={pathD ?? undefined}
              fill={series.color}
              fillOpacity={0.3}
            />
          );
        }

        if (variant === "bars") {
          return (
            <g key={idx}>
              {series.data.map((d, i) => {
                const x = offsetX + scales.x(time[i]) - CHART.barWidth / 2;
                const yVal = offsetY + scales.y(d);
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
          .x((_, i) => offsetX + scales.x(time[i]))
          .y((d) => offsetY + scales.y(d));

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

function ChartLegend({
  timeSeries,
  legendWidth,
  layout,
}: {
  timeSeries: TimeSeriesItem[];
  legendWidth: number[];
  layout: Layout;
}) {
  if (!layout.legend) return null;
  const { x: startX, y: startY } = layout.legend;
  const columnCount = legendWidth.length;

  return (
    <g className="legend">
      {timeSeries.map((series, index) => {
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
              fill={series.color}
            />
            <text
              x={colX + LEGEND.colorBoxSize + LEGEND.colorBoxMargin}
              y={itemY + LEGEND.rowHeight / 2}
              fontSize={LEGEND.fontSize}
              fontFamily={LEGEND.fontFamily}
              fill={LEGEND.color}
              dominantBaseline="middle"
            >
              {series.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function TimeSeriesChart(props: TimeSeriesChartProps) {
  const { timeSeries, time, showAxis, title, timeFormat, legendWidth } = props;

  const { layout, scales } = useMemo(() => {
    if (timeSeries.length === 0 || time.length === 0) {
      return { layout: null, scales: null };
    }

    const layout = calculateLayout(props);

    const yMin = d3.min(timeSeries.map((s) => d3.min(s.data) ?? 0)) ?? 0;
    const yMax = d3.max(timeSeries.map((s) => d3.max(s.data) ?? 0)) ?? 0;

    if (!yMin && !yMax) {
      return { layout: null, scales: null };
    }

    const scales: Scales = {
      x: d3
        .scaleTime()
        .domain(d3.extent(time) as [Date, Date])
        .range([0, CHART.width - CHART.inset.right]),
      y: d3
        .scaleLinear()
        .domain([yMax, yMin])
        .range([CHART.inset.top, CHART.height]),
    };

    return { layout, scales };
  }, [props, timeSeries, time]);

  if (!layout || !scales) {
    return <svg />;
  }

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
          <AxisY layout={layout} scales={scales} />
          <AxisX layout={layout} scales={scales} timeFormat={timeFormat} />
        </>
      )}
      <ChartLines
        timeSeries={timeSeries}
        time={time}
        layout={layout}
        scales={scales}
      />
      <ChartLegend
        timeSeries={timeSeries}
        legendWidth={legendWidth}
        layout={layout}
      />
    </svg>
  );
}

// --- Test data ---

const testTime = [
  new Date("2024-01-01"),
  new Date("2024-01-02"),
  new Date("2024-01-03"),
  new Date("2024-01-04"),
  new Date("2024-01-05"),
  new Date("2024-01-06"),
  new Date("2024-01-07"),
];

const testTimeSeries: TimeSeriesItem[] = [
  { label: "Series A", color: "#e41a1c", data: [10, 25, 15, 30, 22, 28, 35] },
  { label: "Series B", color: "#377eb8", data: [5, 15, 20, 18, 25, 30, 28] },
  { label: "Series C", color: "#4daf4a", data: [20, 18, 22, 15, 20, 25, 30] },
];

const mixedTimeSeries: TimeSeriesItem[] = [
  { label: "Profit", color: "#2ca02c", data: [12, -5, 18, -12, 25, 8, -3] },
  { label: "Loss", color: "#d62728", data: [-8, 15, -20, 10, -5, -15, 22] },
];

const aroundZeroSeries: TimeSeriesItem[] = [
  { label: "Delta A", color: "#9467bd", data: [2, -1, 3, -2, 1, -3, 4] },
  { label: "Delta B", color: "#ff7f0e", data: [-3, 2, -1, 4, -2, 1, -1] },
];

const areaTimeSeries: TimeSeriesItem[] = [
  {
    label: "Revenue",
    color: "#1f77b4",
    variant: "area",
    data: [10, 15, 12, 18, 22, 19, 25],
  },
  {
    label: "Baseline",
    color: "#ff7f0e",
    variant: "line",
    data: [8, 8, 8, 8, 8, 8, 8],
  },
];

const mixedAreaSeries: TimeSeriesItem[] = [
  {
    label: "Net Flow",
    color: "#2ca02c",
    variant: "area",
    data: [5, -3, 8, -6, 12, -2, 7],
  },
];

const mixedBarsSeries: TimeSeriesItem[] = [
  {
    label: "Net Change",
    color: "#17becf",
    variant: "bars",
    data: [8, -12, 15, -5, 20, -8, 10],
  },
];

const formatDate = (d: Date) => d3.timeFormat("%b %d")(d);

export function ChartPg() {
  return (
    <div>
      <h2>Charts</h2>
      <TimeSeriesChart
        title="Sample Time Series Chart"
        timeSeries={testTimeSeries}
        time={testTime}
        timeFormat={formatDate}
        legendWidth={[120, 120]}
        showAxis={true}
      />

      <h3>Legend before chart</h3>
      <TimeSeriesChart
        title="Legend First"
        timeSeries={testTimeSeries}
        time={testTime}
        timeFormat={formatDate}
        legendWidth={[120, 120]}
        showAxis={true}
        layoutRows={["title", "legend", "chart"]}
      />

      <h3>Chart only (no legend)</h3>
      <TimeSeriesChart
        timeSeries={testTimeSeries}
        time={testTime}
        timeFormat={formatDate}
        legendWidth={[100, 100, 100]}
        showAxis={true}
        layoutRows={["chart"]}
      />

      <h3>Mixed values (positive & negative)</h3>
      <TimeSeriesChart
        title="Profit / Loss"
        timeSeries={mixedTimeSeries}
        time={testTime}
        timeFormat={formatDate}
        legendWidth={[100, 100]}
        showAxis={true}
      />

      <h3>Small values around zero</h3>
      <TimeSeriesChart
        title="Delta Values"
        timeSeries={aroundZeroSeries}
        time={testTime}
        timeFormat={formatDate}
        legendWidth={[100, 100]}
        showAxis={true}
      />

      <h3>Area chart with line</h3>
      <TimeSeriesChart
        title="Revenue vs Baseline"
        timeSeries={areaTimeSeries}
        time={testTime}
        timeFormat={formatDate}
        legendWidth={[100, 100]}
        showAxis={true}
      />

      <h3>Area and bars with mixed values</h3>
      <TimeSeriesChart
        title="Net Cash Flow"
        timeSeries={[...mixedAreaSeries, ...mixedBarsSeries]}
        time={testTime}
        timeFormat={formatDate}
        legendWidth={[100]}
        showAxis={true}
      />
    </div>
  );
}
