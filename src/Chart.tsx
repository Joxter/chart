/*
 * TimeSeriesChart & CategoricalChart - React components for data visualization
 *
 * Uses D3 for scales/line generation, renders as React SVG elements.
 *
 * TimeSeriesChart PROPS:
 *   title?: string          - chart title
 *   timeSeries: []          - array of {label, color, variant?, secondUnit?, data: number[]}
 *                             variant: "line" (default) | "area" | "bars" | "exceeded"
 *                             "exceeded" = threshold line; portions of other series
 *                             above this line are painted red (uses SVG mask)
 *                             secondUnit?: string - if set, this series uses a separate
 *                             right Y axis with its own scale (max 1 series with this prop)
 *   time: Date[]            - x-axis dates (same length as data arrays)
 *   timeFormat: fn          - (date: Date) => string for x-axis labels
 *   legendWidth?: number[]  - column widths for legend, e.g. [120, 120] = 2 columns
 *                             omit to hide legend
 *   showAxis?: boolean      - show X/Y axes (default: true)
 *   stackedAreas?: boolean  - stack area variants (lines/bars not stacked)
 *   layoutRows?: []         - vertical order: "title" | "chart" | "legend"
 *                             (default: ["title", "chart", "legend"])
 *   unit?: string          - unit label displayed above Y axis (e.g. "kWh", "%")
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
 *   unit?: string          - unit label displayed above Y axis (e.g. "kWh", "%")
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
 *   CHART    - width, height, lineWidth, barWidth, zeroLine, exceeded, inset{...}
 *   AXIS     - leftWidth, bottomHeight, fontSize, tickSize, tickCount
 *   LEGEND   - rowHeight, colorBoxSize, fontSize
 *   PADDING  - top, right (outer SVG margins)
 *   GAP      - spacing between layout elements
 *   CATEGORICAL - barWidth, stackedBarWidth, barGap, groupGap
 */

import * as d3 from "d3";
import { useMemo } from "react";

export type TimeSeriesItem = {
  legend: string;
  color: string;
  variant?: "line" | "area" | "bars" | "exceeded";
  secondUnit?: string;
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
  unit?: string;
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
  unit?: string;
};

const defaultLayoutRows = ["title", "legend", "chart"];

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
  areaOpacity: 1,
  zeroLine: {
    color: "#999",
    width: 1,
    dashArray: "4,3",
  },
  exceeded: {
    color: "#e53935",
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
  rightWidth: 60,
  bottomHeight: 20,
  fontSize: 12,
  fontFamily: "sans-serif",
  color: "#666",
  tickSize: 5,
  tickCount: 3,
  tickLabelGap: 4,
  lineWidth: 1,
};

const PADDING = {
  top: 2,
  right: 16,
};

const LEGEND = {
  rowHeight: 20,
  colorBoxW: 15,
  colorBoxH: 3,
  colorBoxMargin: 3,
  fontSize: 12,
  fontVerticalAlignment: 1,
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
  axisYRight: { x: number; y: number } | null;
  axisX: { x: number; y: number } | null;
  legend: { x: number; y: number; rows: number } | null;
};

type YScale = d3.ScaleLinear<number, number>;
type XScale = d3.ScaleTime<number, number>;

type LayoutParams = {
  title?: string | null;
  showAxis?: boolean;
  hasRightAxis?: boolean;
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
  const hasRightAxis = params.hasRightAxis ?? false;
  const chartX = hasAxis ? AXIS.leftWidth : 0;

  const columnCount = params.legendWidth ? params.legendWidth.length : 0;
  const legendRowCount = Math.ceil(params.seriesCount / columnCount);

  let currentY = PADDING.top;

  let titleLayout: Layout["title"] = null;
  let chartLayout: Layout["chart"] = null;
  let axisYLayout: Layout["axisY"] = null;
  let axisYRightLayout: Layout["axisYRight"] = null;
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
        if (hasRightAxis) {
          axisYRightLayout = { x: chartX + params.chartWidth, y: currentY };
        }
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

  const rightAxisWidth = hasAxis && hasRightAxis ? AXIS.rightWidth : 0;
  const totalWidth =
    chartX + params.chartWidth + rightAxisWidth + PADDING.right;
  const totalHeight = currentY;

  return {
    totalWidth,
    totalHeight,
    title: titleLayout,
    chart: chartLayout,
    axisY: axisYLayout,
    axisYRight: axisYRightLayout,
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

function AxisY({
  layout,
  yScale,
  unit,
}: {
  layout: Layout;
  yScale: YScale;
  unit?: string;
}) {
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
      {unit && (
        <text
          x={AXIS.fontSize}
          y={y + CHART.height / 2}
          fontSize={AXIS.fontSize}
          fontFamily={AXIS.fontFamily}
          fill={AXIS.color}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(-90, ${AXIS.fontSize}, ${y + CHART.height / 2})`}
        >
          {unit}
        </text>
      )}
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

function AxisYRight({
  layout,
  yScale,
  unit,
}: {
  layout: Layout;
  yScale: YScale;
  unit?: string;
}) {
  if (!layout.axisYRight) return null;

  const ticks = yScale.ticks(AXIS.tickCount);
  const tickFormat = yScale.tickFormat(AXIS.tickCount, "s");
  const { x, y } = layout.axisYRight;

  return (
    <g className="y-axis-right">
      <line
        x1={x}
        y1={y}
        x2={x}
        y2={y + CHART.height}
        stroke={AXIS.color}
        strokeWidth={AXIS.lineWidth}
      />
      <text
        x={x + AXIS.rightWidth - AXIS.fontSize}
        y={y + CHART.height / 2}
        fontSize={AXIS.fontSize}
        fontFamily={AXIS.fontFamily}
        fill={AXIS.color}
        textAnchor="middle"
        dominantBaseline="middle"
        transform={`rotate(90, ${x + AXIS.rightWidth - AXIS.fontSize}, ${y + CHART.height / 2})`}
      >
        {unit}
      </text>
      {ticks.map((tick) => {
        const tickY = y + yScale(tick);
        return (
          <g key={tick}>
            <line
              x1={x}
              y1={tickY}
              x2={x + AXIS.tickSize}
              y2={tickY}
              stroke={AXIS.color}
            />
            <text
              x={x + AXIS.tickSize + AXIS.tickLabelGap}
              y={tickY}
              fontSize={AXIS.fontSize}
              fontFamily={AXIS.fontFamily}
              fill={AXIS.color}
              textAnchor="start"
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
        const boxY = itemY + (LEGEND.rowHeight - LEGEND.colorBoxH) / 2;

        return (
          <g key={index}>
            <rect
              x={colX}
              y={boxY}
              width={LEGEND.colorBoxW}
              height={LEGEND.colorBoxH}
              fill={item.color}
            />
            <text
              x={colX + LEGEND.colorBoxW + LEGEND.colorBoxMargin}
              y={itemY + LEGEND.rowHeight / 2 + LEGEND.fontVerticalAlignment}
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

function ExceededMask({
  maskId,
  exceededSeries,
  time,
  layout,
  xScale,
  yScale,
}: {
  maskId: string;
  exceededSeries: TimeSeriesItem;
  time: Date[];
  layout: Layout;
  xScale: XScale;
  yScale: YScale;
}) {
  if (!layout.chart) return null;
  const { x: offsetX, y: offsetY, width: chartWidth } = layout.chart;

  // Create a path that covers the area BELOW the threshold line
  // Mask: white = visible, black = hidden
  // We hide below threshold so only exceeded (above) portions show through
  const areaBelowThreshold = d3
    .area<number>()
    .x((_, i) => offsetX + xScale(time[i]))
    .y0((d) => offsetY + yScale(d)) // Threshold line
    .y1(offsetY + CHART.height); // Bottom of chart

  const pathD = areaBelowThreshold(exceededSeries.data);

  return (
    <mask id={maskId}>
      <rect
        x={offsetX}
        y={offsetY}
        width={chartWidth}
        height={CHART.height}
        fill="white"
      />
      <path d={pathD ?? undefined} fill="black" />
    </mask>
  );
}

function AxisX({
  layout,
  xScale,
  timeFormat,
  tickCount,
}: {
  tickCount: number;
  layout: Layout;
  xScale: XScale;
  timeFormat: (date: Date) => string;
}) {
  if (!layout.axisX || !layout.chart) return null;

  const ticks = xScale.ticks(tickCount);
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
  exceededMaskId,
}: {
  timeSeries: TimeSeriesItem[];
  time: Date[];
  layout: Layout;
  xScale: XScale;
  yScale: YScale;
  exceededMaskId?: string;
}) {
  if (!layout.chart) return null;
  const { x: offsetX, y: offsetY } = layout.chart;
  const baselineY = getBaselineY(offsetY, yScale);

  const renderArea = (series: TimeSeriesItem, idx: number, maskId?: string) => {
    const areaGenerator = d3
      .area<number>()
      .x((_, i) => offsetX + xScale(time[i]))
      .y0(baselineY)
      .y1((d) => offsetY + yScale(d));

    const pathD = areaGenerator(series.data);

    return (
      <path
        key={maskId ? `${idx}-exceeded` : idx}
        d={pathD ?? undefined}
        fill={maskId ? CHART.exceeded.color : series.color}
        fillOpacity={CHART.areaOpacity}
        mask={maskId ? `url(#${maskId})` : undefined}
      />
    );
  };

  const renderBars = (series: TimeSeriesItem, idx: number, maskId?: string) => (
    <g
      key={maskId ? `${idx}-exceeded` : idx}
      mask={maskId ? `url(#${maskId})` : undefined}
    >
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
            fill={maskId ? CHART.exceeded.color : series.color}
          />
        );
      })}
    </g>
  );

  const renderLine = (series: TimeSeriesItem, idx: number, maskId?: string) => {
    const lineGenerator = d3
      .line<number>()
      .x((_, i) => offsetX + xScale(time[i]))
      .y((d) => offsetY + yScale(d));

    const pathD = lineGenerator(series.data);

    return (
      <path
        key={maskId ? `${idx}-exceeded` : idx}
        d={pathD ?? undefined}
        fill="none"
        stroke={maskId ? CHART.exceeded.color : series.color}
        strokeWidth={CHART.lineWidth}
        mask={maskId ? `url(#${maskId})` : undefined}
      />
    );
  };

  const areas: React.ReactNode[] = [];
  const bars: React.ReactNode[] = [];
  const lines: React.ReactNode[] = [];

  timeSeries.forEach((series, idx) => {
    const variant = series.variant ?? "line";

    if (variant === "area") {
      areas.push(renderArea(series, idx));
      if (exceededMaskId) {
        areas.push(renderArea(series, idx, exceededMaskId));
      }
    } else if (variant === "bars") {
      bars.push(renderBars(series, idx));
      if (exceededMaskId) {
        bars.push(renderBars(series, idx, exceededMaskId));
      }
    } else {
      // "line" or "exceeded" - both render as lines
      lines.push(renderLine(series, idx));
      // Don't apply red overlay to exceeded line itself
      if (exceededMaskId && variant !== "exceeded") {
        lines.push(renderLine(series, idx, exceededMaskId));
      }
    }
  });

  return (
    <g className="time-series">
      {areas}
      {bars}
      {lines}
    </g>
  );
}

function StackedAreas({
  areaSeries,
  time,
  layout,
  xScale,
  yScale,
  exceededMaskId,
}: {
  areaSeries: TimeSeriesItem[];
  time: Date[];
  layout: Layout;
  xScale: XScale;
  yScale: YScale;
  exceededMaskId?: string;
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

  const renderLayers = (maskId?: string) =>
    stackedLayers.map((layer, seriesIdx) => {
      const areaGenerator = d3
        .area<d3.SeriesPoint<Record<string, number>>>()
        .x((_, i) => offsetX + xScale(time[i]))
        .y0((d) => offsetY + yScale(d[0]))
        .y1((d) => offsetY + yScale(d[1]));

      const pathD = areaGenerator(layer);

      return (
        <path
          key={maskId ? `${seriesIdx}-exceeded` : seriesIdx}
          d={pathD ?? undefined}
          fill={maskId ? CHART.exceeded.color : areaSeries[seriesIdx].color}
          fillOpacity={CHART.areaOpacity}
          mask={maskId ? `url(#${maskId})` : undefined}
        />
      );
    });

  return (
    <g className="stacked-areas">
      {renderLayers()}
      {exceededMaskId && renderLayers(exceededMaskId)}
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
  const {
    timeSeries,
    time,
    title,
    timeFormat,
    legendWidth,
    stackedAreas,
    unit,
  } = props;
  const showAxis = props.showAxis ?? true;

  const exceededSeries =
    timeSeries.find((s) => s.variant === "exceeded") ?? null;

  const exceededMaskId = exceededSeries ? "exceeded-mask" : "";

  const secondarySeries = timeSeries.find((s) => s.secondUnit) ?? null;
  const primarySeries = timeSeries.filter((s) => !s.secondUnit);

  const {
    layout,
    xScale,
    yScale,
    yScaleRight,
    hasNegative,
    areaSeries,
    nonAreaSeries,
  } = useMemo(() => {
    // exceeded is treated as a line for rendering, so include it in nonAreaSeries
    const areaSeries = primarySeries.filter((s) => s.variant === "area");
    const nonAreaSeries = primarySeries.filter((s) => s.variant !== "area");

    const layout = calculateLayout({
      ...props,
      seriesCount: timeSeries.length,
      chartWidth: CHART.width,
      hasRightAxis: !!secondarySeries,
    });

    // Calculate yScale for primary series (left axis)
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
      yMax = Math.max(0, d3.max(positiveSums) ?? 0, d3.max(nonAreaValues) ?? 0);
      yMin = Math.min(0, d3.min(negativeSums) ?? 0, d3.min(nonAreaValues) ?? 0);
    } else {
      yMin = d3.min(primarySeries.map((s) => d3.min(s.data) ?? 0)) ?? 0;
      yMax = d3.max(primarySeries.map((s) => d3.max(s.data) ?? 0)) ?? 0;
    }

    if (!yMin && !yMax && !secondarySeries) {
      return {
        layout: null,
        xScale: null,
        yScale: null,
        yScaleRight: null,
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

    // Calculate yScaleRight for secondary series (right axis)
    let yScaleRight: YScale | null = null;
    if (secondarySeries) {
      const secMin = d3.min(secondarySeries.data) ?? 0;
      const secMax = d3.max(secondarySeries.data) ?? 0;
      const secHasNegative = secMin < 0;
      const secBottomInset = secHasNegative ? CHART.inset.bottom : 0;

      yScaleRight = d3
        .scaleLinear()
        .domain([secMax, secMin])
        .nice()
        .range([CHART.inset.top, CHART.height - secBottomInset]);
    }

    return {
      layout,
      xScale,
      yScale,
      yScaleRight,
      hasNegative,
      areaSeries,
      nonAreaSeries,
    };
  }, [props, timeSeries, primarySeries, secondarySeries, time, stackedAreas]);

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
      {exceededMaskId && exceededSeries && (
        <defs>
          <ExceededMask
            maskId={exceededMaskId}
            exceededSeries={exceededSeries}
            time={time}
            layout={layout}
            xScale={xScale}
            yScale={yScale}
          />
        </defs>
      )}
      {title && <ChartTitle title={title} layout={layout} />}
      {hasNegative && <ZeroLine layout={layout} yScale={yScale} />}
      {stackedAreas && (
        <StackedAreas
          areaSeries={areaSeries}
          time={time}
          layout={layout}
          xScale={xScale}
          yScale={yScale}
          exceededMaskId={exceededMaskId}
        />
      )}
      <ChartLines
        timeSeries={stackedAreas ? nonAreaSeries : primarySeries}
        time={time}
        layout={layout}
        xScale={xScale}
        yScale={yScale}
        exceededMaskId={exceededMaskId}
      />
      {secondarySeries && yScaleRight && (
        <ChartLines
          timeSeries={[secondarySeries]}
          time={time}
          layout={layout}
          xScale={xScale}
          yScale={yScaleRight}
        />
      )}
      {showAxis && (
        <>
          <AxisY layout={layout} yScale={yScale} unit={unit} />
          {secondarySeries && yScaleRight && (
            <AxisYRight
              layout={layout}
              yScale={yScaleRight}
              unit={secondarySeries.secondUnit}
            />
          )}
          <AxisX
            layout={layout}
            xScale={xScale}
            timeFormat={timeFormat}
            tickCount={7}
          />
        </>
      )}
      <ChartLegend
        items={legendItems}
        legendWidth={legendWidth}
        layout={layout}
      />
    </svg>
  );
}

export function CategoricalChart(props: CategoricalChartProps) {
  const { labels, series, title, legendWidth, stackedBars, unit } = props;
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
      {showAxis && (
        <>
          <AxisY layout={layout} yScale={yScale} unit={unit} />
          <CategoricalAxisX
            layout={layout}
            labels={labels}
            seriesCount={barSeries.length}
            stacked={stackedBars}
          />
        </>
      )}
      <ChartLegend
        items={legendItems}
        legendWidth={legendWidth}
        layout={layout}
      />
    </svg>
  );
}
