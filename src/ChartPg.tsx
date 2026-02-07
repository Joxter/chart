import * as d3 from "d3";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  TimeSeriesChart,
  CategoricalChart,
  HeatMapChart,
  type TimeSeriesItem,
  type CategoricalSeriesItem,
  type HighlightPeriod,
} from "./Chart";
import { ExplorerTab } from "./ExplorerTab";

// --- Seeded random for reproducible mock data ---

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// --- Data generation helpers ---

/** Generate 15-min interval timestamps over a date range */
function generateTimeAxis(start: Date, months: number): Date[] {
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);
  const times: Date[] = [];
  const cur = new Date(start);
  while (cur < end) {
    times.push(new Date(cur));
    cur.setMinutes(cur.getMinutes() + 15);
  }
  return times;
}

/** Generate a realistic 15-min energy signal with daily, weekly & seasonal patterns */
function generateSignal(
  timeAxis: Date[],
  opts: {
    base: number;
    dailyAmp: number;
    seasonalAmp: number;
    noise: number;
    seed: number;
    peakHour?: number; // hour of day for daily peak (default 14)
    seasonalPeakMonth?: number; // 0-11, month index for seasonal peak (default 6 = July)
    weekendFactor?: number; // multiplier applied on Sat/Sun (default 1.0 = no change)
    weekdayProfile?: number[]; // per-day-of-week multiplier [Mon..Sun], overrides weekendFactor
    nightZero?: boolean; // if true, clamp to 0 outside sunrise-sunset (useful for solar)
  },
): number[] {
  const rand = seededRandom(opts.seed);
  const peakHour = opts.peakHour ?? 14;
  const seasonalPeak = opts.seasonalPeakMonth ?? 6;
  const nightZero = opts.nightZero ?? false;
  const weekdayProfile = opts.weekdayProfile; // Mon=0 .. Sun=6
  const weekendFactor = opts.weekendFactor ?? 1.0;

  const data: number[] = [];
  for (let i = 0; i < timeAxis.length; i++) {
    const t = timeAxis[i];
    const hourOfDay = t.getHours() + t.getMinutes() / 60;
    const month = t.getMonth(); // 0-11
    const dow = (t.getDay() + 6) % 7; // Mon=0 .. Sun=6

    // daily cycle: cosine centered on peakHour
    const daily =
      opts.dailyAmp * Math.cos(((hourOfDay - peakHour) / 24) * 2 * Math.PI);

    // seasonal cycle: cosine centered on seasonalPeakMonth
    const seasonal =
      opts.seasonalAmp * Math.cos(((month - seasonalPeak) / 12) * 2 * Math.PI);

    // weekly pattern
    let weekFactor: number;
    if (weekdayProfile) {
      weekFactor = weekdayProfile[dow];
    } else {
      weekFactor = dow >= 5 ? weekendFactor : 1.0;
    }

    // sunrise/sunset mask for solar-like signals
    // approximate sunrise/sunset shifting with season (hours)
    if (nightZero) {
      const summerShift = 2 * Math.cos(((month - 6) / 12) * 2 * Math.PI);
      const sunrise = 6.5 - summerShift;
      const sunset = 19.5 + summerShift;
      if (hourOfDay < sunrise || hourOfDay > sunset) {
        data.push(0);
        continue;
      }
    }

    const noise = opts.noise * (rand() - 0.5) * 2;
    data.push(Math.max(0, (opts.base + daily + seasonal + noise) * weekFactor));
  }
  return data;
}

/** Aggregate 15-min data into monthly sums, returning labels and values */
function aggregateMonthly(
  time: Date[],
  data: number[],
): { labels: string[]; values: number[] } {
  const map = new Map<string, number>();
  for (let i = 0; i < time.length; i++) {
    const key = d3.timeFormat("%b %Y")(time[i]);
    map.set(key, (map.get(key) ?? 0) + data[i]);
  }
  return { labels: [...map.keys()], values: [...map.values()] };
}

// --- Test data: 10 months of 15-min energy measurements ---

const DATA_START = new Date("2024-03-01T00:00:00");
const DATA_MONTHS = 10;
const testTime = generateTimeAxis(DATA_START, 12);

// Solar generation (kW) — zero at night, peaks midday, strong seasonal swing
const solarData = generateSignal(testTime, {
  base: 40,
  dailyAmp: 35,
  seasonalAmp: 25,
  noise: 4,
  seed: 1,
  peakHour: 13,
  seasonalPeakMonth: 6,
  nightZero: true,
  weekendFactor: 1.0, // solar doesn't care about weekdays
});

// Battery SoC (%) — charges during day, discharges at night; weekends draw less
const batterySoCData = generateSignal(testTime, {
  base: 55,
  dailyAmp: 25,
  seasonalAmp: 10,
  noise: 8,
  seed: 2,
  peakHour: 17,
  seasonalPeakMonth: 7,
  weekendFactor: 1.1, // slightly higher SoC on weekends (less consumption)
});

// Grid consumption (kW) — higher at night and winter, drops on weekends
const gridData = generateSignal(testTime, {
  base: 40,
  dailyAmp: 20,
  seasonalAmp: 18,
  noise: 6,
  seed: 3,
  peakHour: 2,
  seasonalPeakMonth: 0, // peak in winter
  weekdayProfile: [1.1, 1.05, 1.0, 1.05, 1.1, 0.7, 0.6], // Mon-Fri busy, Sat-Sun low
});

// Generator runtime (kW) — backup, ramps up in winter; rare on weekends
const generatorData = generateSignal(testTime, {
  base: 5,
  dailyAmp: 3,
  seasonalAmp: 10,
  noise: 10,
  seed: 4,
  peakHour: 19,
  seasonalPeakMonth: 0, // winter peak
  weekdayProfile: [1.0, 1.0, 1.2, 1.1, 1.0, 0.3, 0.2], // almost off on weekends
}).map((n) => (n === 0 ? 0.000001 : n));

// Site load (kW) — office/industrial pattern: high weekdays, low weekends
const loadData = generateSignal(testTime, {
  base: 60,
  dailyAmp: 25,
  seasonalAmp: 15,
  noise: 7,
  seed: 5,
  peakHour: 14,
  seasonalPeakMonth: 7, // cooling load in summer
  weekdayProfile: [1.15, 1.1, 1.05, 1.1, 1.0, 0.55, 0.45], // big weekday/weekend contrast
});

const testTimeSeries: TimeSeriesItem[] = [
  { legend: "Solar", color: "#f9a825", data: solarData },
];

const mixedAreaSeries: TimeSeriesItem[] = [
  {
    legend: "Net Grid Flow",
    color: "#2ca02c",
    variant: "area",
    data: solarData.map((s, i) => s - gridData[i]),
  },
];

const mixedBarsSeries: TimeSeriesItem[] = [
  {
    legend: "Battery Charge/Discharge",
    color: "#17becf",
    variant: "bars",
    data: batterySoCData.map((_, i) =>
      i === 0 ? 0 : batterySoCData[i] - batterySoCData[i - 1],
    ),
  },
];

const stackedAreaWithLine: TimeSeriesItem[] = [
  {
    legend: "Solar",
    color: "#f9a825",
    variant: "area",
    data: solarData,
  },
  {
    legend: "Generator",
    color: "#ff7f0e",
    variant: "area",
    data: generatorData,
  },
  {
    legend: "Site Load",
    color: "#d62728",
    variant: "line",
    data: loadData,
  },
];

const formatDate = (d: Date) => d3.timeFormat("%b %d")(d);

// --- Categorical (monthly aggregated) data ---

const solarMonthly = aggregateMonthly(testTime, solarData);
const gridMonthly = aggregateMonthly(testTime, gridData);
const generatorMonthly = aggregateMonthly(testTime, generatorData);
const loadMonthly = aggregateMonthly(testTime, loadData);
const batteryMonthly = aggregateMonthly(testTime, batterySoCData);

const monthLabels = solarMonthly.labels;

const categoricalSeries: CategoricalSeriesItem[] = [
  {
    legend: "Solar Generation",
    color: "#f9a825",
    values: solarMonthly.values.map((v) => Math.round(v / 1000)),
  },
  {
    legend: "Grid Import",
    color: "#e53935",
    values: gridMonthly.values.map((v) => Math.round(v / 1000)),
  },
];

const categoricalMixedSeries: CategoricalSeriesItem[] = [
  {
    legend: "Grid Export",
    color: "#2ca02c",
    values: solarMonthly.values.map((s, i) =>
      Math.round((s - loadMonthly.values[i]) / 1000),
    ),
  },
  {
    legend: "Grid Import",
    color: "#d62728",
    values: gridMonthly.values.map((g, i) =>
      Math.round((g - solarMonthly.values[i] * 0.3) / 1000),
    ),
  },
];

const categoricalWithLine: CategoricalSeriesItem[] = [
  {
    legend: "Solar (MWh)",
    color: "#f9a825",
    values: solarMonthly.values.map((v) => Math.round(v / 1000)),
  },
  {
    legend: "Generator (MWh)",
    color: "#ff7f0e",
    values: generatorMonthly.values.map((v) => Math.round(v / 1000)),
  },
  {
    legend: "Load (MWh)",
    color: "#d62728",
    variant: "line",
    values: loadMonthly.values.map((v) => Math.round(v / 1000)),
  },
];

const stackedSeries: CategoricalSeriesItem[] = [
  {
    legend: "Solar",
    color: "#f9a825",
    values: solarMonthly.values.map((v) => Math.round(v / 1000)),
  },
  {
    legend: "Grid",
    color: "#e53935",
    values: gridMonthly.values.map((v) => Math.round(v / 1000)),
  },
  {
    legend: "Generator",
    color: "#ff7f0e",
    values: generatorMonthly.values.map((v) => Math.round(v / 1000)),
  },
  {
    legend: "Battery",
    color: "#1e88e5",
    values: batteryMonthly.values.map((v) => Math.round(v / 1000)),
  },
];

const stackedWithLine: CategoricalSeriesItem[] = [
  {
    legend: "Solar",
    color: "#f9a825",
    values: solarMonthly.values.map((v) => Math.round(v / 1000)),
  },
  {
    legend: "Generator",
    color: "#ff7f0e",
    values: generatorMonthly.values.map((v) => Math.round(v / 1000)),
  },
  {
    legend: "Target Load",
    color: "#d62728",
    variant: "line",
    values: loadMonthly.values.map((v) => Math.round(v / 1000)),
  },
];

const stackedDivergingSeries: CategoricalSeriesItem[] = [
  {
    legend: "Solar",
    color: "#f9a825",
    values: solarMonthly.values.map((v) => Math.round(v / 1000)),
  },
  {
    legend: "Generator",
    color: "#ff7f0e",
    values: generatorMonthly.values.map((v) => Math.round(v / 1000)),
  },
  {
    legend: "Grid Import",
    color: "#e53935",
    values: gridMonthly.values.map((v) => -Math.round(v / 1000)),
  },
  {
    legend: "Site Load",
    color: "#7b1fa2",
    values: loadMonthly.values.map((v) => -Math.round(v / 1000)),
  },
];

const stackedDivergingAreas: TimeSeriesItem[] = [
  {
    legend: "Solar",
    color: "#f9a825",
    variant: "area",
    data: solarData,
  },
  {
    legend: "Generator",
    color: "#ff7f0e",
    variant: "area",
    data: generatorData,
  },
  {
    legend: "Grid Import",
    color: "#e53935",
    variant: "area",
    data: gridData.map((v) => -v),
  },
  {
    legend: "Site Load",
    color: "#7b1fa2",
    variant: "area",
    data: loadData.map((v) => -v),
  },
];

// --- Heatmap data helpers ---

/** Reshape a flat 15-min signal array into data[day][slot] with day dates */
function reshapeTo15min(
  signal: number[],
  startDate: Date,
): { data: number[][]; days: Date[] } {
  const slotsPerDay = 96;
  const numDays = Math.floor(signal.length / slotsPerDay);
  const days: Date[] = [];
  const data: number[][] = [];

  for (let d = 0; d < numDays; d++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    days.push(date);
    data.push(signal.slice(d * slotsPerDay, (d + 1) * slotsPerDay));
  }
  return { data, days };
}

/** Reshape a flat 15-min signal into hourly averages per day */
function reshapeToHourly(
  signal: number[],
  startDate: Date,
): { data: number[][]; days: Date[] } {
  const slotsPerDay = 96;
  const numDays = Math.floor(signal.length / slotsPerDay);
  const days: Date[] = [];
  const data: number[][] = [];

  for (let d = 0; d < numDays; d++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    days.push(date);
    const hourly: number[] = [];
    for (let h = 0; h < 24; h++) {
      const base = d * slotsPerDay + h * 4;
      let sum = 0;
      for (let q = 0; q < 4; q++) sum += signal[base + q] ?? 0;
      hourly.push(sum / 4);
    }
    data.push(hourly);
  }
  return { data, days };
}

/**
 * Reshape a flat 15-min signal into weekly grid with full 15-min resolution.
 * X = week timeline (7 days × 96 slots = 672 columns), Y = week number (~52 rows).
 * data[weekSlot][weekIndex] where weekSlot = dow * 96 + slotInDay.
 */
function reshapeToWeekly(
  signal: number[],
  startDate: Date,
): {
  data: number[][];
  xLabels: { col: number; label: string }[];
  yLabels: { row: number; label: string }[];
} {
  const slotsPerDay = 96;
  const totalDays = Math.floor(signal.length / slotsPerDay);
  const startDow = (startDate.getDay() + 6) % 7; // Mon=0
  const totalWeeks = Math.ceil((totalDays + startDow) / 7);
  const weekCols = 7 * slotsPerDay; // 672

  // data[weekSlot][weekIndex]
  const data: number[][] = Array.from({ length: weekCols }, () =>
    Array(totalWeeks).fill(NaN),
  );

  for (let d = 0; d < totalDays; d++) {
    const dow = (d + startDow) % 7;
    const week = Math.floor((d + startDow) / 7);
    const srcBase = d * slotsPerDay;
    const colBase = dow * slotsPerDay;
    for (let s = 0; s < slotsPerDay; s++) {
      data[colBase + s][week] = signal[srcBase + s] ?? NaN;
    }
  }

  // X labels: day names at the start of each day's 96-slot block
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const xLabels = dayNames.map((label, i) => ({
    col: i * slotsPerDay,
    label,
  }));

  // Y labels: season starts mapped to week rows
  const seasons = [
    { month: 2, day: 20, label: "Spring" },
    { month: 5, day: 20, label: "Summer" },
    { month: 8, day: 22, label: "Autumn" },
    { month: 11, day: 21, label: "Winter" },
  ];
  const yLabels: { row: number; label: string }[] = [];
  for (const s of seasons) {
    for (const year of [startDate.getFullYear(), startDate.getFullYear() + 1]) {
      const sDate = new Date(year, s.month, s.day);
      const diffDays = Math.round(
        (sDate.getTime() - startDate.getTime()) / 86400000,
      );
      if (diffDays >= 0 && diffDays < totalDays) {
        const week = Math.floor((diffDays + startDow) / 7);
        yLabels.push({ row: week, label: s.label });
      }
    }
  }

  return { data, xLabels, yLabels };
}

const loadHourly = reshapeToHourly(loadData, DATA_START);
const solarHourly = reshapeToHourly(solarData, DATA_START);
const load15min = reshapeTo15min(loadData, DATA_START);
const solar15min = reshapeTo15min(solarData, DATA_START);
const grid15min = reshapeTo15min(gridData, DATA_START);
const loadWeekly = reshapeToWeekly(loadData, DATA_START);
const solarWeekly = reshapeToWeekly(solarData, DATA_START);
const gridWeekly = reshapeToWeekly(gridData, DATA_START);

// --- Tab helpers: sync active tab with URL search param ---

const TAB_PARAM = "tab";
const TABS = ["explorer", "timeseries", "categorical", "heatmap"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  explorer: "Explorer",
  timeseries: "Time Series",
  categorical: "Categorical",
  heatmap: "Heat Map",
};

function getTabFromURL(): Tab {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(TAB_PARAM);
  if (raw && TABS.includes(raw as Tab)) return raw as Tab;
  return TABS[0];
}

function setTabInURL(tab: Tab) {
  const url = new URL(window.location.href);
  url.searchParams.set(TAB_PARAM, tab);
  window.history.replaceState(null, "", url.toString());
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function subscribeToURL(cb: () => void) {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
}

const tabBarStyle: React.CSSProperties = {
  display: "flex",
  gap: 0,
  borderBottom: "2px solid #ddd",
  marginBottom: 16,
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: "8px 20px",
    cursor: "pointer",
    fontWeight: active ? 600 : 400,
    fontSize: 14,
    color: active ? "#333" : "#888",
    background: "none",
    border: "none",
    borderBottom: `2px solid ${active ? "#333" : "transparent"}`,
    marginBottom: -2,
  };
}

// --- Tab content components ---

const sampleHighlightDates: HighlightPeriod[] = [
  { date: new Date("2024-06-01") },
  { date: new Date("2024-09-01") },
  { date: new Date("2024-12-01") },
];

const sampleHighlightRanges: HighlightPeriod[] = [
  { from: new Date("2024-07-15"), to: new Date("2024-08-15") },
  { from: new Date("2024-12-20"), to: new Date("2025-01-05") },
];

const sampleHighlightsMixed: HighlightPeriod[] = [
  { date: new Date("2024-05-01") },
  { from: new Date("2024-06-15"), to: new Date("2024-07-15") },
  { date: new Date("2024-10-01") },
  { from: new Date("2024-11-01"), to: new Date("2024-11-30") },
];

function TimeSeriesTab() {
  return (
    <>
      <h3>Highlight periods — date lines</h3>
      <TimeSeriesChart
        timeSeries={[{ legend: "Load", color: "#1f77b4", data: loadData }]}
        time={testTime}
        timeFormat={formatDate}
        legendWidth={[120]}
        domain={[0]}
        highlights={sampleHighlightDates}
      />

      <h3>Highlight periods — ranges</h3>
      <TimeSeriesChart
        title="Battery SoC vs Min Threshold"
        timeSeries={[
          {
            legend: "Battery SoC",
            color: "#2196F3",
            variant: "area",
            data: batterySoCData,
          },
          {
            legend: "Min SoC Limit",
            color: "#666",
            variant: "exceeded",
            data: batterySoCData.map((_, i) =>
              Math.floor(i / 100) % 10 > 5 ? 20 : 30,
            ),
          },
        ]}
        time={testTime}
        unit="%"
        timeFormat={formatDate}
        legendWidth={[120, 120]}
        highlights={sampleHighlightsMixed}
      />

      <h3>Dual Y-Axis (secondUnit)</h3>
      <TimeSeriesChart
        title="Solar Output vs Ambient Temperature"
        timeSeries={[
          {
            legend: "Solar",
            color: "#f9a825",
            variant: "line",
            data: solarData,
          },
          {
            legend: "Temperature",
            color: "#d62728",
            secondUnit: "°C",
            data: generateSignal(testTime, {
              base: 18,
              dailyAmp: 6,
              seasonalAmp: 10,
              noise: 2,
              seed: 7,
              peakHour: 15,
              seasonalPeakMonth: 7,
            }),
          },
        ]}
        time={testTime}
        timeFormat={formatDate}
        unit="kW"
        legendWidth={[120, 120]}
      />

      <h3>Chart only (no legend)</h3>
      <TimeSeriesChart
        timeSeries={testTimeSeries}
        time={testTime}
        timeFormat={formatDate}
        layoutRows={["chart"]}
      />

      <h3>Area and bars with mixed values</h3>
      <TimeSeriesChart
        title="Net Grid Flow & Battery Charge Cycles"
        timeSeries={[...mixedAreaSeries, ...mixedBarsSeries].map((it) => {
          it.data = it.data.slice(3000, 3100);
          return it;
        })}
        time={testTime.slice(3000, 3100)}
        unit="kW"
        timeFormat={formatDate}
        legendWidth={[120, 160]}
        showAxis={true}
      />

      <h3>Stacked areas with line overlay</h3>
      <TimeSeriesChart
        title="Generation Sources vs Site Load"
        timeSeries={stackedAreaWithLine.map((it) => {
          it.data = it.data.slice(3000, 3100);
          return it;
        })}
        time={testTime.slice(3000, 3100)}
        unit="kW"
        timeFormat={formatDate}
        legendWidth={[80, 100, 100]}
        showAxis={true}
        stackedAreas={true}
      />

      <h3>Diverging stacked areas (positive/negative)</h3>
      <TimeSeriesChart
        title="Energy Balance: Generation vs Consumption"
        timeSeries={stackedDivergingAreas.map((it) => {
          it.data = it.data.slice(3000, 3100);
          return it;
        })}
        time={testTime.slice(3000, 3100)}
        unit="kW"
        timeFormat={formatDate}
        legendWidth={[80, 100, 100, 80]}
        showAxis={true}
        stackedAreas={true}
      />
    </>
  );
}

function CategoricalTab() {
  return (
    <>
      <h3>Monthly Energy Production</h3>
      <CategoricalChart
        title="Monthly Energy Production (MWh)"
        labels={monthLabels}
        series={categoricalSeries}
        unit="MWh"
        legendWidth={[120, 120]}
      />

      <h3>Categorical with negative values</h3>
      <CategoricalChart
        title="Grid Import / Export Balance (MWh)"
        labels={monthLabels}
        series={categoricalMixedSeries}
        unit="MWh"
        legendWidth={[100, 100]}
      />

      <h3>Bars with line overlay</h3>
      <CategoricalChart
        title="Generation vs Load (MWh)"
        labels={monthLabels}
        series={categoricalWithLine}
        unit="MWh"
        legendWidth={[100, 100, 100]}
      />

      <h3>Stacked bars</h3>
      <CategoricalChart
        title="Energy Sources by Month (MWh)"
        labels={monthLabels}
        series={stackedSeries}
        stackedBars={true}
        unit="MWh"
        legendWidth={[80, 80, 80, 80]}
      />

      <h3>Stacked bars with line overlay</h3>
      <CategoricalChart
        title="Generation vs Target Load (MWh)"
        labels={monthLabels}
        series={stackedWithLine}
        stackedBars={true}
        unit="MWh"
        legendWidth={[80, 80, 100]}
      />

      <h3>Diverging stacked bars (positive/negative)</h3>
      <CategoricalChart
        title="Energy Balance: Sources vs Consumption (MWh)"
        labels={monthLabels}
        series={stackedDivergingSeries}
        stackedBars={true}
        unit="MWh"
        legendWidth={[80, 80, 80, 80]}
      />
    </>
  );
}

function HeatMapTab() {
  return (
    <>
      <h3>Weekly view (Mon–Sun x Weeks)</h3>
      <HeatMapChart
        title="Site Load — Weekly"
        data={loadWeekly.data}
        xLabels={loadWeekly.xLabels}
        yLabels={loadWeekly.yLabels}
        colorRange={["#4575b4", "#d73027"]}
        cellWidth={1}
        cellHeight={2}
      />

      <HeatMapChart
        title="Solar Output — Weekly"
        data={solarWeekly.data}
        xLabels={solarWeekly.xLabels}
        yLabels={solarWeekly.yLabels}
        colorRange={["#ffffcc", "#f9a825"]}
        cellWidth={1}
        cellHeight={2}
      />

      <HeatMapChart
        title="Grid Consumption — Weekly"
        data={gridWeekly.data}
        xLabels={gridWeekly.xLabels}
        yLabels={gridWeekly.yLabels}
        colorRange={["#e8f5e9", "#e53935"]}
        cellWidth={1}
        cellHeight={2}
      />

      <h3>Hourly resolution (24 rows)</h3>
      <HeatMapChart
        title="Site Load — Hourly"
        data={loadHourly.data}
        days={loadHourly.days}
        colorRange={["#4575b4", "#d73027"]}
        cellWidth={2}
        cellHeight={4}
      />

      <h3>15-min resolution, full year (96 rows, 1px per slot)</h3>
      <HeatMapChart
        title="Site Load — 15 min"
        data={load15min.data}
        days={load15min.days}
        colorRange={["#4575b4", "#d73027"]}
        cellWidth={2}
        cellHeight={1}
      />

      <HeatMapChart
        title="Solar Output — 15 min"
        data={solar15min.data}
        days={solar15min.days}
        colorRange={["#ffffcc", "#f9a825"]}
        cellWidth={2}
        cellHeight={1}
      />

      <HeatMapChart
        title="Grid Consumption — 15 min"
        data={grid15min.data}
        days={grid15min.days}
        colorRange={["#e8f5e9", "#e53935"]}
        cellWidth={2}
        cellHeight={1}
      />

      <h3>Hourly solar</h3>
      <HeatMapChart
        title="Solar Output — Hourly"
        data={solarHourly.data}
        days={solarHourly.days}
        colorRange={["#ffffcc", "#f9a825"]}
        cellWidth={2}
        cellHeight={4}
      />
    </>
  );
}

// --- Playground ---

export function ChartPg() {
  const tab = useSyncExternalStore(subscribeToURL, getTabFromURL);
  const setTab = useCallback((t: Tab) => setTabInURL(t), []);

  return (
    <div>
      <div style={tabBarStyle}>
        {TABS.map((t) => (
          <button key={t} style={tabStyle(t === tab)} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      {tab === "explorer" && <ExplorerTab />}
      {tab === "timeseries" && <TimeSeriesTab />}
      {tab === "categorical" && <CategoricalTab />}
      {tab === "heatmap" && <HeatMapTab />}
    </div>
  );
}
