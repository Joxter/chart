import * as d3 from "d3";

type TimeSeriesItem = {
  label: string;
  color: string;
  data: number[];
};

type Params = {
  title: string | null;
  timeSeries: TimeSeriesItem[];
  time: Date[];
  timeFormat: (date: Date) => string;
  legendWidth: number[];
  showAxis: boolean;
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
};

const AXIS = {
  leftWidth: 60,
  bottomHeight: 30,
  fontSize: 12,
  fontFamily: "sans-serif",
  color: "#666",
  tickSize: 5,
  tickCount: 5,
};

const LEGEND = {
  rowHeight: 20,
  colorBoxSize: 12,
  colorBoxMargin: 8,
  fontSize: 12,
  fontFamily: "sans-serif",
  color: "#333",
};

const SPACING = {
  titleToChart: 12,
  chartToLegend: 16,
};

// --- Layout Calculator ---

type Layout = {
  totalWidth: number;
  totalHeight: number;
  title: { x: number; y: number } | null;
  chart: { x: number; y: number; width: number; height: number };
  axisY: { x: number; y: number } | null;
  axisX: { x: number; y: number } | null;
  legend: { x: number; y: number; rows: number };
};

function calculateLayout(params: Params): Layout {
  const hasTitle = params.title !== null;
  const hasAxis = params.showAxis;
  const columnCount = params.legendWidth.length;
  const legendRows = Math.ceil(params.timeSeries.length / columnCount);

  let currentY = 0;

  // Title
  const titleLayout = hasTitle ? { x: 0, y: currentY } : null;
  if (hasTitle) {
    currentY += TITLE.height + SPACING.titleToChart;
  }

  // Chart area offset
  const chartX = hasAxis ? AXIS.leftWidth : 0;
  const chartY = currentY;
  const chartWidth = CHART.width;
  const chartHeight = CHART.height;

  // Axis Y (слева от графика)
  const axisYLayout = hasAxis ? { x: 0, y: chartY } : null;

  // Axis X (снизу графика)
  const axisXLayout = hasAxis ? { x: chartX, y: chartY + chartHeight } : null;

  currentY = chartY + chartHeight;
  if (hasAxis) {
    currentY += AXIS.bottomHeight;
  }

  // Legend
  currentY += SPACING.chartToLegend;
  const legendLayout = { x: chartX, y: currentY, rows: legendRows };
  currentY += legendRows * LEGEND.rowHeight;

  // Total dimensions
  const totalWidth = chartX + chartWidth;
  const totalHeight = currentY;

  return {
    totalWidth,
    totalHeight,
    title: titleLayout,
    chart: { x: chartX, y: chartY, width: chartWidth, height: chartHeight },
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

function renderAxisY(params: Params, layout: Layout, scales: Scales): string {
  if (!layout.axisY) return "";

  const ticks = scales.y.ticks(AXIS.tickCount);
  const { x, y } = layout.axisY;
  const chartRight = x + AXIS.leftWidth;

  return ticks
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
}

function renderAxisX(params: Params, layout: Layout, scales: Scales): string {
  if (!layout.axisX) return "";

  const ticks = scales.x.ticks(AXIS.tickCount);
  const { x, y } = layout.axisX;

  return ticks
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
}

function renderChartLines(
  params: Params,
  layout: Layout,
  scales: Scales,
): string {
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
      .range([0, layout.chart.width]),
    y: d3
      .scaleLinear()
      .domain([yMax, yMin]) // инвертируем для SVG координат
      .range([0, layout.chart.height]),
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
  });

  return (
    <div>
      <h2>Charts</h2>
      <div dangerouslySetInnerHTML={{ __html: svg }}></div>

      <h3>Without title</h3>
      <div
        dangerouslySetInnerHTML={{
          __html: renderTimeSeriesChart({
            title: null,
            timeSeries: testTimeSeries,
            time: testTime,
            timeFormat: (d) => d3.timeFormat("%b %d")(d),
            legendWidth: [120, 120],
            showAxis: true,
          }),
        }}
      ></div>

      <h3>Without axis</h3>
      <div
        dangerouslySetInnerHTML={{
          __html: renderTimeSeriesChart({
            title: "No Axis Chart",
            timeSeries: testTimeSeries,
            time: testTime,
            timeFormat: (d) => d3.timeFormat("%b %d")(d),
            legendWidth: [100, 100, 100],
            showAxis: false,
          }),
        }}
      ></div>
    </div>
  );
}
