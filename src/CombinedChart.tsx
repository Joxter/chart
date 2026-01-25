import { Children, cloneElement, type ReactNode } from "react";
import * as d3 from "d3";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

const LEGEND = {
  fontSize: 12,
  rowHeight: 13,
  colorBoxWidth: 20,
  colorBoxHeight: 13,
  rowGap: 8,
  colorBoxMargin: 8,
  fontFamily: "sans-serif",
  fontVerticalAlignment: -1,
  color: "#333",
};

const TITLE = {
  fontSize: 16,
  fontFamily: "sans-serif",
  color: "#333",
  height: 13, // = baseline of the font
};

const GAP = 10;

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
    top: 10,
    bottom: 5,
    left: 1,
    right: 1,
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

type YScale = d3.ScaleLinear<number, number>;
type XScale = d3.ScaleTime<number, number>;

export type TimeSeriesItem = {
  legend: string;
  color: string;
  data: number[];
  variant?: "line" | "area" | "bars";
};

type ChartContext = {
  //
};

type CombinedChartProps = {
  title?: string;
  layoutRows?: ("title" | "legend" | "chart")[];
  legendCols?: number[]; // column widths
  items: TimeSeriesItem[];
  // crazy: TimeSeriesItem[];
  time: Date[];
  children: ReactNode;
  // children?: (ctx: ChartContext) => {
  //   svg: ReactNode;
  //   width: number;
  //   height: number;
  // };
};

type XY = { x: number; y: number };

type Layout = {
  totalWidth: number;
  totalHeight: number;
  title: { x: number; y: number } | null;
  chart: { x: number; y: number; width: number; height: number } | null;
  axisY: { x: number; y: number } | null;
  axisX: { x: number; y: number } | null;
  legend: { x: number; y: number; rows: number } | null;
};

function calcLayout(
  props: CombinedChartProps,
  {
    chartHeight,
    chartWidth,
    hasAxis,
  }: { chartHeight: number; chartWidth: number; hasAxis: boolean },
) {
  let totalH = 0;

  let leftOffset = hasAxis ? AXIS.leftWidth : 0;
  const title = { x: leftOffset, y: totalH };

  totalH += TITLE.height + GAP;

  const legend = { x: leftOffset, y: totalH };
  const legendRows = Math.ceil(props.items.length / props.legendCols!.length);
  const legendTotalH =
    LEGEND.rowGap * (legendRows - 1) + LEGEND.rowHeight * legendRows;

  totalH += legendTotalH + GAP;

  const chart = { x: leftOffset, y: totalH };

  totalH += chartHeight;

  totalH += AXIS.bottomHeight;

  return {
    legend,
    title,
    chart,
    yAxis: { x: 0, y: chart.y },
    xAxis: { x: chart.x, y: chart.y + chartHeight },
    totalH: totalH,
    chartWidth,
    totalW: leftOffset + chartWidth,
  };
}

export function CombinedChart(props: CombinedChartProps) {
  let chartHeight = CHART.height;
  let chartWidth = 400;
  let hasAxis = false;

  Children.forEach(props.children, (child, i) => {
    if (child?.type === ChartLines) {
      if (child.props.height) {
        chartHeight = child.props.height;
      }
    }
  });

  const { legend, title, chart, totalH, totalW, ...layouts } = calcLayout(
    props,
    {
      chartHeight,
      chartWidth,
      hasAxis: hasAxis || true,
    },
  );

  const { xScale, yScale } = calcScale(props, {
    chartHeight,
    chartWidth,
  });

  const formatDate = (d: Date) => d3.timeFormat("%b %d")(d);

  return (
    <svg
      width={totalW}
      height={totalH}
      style={{ backgroundColor: "#fff" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {props.title && <ChartTitle title={props.title} xy={title} />}
      <AxisY xy={layouts.yAxis} yScale={yScale} />
      <AxisX
        xy={layouts.xAxis}
        chartWidth={layouts.chartWidth}
        xScale={xScale}
        timeFormat={formatDate}
      />

      <g className="children">
        {Children.map(props.children, (child) => {
          const modifiedChild = cloneElement(child, {
            ...child.props,
            time: props.time,
            xy: chart,
            xScale,
            yScale,
          });

          return modifiedChild;
        })}
      </g>
      {props.legendCols && (
        <ChartLegend
          items={props.items}
          xy={legend}
          legendWidth={props.legendCols}
        />
      )}
    </svg>
  );
}

function AxisX({
  xy,
  xScale,
  timeFormat,
  chartWidth,
}: {
  xy: XY;
  xScale: XScale;
  chartWidth: number;
  timeFormat: (date: Date) => string;
}) {
  const ticks = xScale.ticks(AXIS.tickCount);
  console.log(ticks);
  console.log(xScale.domain());
  const { x, y } = xy;

  return (
    <g className="x-axis">
      <line
        x1={x}
        y1={y}
        x2={x + chartWidth}
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

function AxisY({ xy, yScale }: { xy: XY; yScale: YScale }) {
  const ticks = yScale.ticks(AXIS.tickCount);
  const tickFormat = yScale.tickFormat(AXIS.tickCount, "s");
  const { x, y } = xy;
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

function calcScale(
  props: CombinedChartProps,
  { chartWidth, chartHeight }: { chartWidth: number; chartHeight: number },
) {
  const yMin = d3.min(props.items.map((s) => d3.min(s.data) ?? 0)) ?? 0;
  const yMax = d3.max(props.items.map((s) => d3.max(s.data) ?? 0)) ?? 0;

  const xScale = d3
    .scaleTime()
    .domain(d3.extent(props.time) as [Date, Date])
    .range([0 + CHART.inset.left, chartWidth - CHART.inset.right]);

  const yScale: YScale = d3
    .scaleLinear()
    .domain([yMax, yMin])
    .nice()
    .range([0 + CHART.inset.top, chartHeight - CHART.inset.bottom]);

  return { xScale, yScale };
}

function ChartLegend({
  items,
  legendWidth,
  xy,
}: {
  items: TimeSeriesItem[];
  legendWidth: number[];
  xy: XY;
}) {
  const { x: startX, y: startY } = xy;
  const columnCount = legendWidth.length;

  return (
    <g className="legend">
      {items.map((item, index) => {
        const col = index % columnCount;
        const row = Math.floor(index / columnCount);

        const colX =
          startX + legendWidth.slice(0, col).reduce((a, b) => a + b, 0);
        const itemY = startY + row * LEGEND.rowHeight + LEGEND.rowGap * row;
        const colY = itemY;

        // const textWidth = measureText(
        //   item.legend,
        //   `${LEGEND.fontSize}px ${LEGEND.fontFamily}`,
        // );

        return (
          <g key={index}>
            <rect
              x={colX}
              y={colY}
              width={LEGEND.colorBoxWidth}
              height={LEGEND.colorBoxHeight}
              fill={item.color}
            />
            <text
              x={colX + LEGEND.colorBoxWidth + LEGEND.colorBoxMargin}
              y={itemY + LEGEND.fontSize + LEGEND.fontVerticalAlignment}
              fontSize={LEGEND.fontSize}
              fontFamily={LEGEND.fontFamily}
              fill={LEGEND.color}
            >
              {item.legend}
            </text>
            {/*<text
              x={colX + LEGEND.colorBoxWidth + LEGEND.colorBoxMargin}
              y={itemY + LEGEND.fontSize + LEGEND.fontVerticalAlignment + 10}
              fontSize={LEGEND.fontSize}
              fontFamily={LEGEND.fontFamily}
              fill={LEGEND.color}
            >
              {textWidth}
            </text>*/}
          </g>
        );
      })}
    </g>
  );
}

export function renderAsString(node: ReactNode) {
  const div = document.createElement("div");
  const root = createRoot(div);
  flushSync(() => {
    root.render(node);
  });
  // console.log(div);
  return div.innerHTML;
}

function measureText(text: string, font: string): TextMetrics {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = font; // e.g., "12px sans-serif"
  return ctx.measureText(text).width.toFixed(3);
}

function ChartTitle({ title, xy }: { title: string; xy: XY }) {
  return (
    <text
      x={xy.x}
      y={xy.y + TITLE.height}
      fontSize={TITLE.fontSize}
      fontFamily={TITLE.fontFamily}
      fill={TITLE.color}
    >
      {title}
    </text>
  );
}

type ChartLinesProps = {
  timeSeries: TimeSeriesItem[];
};

type ChartLinesAllProps = ChartLinesProps & {
  time: Date[];
  xy: XY;
  xScale?: XScale;
  yScale?: YScale;
};

export function ChartLines(props: ChartLinesProps) {
  const { timeSeries, time, xy, xScale, yScale } =
    props as any as ChartLinesAllProps;

  const { x: offsetX, y: offsetY } = xy;
  const baselineY = 0;

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
