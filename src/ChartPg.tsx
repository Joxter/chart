import * as d3 from "d3";

type TimeSeriesItem = {
  label: string;
  color: string;
  data: number[];
};

type Params = {
  title?: string | null;
  timeSeries: TimeSeriesItem[];
  time: Date[];
  timeFormat: (date: Date) => string;
  legendWidth: number[];
  showAxis: boolean;
  // layoutRows: чтоб управлять очередностью элементов и отступами между ними
  //   например ['title', 10, 'chart', 20, 'legend']
  //            ['title', 0, 'legend', 5, 'chart']
  //            ['title', 20,'chart']
  //   предположим что пользователь не будет писать элементы несколько раз
  layoutRows: ("title" | "legend" | "chart" | number)[];
};

const TITLE = {
  fontSize: 16,
  fontFamily: "sans-serif",
  color: "#333",
  height: 24,
};

const CHART = {
  width: 600,
  height: 200,
  lineWidth: 2,
  inset: {
    top: 5, // отступ данных от верхнего края области графика
    right: 12, // отступ данных от правого края области графика
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
  top: 4, // внешний отступ сверху SVG
  right: 16, // внешний отступ справа SVG (для подписей X-оси)
};

const LEGEND = {
  rowHeight: 20,
  colorBoxSize: 12,
  colorBoxMargin: 8,
  fontSize: 12,
  fontFamily: "sans-serif",
  color: "#333",
};

// --- Layout Calculator ---

type Layout = {
  totalWidth: number;
  totalHeight: number;
  title: { x: number; y: number } | null;
  chart: { x: number; y: number; width: number; height: number } | null;
  axisY: { x: number; y: number } | null;
  axisX: { x: number; y: number } | null;
  legend: { x: number; y: number; rows: number } | null;
};

function calculateLayout(params: Params): Layout {
  const hasAxis = params.showAxis;
  const chartX = hasAxis ? AXIS.leftWidth : 0;

  // Для легенды
  const columnCount = params.legendWidth.length;
  const legendRowCount = Math.ceil(params.timeSeries.length / columnCount);

  let currentY = PADDING.top;

  let titleLayout: Layout["title"] = null;
  let chartLayout: Layout["chart"] = null;
  let axisYLayout: Layout["axisY"] = null;
  let axisXLayout: Layout["axisX"] = null;
  let legendLayout: Layout["legend"] = null;

  for (const item of params.layoutRows) {
    if (typeof item === "number") {
      // Это отступ
      currentY += item;
    } else if (item === "title") {
      if (params.title !== null) {
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

// --- Scales Type ---

type Scales = {
  x: d3.ScaleTime<number, number>;
  y: d3.ScaleLinear<number, number>;
};

// --- Render Functions ---

function renderTitle(params: Params, layout: Layout): string {
  if (!layout.title || !params.title) return "";
  const { x, y } = layout.title;
  return `<text
    x="${x}"
    y="${y + TITLE.fontSize}"
    font-size="${TITLE.fontSize}"
    font-family="${TITLE.fontFamily}"
    fill="${TITLE.color}"
  >${params.title}</text>`;
}

function renderAxisY(_params: Params, layout: Layout, scales: Scales): string {
  if (!layout.axisY) return "";

  const ticks = scales.y.ticks(AXIS.tickCount);
  const { x, y } = layout.axisY;
  const chartRight = x + AXIS.leftWidth;

  // Линия оси Y (вертикальная) — фиксированная по высоте CHART.height
  const axisLine = `
    <line
      x1="${chartRight}"
      y1="${y}"
      x2="${chartRight}"
      y2="${y + CHART.height}"
      stroke="${AXIS.color}"
      stroke-width="${AXIS.lineWidth}"
    />`;

  const ticksAndLabels = ticks
    .map((tick) => {
      const tickY = y + scales.y(tick);
      return `
      <line
        x1="${chartRight - AXIS.tickSize}"
        y1="${tickY}"
        x2="${chartRight}"
        y2="${tickY}"
        stroke="${AXIS.color}"
      />
      <text
        x="${chartRight - AXIS.tickSize - 4}"
        y="${tickY}"
        font-size="${AXIS.fontSize}"
        font-family="${AXIS.fontFamily}"
        fill="${AXIS.color}"
        text-anchor="end"
        dominant-baseline="middle"
      >${tick}</text>`;
    })
    .join("");

  return axisLine + ticksAndLabels;
}

function renderAxisX(params: Params, layout: Layout, scales: Scales): string {
  if (!layout.axisX) return "";

  const ticks = scales.x.ticks(AXIS.tickCount);
  const { x, y } = layout.axisX;

  // Линия оси X (горизонтальная) — фиксированная по ширине CHART.width
  const axisLine = `
    <line
      x1="${x}"
      y1="${y}"
      x2="${x + CHART.width}"
      y2="${y}"
      stroke="${AXIS.color}"
      stroke-width="${AXIS.lineWidth}"
    />`;

  const ticksAndLabels = ticks
    .map((tick) => {
      const tickX = x + scales.x(tick);
      return `
      <line
        x1="${tickX}"
        y1="${y}"
        x2="${tickX}"
        y2="${y + AXIS.tickSize}"
        stroke="${AXIS.color}"
      />
      <text
        x="${tickX}"
        y="${y + AXIS.tickSize + AXIS.fontSize}"
        font-size="${AXIS.fontSize}"
        font-family="${AXIS.fontFamily}"
        fill="${AXIS.color}"
        text-anchor="middle"
      >${params.timeFormat(tick)}</text>`;
    })
    .join("");

  return axisLine + ticksAndLabels;
}

function renderChartLines(
  params: Params,
  layout: Layout,
  scales: Scales,
): string {
  if (!layout.chart) return "";
  const { x: offsetX, y: offsetY } = layout.chart;

  return params.timeSeries
    .map((series) => {
      const lineGenerator = d3
        .line<number>()
        .x((_, i) => offsetX + scales.x(params.time[i]))
        .y((d) => offsetY + scales.y(d));

      const pathD = lineGenerator(series.data);
      return `<path
        d="${pathD}"
        fill="none"
        stroke="${series.color}"
        stroke-width="${CHART.lineWidth}"
      />`;
    })
    .join("");
}

function renderLegend(params: Params, layout: Layout): string {
  if (!layout.legend) return "";
  const { x: startX, y: startY } = layout.legend;
  const columnCount = params.legendWidth.length;

  return params.timeSeries
    .map((series, index) => {
      const col = index % columnCount;
      const row = Math.floor(index / columnCount);

      // Вычисляем X позицию на основе суммы ширин предыдущих колонок
      const colX =
        startX + params.legendWidth.slice(0, col).reduce((a, b) => a + b, 0);
      const itemY = startY + row * LEGEND.rowHeight;

      const boxY = itemY + (LEGEND.rowHeight - LEGEND.colorBoxSize) / 2;

      return `
      <rect
        x="${colX}"
        y="${boxY}"
        width="${LEGEND.colorBoxSize}"
        height="${LEGEND.colorBoxSize}"
        fill="${series.color}"
      />
      <text
        x="${colX + LEGEND.colorBoxSize + LEGEND.colorBoxMargin}"
        y="${itemY + LEGEND.rowHeight / 2}"
        font-size="${LEGEND.fontSize}"
        font-family="${LEGEND.fontFamily}"
        fill="${LEGEND.color}"
        dominant-baseline="middle"
      >${series.label}</text>`;
    })
    .join("");
}

// --- Main Render Function ---

function renderTimeSeriesChart(params: Params): string {
  const { timeSeries, time, showAxis } = params;

  if (timeSeries.length === 0 || time.length === 0) {
    return "<svg></svg>";
  }

  const layout = calculateLayout(params);

  // Создаём scales
  const allValues = timeSeries.flatMap((s) => s.data);
  const yMin = d3.min(allValues) ?? 0;
  const yMax = d3.max(allValues) ?? 0;

  const scales: Scales = {
    x: d3
      .scaleTime()
      .domain(d3.extent(time) as [Date, Date])
      .range([0, CHART.width - CHART.inset.right]),
    y: d3
      .scaleLinear()
      .domain([yMax, yMin]) // инвертируем для SVG координат
      .range([CHART.inset.top, CHART.height]),
  };

  // Собираем SVG
  const parts: string[] = [];

  parts.push(renderTitle(params, layout));

  if (showAxis) {
    parts.push(renderAxisY(params, layout, scales));
    parts.push(renderAxisX(params, layout, scales));
  }

  parts.push(renderChartLines(params, layout, scales));
  parts.push(renderLegend(params, layout));

  return `<svg width="${layout.totalWidth}" height="${layout.totalHeight}" xmlns="http://www.w3.org/2000/svg">
    ${parts.join("\n")}
  </svg>`;
}

// --- Тестовые данные ---

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

export function ChartPg() {
  const svg = renderTimeSeriesChart({
    title: "Sample Time Series Chart",
    timeSeries: testTimeSeries,
    time: testTime,
    timeFormat: (d) => d3.timeFormat("%b %d")(d),
    legendWidth: [120, 120],
    showAxis: true,
    layoutRows: ["title", 12, "chart", 16, "legend"],
  });

  return (
    <div>
      <h2>Charts</h2>
      <div dangerouslySetInnerHTML={{ __html: svg }}></div>

      <h3>Legend before chart</h3>
      <div
        dangerouslySetInnerHTML={{
          __html: renderTimeSeriesChart({
            title: "Legend First",
            timeSeries: testTimeSeries,
            time: testTime,
            timeFormat: (d) => d3.timeFormat("%b %d")(d),
            legendWidth: [120, 120],
            showAxis: true,
            layoutRows: ["title", 12, "legend", 16, "chart"],
          }),
        }}
      ></div>

      <h3>Chart only (no legend)</h3>
      <div
        dangerouslySetInnerHTML={{
          __html: renderTimeSeriesChart({
            // title: "Chart Only",
            timeSeries: testTimeSeries,
            time: testTime,
            timeFormat: (d) => d3.timeFormat("%b %d")(d),
            legendWidth: [100, 100, 100],
            showAxis: true,
            layoutRows: ["chart"],
          }),
        }}
      ></div>
    </div>
  );
}
