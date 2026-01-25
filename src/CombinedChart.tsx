import { type ReactNode, useMemo } from "react";
import * as d3 from "d3";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

const LEGEND = {
  fontSize: 12,
  rowHeight: 13,
  colorBoxWidth: 20,
  colorBoxHeight: 13,
  rowGap: 13,
  colorBoxMargin: 8,
  fontFamily: "sans-serif",
  fontVerticalAlignment: -1,
  color: "#333",
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
  time: Date[];
  children?: (ctx: ChartContext) => {
    svg: ReactNode;
    width: number;
    height: number;
  };
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

export function CombinedChart(props: CombinedChartProps) {
  //

  return (
    <svg
      width={400}
      height={120}
      style={{ backgroundColor: "#fff" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {props.legendCols && (
        <ChartLegend
          items={props.items}
          xy={{ x: 100, y: 40 }}
          // xy={{ x: 20, y: 0 }}
          legendWidth={props.legendCols}
        />
      )}
    </svg>
  );
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

        const textWidth = measureText(
          item.legend,
          `${LEGEND.fontSize}px ${LEGEND.fontFamily}`,
        );

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
            <text
              x={colX + LEGEND.colorBoxWidth + LEGEND.colorBoxMargin}
              y={itemY + LEGEND.fontSize + LEGEND.fontVerticalAlignment + 10}
              fontSize={LEGEND.fontSize}
              fontFamily={LEGEND.fontFamily}
              fill={LEGEND.color}
            >
              {textWidth}
            </text>
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
