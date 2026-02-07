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
 *   domain?: [min?, max?]  - extend Y axis domain (merged with data extent)
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
 *   domain?: [min?, max?]  - extend Y axis domain (merged with data extent)
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
 *   TITLE    - fontSize, fontWeight, height, color
 *   CHART    - width, height, lineWidth, lineCap, lineJoin, barWidth, areaOpacity,
 *              zeroLine, exceeded, inset{...}
 *   AXIS     - leftWidth, rightWidth, bottomHeight, fontSize, tickCount, grid{...}
 *   LEGEND   - rowHeight, lineWidth, lineHeight, fontSize
 *   PADDING  - top, right (outer SVG margins)
 *   GAP      - spacing between layout elements
 *   CATEGORICAL - barWidth, stackedBarWidth, barGap, groupGap
 */

import * as d3 from "d3";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { domainForStackedBars, minMax, minMaxArr } from "./utils.ts";

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
  domain?: number[];
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
  domain?: number[];
};

export type HeatMapChartProps = {
  title?: string | null;
  /** data[col][row] — generic 2D grid */
  data: number[][];
  /** Two-color [min, max] or three-color diverging [negative, zero, positive]. */
  colorRange?: [string, string] | [string, string, string];
  /** Cell width in px (per column). Default 6. */
  cellWidth?: number;
  /** Cell height in px (per row). Default = cellWidth. */
  cellHeight?: number;
  /** Date per column — shows month-boundary labels on X axis */
  days?: Date[];
  /** Custom X-axis labels at specific column positions. Used instead of days. */
  xLabels?: { col: number; label: string }[];
  /** Custom Y-axis labels at specific row positions. Used instead of hour labels. */
  yLabels?: { row: number; label: string }[];
};

const defaultLayoutRows = ["title", "legend", "chart"];

const TITLE = {
  fontSize: 14,
  fontWeight: 600,
  fontFamily: "system-ui, -apple-system, sans-serif",
  color: "#333",
  height: 22,
};

const CHART = {
  width: 1200,
  height: 100,
  lineWidth: 2,
  lineCap: "round" as const,
  lineJoin: "round" as const,
  barWidth: 4,
  areaOpacity: 0.85,
  zeroLine: {
    color: "#bbb",
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
  bottomHeight: 22,
  fontSize: 11,
  fontFamily: "system-ui, -apple-system, sans-serif",
  color: "#888",
  tickSize: 4,
  tickCount: 3,
  tickLabelGap: 3,
  lineWidth: 1,
  grid: {
    color: "#e5e5e5",
    width: 1,
  },
};

const PADDING = {
  top: 2,
  right: 16,
};

const LEGEND = {
  rowHeight: 20,
  lineWidth: 16,
  lineHeight: 2,
  lineMargin: 6,
  fontSize: 11,
  fontVerticalAlignment: 1,
  fontFamily: "system-ui, -apple-system, sans-serif",
  color: "#444",
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
      fontWeight={TITLE.fontWeight}
      fill={TITLE.color}
    >
      {title}
    </text>
  );
}

function GridLines({ layout, yScale }: { layout: Layout; yScale: YScale }) {
  if (!layout.chart) return null;

  const ticks = yScale.ticks(AXIS.tickCount);
  const { x, y, width } = layout.chart;

  return (
    <g className="grid-lines">
      {ticks.map((tick) => {
        const tickY = y + yScale(tick);
        return (
          <line
            key={tick}
            x1={x}
            y1={tickY}
            x2={x + width}
            y2={tickY}
            stroke={AXIS.grid.color}
            strokeWidth={AXIS.grid.width}
          />
        );
      })}
    </g>
  );
}

function AxisY({
  layout,
  yScale,
  unit,
  side = "left",
}: {
  layout: Layout;
  yScale: YScale;
  unit?: string;
  side?: "left" | "right";
}) {
  const axisLayout = side === "left" ? layout.axisY : layout.axisYRight;
  if (!axisLayout) return null;

  const ticks = yScale.ticks(AXIS.tickCount);
  const tickFormat = yScale.tickFormat(AXIS.tickCount, "s");
  const { x, y } = axisLayout;

  const isLeft = side === "left";
  const axisWidth = isLeft ? AXIS.leftWidth : AXIS.rightWidth;
  const labelX = isLeft ? AXIS.fontSize : x + axisWidth - AXIS.fontSize;
  const tickLabelX = isLeft
    ? x + axisWidth - AXIS.tickLabelGap
    : x + AXIS.tickLabelGap;
  const textAnchor = isLeft ? "end" : "start";
  const rotation = isLeft ? -90 : 90;

  return (
    <g className={`y-axis-${side}`}>
      {unit && (
        <text
          x={labelX}
          y={y + CHART.height / 2}
          fontSize={AXIS.fontSize}
          fontFamily={AXIS.fontFamily}
          fill={AXIS.color}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(${rotation}, ${labelX}, ${y + CHART.height / 2})`}
        >
          {unit}
        </text>
      )}
      {ticks.map((tick) => {
        const tickY = y + yScale(tick);
        return (
          <text
            key={tick}
            x={tickLabelX}
            y={tickY}
            fontSize={AXIS.fontSize}
            fontFamily={AXIS.fontFamily}
            fill={AXIS.color}
            textAnchor={textAnchor}
            dominantBaseline="middle"
          >
            {tickFormat(tick)}
          </text>
        );
      })}
    </g>
  );
}

function ChartLegend({
  items,
  legendWidth,
  layout,
  hoveredValues,
}: {
  items: { label?: string; legend?: string; color: string }[];
  legendWidth?: number[];
  layout: Layout;
  hoveredValues?: (number | null)[];
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
        const lineY = itemY + LEGEND.rowHeight / 2;

        const label = item.label || item.legend || "";
        const hoverVal = hoveredValues?.[index];
        const displayText =
          hoverVal != null ? `${label}: ${d3.format(".2f")(hoverVal)}` : label;

        return (
          <g key={index}>
            <line
              x1={colX}
              y1={lineY}
              x2={colX + LEGEND.lineWidth}
              y2={lineY}
              stroke={item.color}
              strokeWidth={LEGEND.lineHeight}
              strokeLinecap="round"
            />
            <text
              x={colX + LEGEND.lineWidth + LEGEND.lineMargin}
              y={itemY + LEGEND.rowHeight / 2 + LEGEND.fontVerticalAlignment}
              fontSize={LEGEND.fontSize}
              fontFamily={LEGEND.fontFamily}
              fill={LEGEND.color}
              dominantBaseline="middle"
            >
              {displayText}
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
        opacity={0}
        x1={x}
        y1={y}
        x2={x + layout.chart.width}
        y2={y}
        stroke={AXIS.grid.color}
        strokeWidth={AXIS.grid.width}
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
              strokeWidth={AXIS.lineWidth}
            />
            <text
              x={tickX}
              y={y + AXIS.tickSize + AXIS.tickLabelGap + AXIS.fontSize}
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
        strokeLinecap={CHART.lineCap}
        strokeLinejoin={CHART.lineJoin}
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
        opacity={0}
        x1={x}
        y1={y}
        x2={x + layout.chart.width}
        y2={y}
        stroke={AXIS.grid.color}
        strokeWidth={AXIS.grid.width}
      />
      {labels.map((label, i) => {
        const groupX =
          CHART.inset.left + i * (groupWidth + CATEGORICAL.groupGap);
        const tickX = x + groupX + groupWidth / 2;
        return (
          <text
            key={i}
            x={tickX}
            y={y + AXIS.tickLabelGap + AXIS.fontSize}
            fontSize={AXIS.fontSize}
            fontFamily={AXIS.fontFamily}
            fill={AXIS.color}
            textAnchor="middle"
          >
            {label}
          </text>
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
            strokeLinecap={CHART.lineCap}
            strokeLinejoin={CHART.lineJoin}
          />
        );
      })}
    </g>
  );
}

function Crosshair({
  x,
  label,
  layout,
}: {
  x: number | null;
  label: string | null;
  layout: Layout;
}) {
  if (x == null || !layout.chart || !label || !layout.axisX) return null;

  const paddingX = 4;
  const paddingY = 2;

  const labelY =
    layout.axisX.y + AXIS.tickSize + AXIS.tickLabelGap + AXIS.fontSize;
  const estWidth = label.length * AXIS.fontSize * 0.6 + paddingX * 2;
  const estHeight = AXIS.fontSize + paddingY * 2;

  return (
    <g pointerEvents="none">
      <line
        x1={x}
        y1={layout.chart.y}
        x2={x}
        y2={layout.chart.y + layout.chart.height}
        stroke={AXIS.color}
        strokeWidth={1}
        strokeDasharray="3,2"
      />
      <rect
        x={x - estWidth / 2}
        y={labelY - AXIS.fontSize - paddingY}
        width={estWidth}
        height={estHeight}
        rx={2}
        fill="#fff"
        stroke={AXIS.grid.color}
        strokeWidth={1}
      />
      <text
        x={x}
        y={labelY}
        fontSize={AXIS.fontSize}
        fontFamily={AXIS.fontFamily}
        fill={TITLE.color}
        fontWeight={600}
        textAnchor="middle"
      >
        {label}
      </text>
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
    domain,
  } = props;
  const showAxis = props.showAxis ?? true;

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const exceededSeries =
    timeSeries.find((s) => s.variant === "exceeded") ?? null;
  const exceededMaskId = exceededSeries ? "exceeded-mask" : "";

  const secondarySeries = timeSeries.find((s) => s.secondUnit) ?? null;
  const primarySeries = timeSeries.filter((s) => !s.secondUnit);

  // exceeded is treated as a line for rendering, so include it in nonAreaSeries
  const areaSeries = primarySeries.filter((s) => s.variant === "area");
  const nonAreaSeries = primarySeries.filter((s) => s.variant !== "area");

  const layout = calculateLayout({
    ...props,
    seriesCount: timeSeries.length,
    chartWidth: CHART.width,
    hasRightAxis: !!secondarySeries,
  });

  let [yMin, yMax] =
    stackedAreas && areaSeries.length > 0
      ? minMaxArr([
          ...nonAreaSeries.map((it) => it.data),
          domainForStackedBars(areaSeries.map((it) => it.data)),
        ])
      : minMaxArr(primarySeries.map((it) => it.data));

  if (domain) {
    [yMin, yMax] = minMax([yMin, yMax, ...domain]);
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

  let yScaleRight: YScale | null = null;
  if (secondarySeries) {
    const [secMin, secMax] = minMax(secondarySeries.data);
    const secBottomInset = secMin < 0 ? CHART.inset.bottom : 0;

    yScaleRight = d3
      .scaleLinear()
      .domain([secMax, secMin])
      .nice()
      .range([CHART.inset.top, CHART.height - secBottomInset]);
  }

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || !layout.chart) return;

    const bisector = d3.bisector<Date, Date>((d) => d).left;

    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    const mouseX = svgP.x - layout.chart.x;

    const hoveredDate = xScale.invert(mouseX);
    let idx = bisector(time, hoveredDate);
    // snap to nearest
    if (idx > 0 && idx < time.length) {
      const d0 = time[idx - 1];
      const d1 = time[idx];
      if (!(+hoveredDate - +d0 > +d1 - +hoveredDate)) idx = idx - 1;
    }
    idx = Math.max(0, Math.min(time.length - 1, idx));
    setHoveredIndex(idx);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
  }, []);

  const hoveredValues =
    hoveredIndex != null
      ? timeSeries.map((s) => s.data[hoveredIndex] ?? null)
      : undefined;

  const hoveredX =
    hoveredIndex != null && layout.chart
      ? layout.chart.x + xScale(time[hoveredIndex])
      : null;

  return (
    <svg
      ref={svgRef}
      width={layout.totalWidth}
      height={layout.totalHeight}
      style={{ backgroundColor: "#fff" }}
      xmlns="http://www.w3.org/2000/svg"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
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
      {showAxis && <GridLines layout={layout} yScale={yScale} />}
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
            <AxisY
              layout={layout}
              yScale={yScaleRight}
              unit={secondarySeries.secondUnit}
              side="right"
            />
          )}
          <AxisX
            layout={layout}
            xScale={xScale}
            timeFormat={timeFormat}
            tickCount={12}
          />
        </>
      )}
      <Crosshair
        x={hoveredX}
        label={hoveredIndex != null ? timeFormat(time[hoveredIndex]) : null}
        layout={layout}
      />
      <ChartLegend
        items={timeSeries}
        legendWidth={legendWidth}
        layout={layout}
        hoveredValues={hoveredValues}
      />
    </svg>
  );
}

export function CategoricalChart(props: CategoricalChartProps) {
  const { labels, series, title, legendWidth, stackedBars, unit, domain } =
    props;
  const showAxis = props.showAxis ?? true;

  const { layout, yScale, barSeries, lineSeries } = useMemo(() => {
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

    let [yMin, yMax] = stackedBars
      ? minMaxArr([
          ...lineSeries.map((it) => it.values),
          domainForStackedBars(barSeries.map((it) => it.values)),
        ])
      : minMaxArr(series.map((it) => it.values));

    if (domain) {
      [yMin, yMax] = minMax([yMin, yMax, ...domain]);
    }

    const bottomInset = yMin < 0 ? CHART.inset.bottom : 0;

    const yScale: YScale = d3
      .scaleLinear()
      .domain([yMax, yMin])
      .nice()
      .range([CHART.inset.top, CHART.height - bottomInset]);

    return { layout, yScale, barSeries, lineSeries };
  }, [series, labels, stackedBars, domain]);

  return (
    <svg
      width={layout.totalWidth}
      height={layout.totalHeight}
      style={{ backgroundColor: "#fff" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title && <ChartTitle title={title} layout={layout} />}
      {showAxis && <GridLines layout={layout} yScale={yScale} />}
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
      <ChartLegend items={series} legendWidth={legendWidth} layout={layout} />
    </svg>
  );
}

const HEATMAP = {
  legendHeight: 10,
  legendWidth: 200,
};

export function HeatMapChart({
  title,
  data,
  colorRange = ["#4575b4", "#d73027"],
  cellWidth: cw = 6,
  cellHeight: ch,
  days,
  xLabels,
  yLabels,
}: HeatMapChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const cellW = cw;
  const cellH = ch ?? cw;
  const cols = data.length;
  const rows = data[0]?.length ?? 0;
  const hasCustomY = !!yLabels;
  // Derive time resolution (only used when Y = hours)
  const slotsPerHour = hasCustomY ? 1 : rows / 24;

  const chartLeft = AXIS.leftWidth;
  const chartTop = (title ? TITLE.height + GAP : 0) + PADDING.top;
  const chartW = cols * cellW;
  const chartH = rows * cellH;
  const width = chartLeft + chartW + PADDING.right;
  const height =
    chartTop + chartH + AXIS.bottomHeight + GAP + HEATMAP.legendHeight + 14;

  // Y-axis tick positions
  const yTicks = useMemo(() => {
    if (yLabels) return yLabels;
    const ticks: { row: number; label: string }[] = [];
    for (let h = 0; h < 24; h += 3) {
      ticks.push({ row: Math.round(h * slotsPerHour), label: `${h}:00` });
    }
    return ticks;
  }, [yLabels, slotsPerHour]);

  // Flatten all values for the domain
  const [vMin, vMax] = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const col of data) {
      for (const v of col) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return [min, max];
  }, [data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || rows === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const isDiverging = colorRange.length === 3;
    const colorScale = isDiverging
      ? d3
          .scaleDiverging(
            (t: number) =>
              d3.interpolateRgb(
                d3.interpolateRgb(colorRange[0], colorRange[1])(t * 2),
                d3.interpolateRgb(colorRange[1], colorRange[2])(t * 2 - 1),
              )(t < 0.5 ? 0 : 1),
          )
          .domain([vMin, 0, vMax])
      : d3
          .scaleSequential(d3.interpolateRgb(colorRange[0], colorRange[1]))
          .domain([vMin, vMax]);

    // Grid lines (horizontal, at Y tick positions)
    ctx.strokeStyle = AXIS.grid.color;
    ctx.lineWidth = AXIS.grid.width;
    for (const { row } of yTicks) {
      const y = chartTop + row * cellH;
      ctx.beginPath();
      ctx.moveTo(chartLeft, y);
      ctx.lineTo(chartLeft + chartW, y);
      ctx.stroke();
    }

    // Draw cells — batch by color runs within each column for performance
    for (let col = 0; col < cols; col++) {
      const colData = data[col];
      if (!colData) continue;
      const x = chartLeft + col * cellW;
      let runStart = 0;
      let runColor: string | null = null;

      for (let r = 0; r <= rows; r++) {
        const value = r < rows ? colData[r] : NaN;
        const color = value != null && !isNaN(value) ? colorScale(value) : null;

        if (color !== runColor) {
          if (runColor !== null) {
            ctx.fillStyle = runColor;
            ctx.fillRect(
              x,
              chartTop + runStart * cellH,
              cellW,
              (r - runStart) * cellH,
            );
          }
          runStart = r;
          runColor = color;
        }
      }
    }

    // Y-axis labels with tick marks
    ctx.fillStyle = AXIS.color;
    ctx.font = `${AXIS.fontSize}px ${AXIS.fontFamily}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = AXIS.color;
    ctx.lineWidth = AXIS.lineWidth;
    for (const { row, label } of yTicks) {
      const y = chartTop + row * cellH;
      // Tick mark
      ctx.beginPath();
      ctx.moveTo(chartLeft - AXIS.tickSize, y);
      ctx.lineTo(chartLeft, y);
      ctx.stroke();
      // Label offset: for hour-mode center in the 3h band, for custom just beside the tick
      const labelOffset = hasCustomY
        ? AXIS.fontSize / 2 + 1
        : Math.min((3 * slotsPerHour * cellH) / 2, 6);
      ctx.fillText(
        label,
        chartLeft - AXIS.tickSize - AXIS.tickLabelGap,
        y + labelOffset,
      );
    }

    // X-axis
    ctx.textBaseline = "top";
    ctx.strokeStyle = AXIS.color;
    ctx.lineWidth = AXIS.lineWidth;
    if (xLabels) {
      // Positioned labels at specific columns
      for (const { col, label } of xLabels) {
        const x = chartLeft + col * cellW;
        const axisY = chartTop + chartH;
        ctx.beginPath();
        ctx.moveTo(x, axisY);
        ctx.lineTo(x, axisY + AXIS.tickSize);
        ctx.stroke();
        ctx.textAlign = "left";
        ctx.fillStyle = AXIS.color;
        ctx.fillText(label, x + 2, axisY + AXIS.tickSize + AXIS.tickLabelGap);
      }
    } else if (days) {
      // Date-based: tick + label at month boundaries
      const formatMonth = d3.timeFormat("%b");
      for (let d = 0; d < cols; d++) {
        const date = days[d];
        if (!date) continue;
        const isFirst = date.getDate() === 1;
        const isFirstCol = d === 0;
        if (!isFirst && !isFirstCol) continue;

        const x = chartLeft + d * cellW;
        const axisY = chartTop + chartH;
        ctx.beginPath();
        ctx.moveTo(x, axisY);
        ctx.lineTo(x, axisY + AXIS.tickSize);
        ctx.stroke();
        ctx.textAlign = "left";
        ctx.fillStyle = AXIS.color;
        ctx.fillText(
          formatMonth(date),
          x + 2,
          axisY + AXIS.tickSize + AXIS.tickLabelGap,
        );
      }
    }

    // Title
    if (title) {
      ctx.fillStyle = TITLE.color;
      ctx.font = `${TITLE.fontWeight} ${TITLE.fontSize}px ${TITLE.fontFamily}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(title, chartLeft, PADDING.top);
    }

    // Color legend bar
    const lx = chartLeft;
    const ly = chartTop + chartH + AXIS.bottomHeight + GAP;
    const lw = Math.min(HEATMAP.legendWidth, chartW);
    const lh = HEATMAP.legendHeight;
    const grad = ctx.createLinearGradient(lx, 0, lx + lw, 0);
    if (isDiverging) {
      const zeroStop = vMin === vMax ? 0.5 : -vMin / (vMax - vMin);
      grad.addColorStop(0, colorRange[0]);
      grad.addColorStop(Math.max(0, Math.min(1, zeroStop)), colorRange[1]);
      grad.addColorStop(1, colorRange[2]);
    } else {
      grad.addColorStop(0, colorRange[0]);
      grad.addColorStop(1, colorRange[1]);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(lx, ly, lw, lh);

    // Legend labels
    ctx.fillStyle = AXIS.color;
    ctx.font = `${AXIS.fontSize}px ${AXIS.fontFamily}`;
    ctx.textBaseline = "top";
    const legendLabelY = ly + lh + 2;
    ctx.textAlign = "left";
    ctx.fillText(d3.format(".1f")(vMin), lx, legendLabelY);
    ctx.textAlign = "right";
    ctx.fillText(d3.format(".1f")(vMax), lx + lw, legendLabelY);
    if (isDiverging) {
      const zeroStop = vMin === vMax ? 0.5 : -vMin / (vMax - vMin);
      const zeroX = lx + lw * Math.max(0, Math.min(1, zeroStop));
      ctx.textAlign = "center";
      ctx.fillText("0", zeroX, legendLabelY);
    }
  }, [
    data,
    days,
    xLabels,
    cols,
    rows,
    width,
    height,
    cellW,
    cellH,
    hasCustomY,
    slotsPerHour,
    colorRange,
    vMin,
    vMax,
    title,
    chartTop,
    chartLeft,
    chartW,
    chartH,
    yTicks,
  ]);

  return <canvas ref={canvasRef} />;
}
