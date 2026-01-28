import * as d3 from "d3";
import {
  TimeSeriesChart,
  CategoricalChart,
  type TimeSeriesItem,
  type CategoricalSeriesItem,
} from "./Chart";
// import { ChartLines, CombinedChart, renderAsString } from "./CombinedChart.tsx";
// import { useEffect, useMemo, useState } from "react";

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
const testTime = generateTimeAxis(DATA_START, DATA_MONTHS);

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
});

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

// --- Playground ---

export function ChartPg() {
  return (
    <div>
      <h2>Custom Y Domain (starts at 0)</h2>
      <TimeSeriesChart
        title="Site Load (kW)"
        timeSeries={[{ legend: "Load", color: "#1f77b4", data: loadData }]}
        time={testTime}
        timeFormat={formatDate}
        legendWidth={[120]}
        domain={[0]}
      />

      <h2>Exceeded line</h2>
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
      />

      <h2>Dual Y-Axis (secondUnit)</h2>
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

      <h2>Categorical Charts (Monthly Aggregated)</h2>
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
    </div>
  );
}
