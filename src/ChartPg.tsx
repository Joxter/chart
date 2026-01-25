import * as d3 from "d3";
import {
  TimeSeriesChart,
  CategoricalChart,
  type TimeSeriesItem,
  type CategoricalSeriesItem,
} from "./Chart";
import { CombinedChart, renderAsString } from "./CombinedChart.tsx";
import { useEffect, useMemo, useState } from "react";

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
  { legend: "Series A", color: "#e41a1c", data: [10, 25, 15, 30, 22, 28, 35] },
  { legend: "Series B", color: "#377eb8", data: [5, 15, 20, 18, 25, 30, 28] },
  { legend: "Series C", color: "#4daf4a", data: [20, 18, 22, 15, 20, 25, 30] },
];

const mixedTimeSeries: TimeSeriesItem[] = [
  { legend: "Profit", color: "#2ca02c", data: [12, -5, 18, -12, 25, 8, -3] },
  { legend: "Loss", color: "#d62728", data: [-8, 15, -20, 10, -5, -15, 22] },
];

const aroundZeroSeries: TimeSeriesItem[] = [
  { legend: "Delta A", color: "#9467bd", data: [2, -1, 3, -2, 1, -3, 4] },
  { legend: "Delta B", color: "#ff7f0e", data: [-3, 2, -1, 4, -2, 1, -1] },
];

const areaTimeSeries: TimeSeriesItem[] = [
  {
    legend: "Revenue",
    color: "#1f77b4",
    variant: "area",
    data: [10, 15, 12, 18, 22, 19, 25],
  },
  {
    legend: "Baseline",
    color: "#ff7f0e",
    variant: "line",
    data: [8, 8, 8, 8, 8, 8, 8],
  },
];

const mixedAreaSeries: TimeSeriesItem[] = [
  {
    legend: "Net Flow",
    color: "#2ca02c",
    variant: "area",
    data: [5, -3, 8, -6, 12, -2, 7],
  },
];

const mixedBarsSeries: TimeSeriesItem[] = [
  {
    legend: "Net Change",
    color: "#17becf",
    variant: "bars",
    data: [8, -12, 15, -5, 20, -8, 10],
  },
];

const stackedAreaWithLine: TimeSeriesItem[] = [
  {
    legend: "Revenue A",
    color: "#1f77b4",
    variant: "area",
    data: [20, 25, 22, 28, 32, 29, 35].map((x, i) => x * 2 ** i),
  },
  {
    legend: "Revenue B",
    color: "#ff7f0e",
    variant: "area",
    data: [15, 18, 16, 20, 22, 20, 24].map((x, i) => x * 2 ** i),
  },
  {
    legend: "Target",
    color: "#d62728",
    variant: "line",
    data: [30, 38, 35, 45, 50, 46, 65].map((x, i) => x * 2 ** i),
  },
];

const formatDate = (d: Date) => d3.timeFormat("%b %d")(d);

const categoricalLabels = ["Class A", "Class B", "Class C", "Class D"];

const categoricalSeries: CategoricalSeriesItem[] = [
  { legend: "Before", color: "#e41a1c", values: [10, 25, 15, 30, 20, 25] },
  { legend: "After", color: "#377eb8", values: [5, 15, 20, 18, 10, 12] },
];

const categoricalMixedSeries: CategoricalSeriesItem[] = [
  { legend: "Delta", color: "#2ca02c", values: [8, -12, 15, -5] },
  { legend: "Change", color: "#9467bd", values: [-5, 10, -8, 12] },
];

const categoricalWithLine: CategoricalSeriesItem[] = [
  { legend: "Sales", color: "#1f77b4", values: [120, 180, 150, 200] },
  { legend: "Costs", color: "#ff7f0e", values: [80, 100, 90, 110] },
  {
    legend: "Trend",
    color: "#2ca02c",
    variant: "line",
    values: [100, 140, 120, 155],
  },
];

const stackedSeries: CategoricalSeriesItem[] = [
  { legend: "Q1", color: "#1f77b4", values: [40, 60, 50, 70] },
  { legend: "Q2", color: "#ff7f0e", values: [35, 45, 40, 55] },
  { legend: "Q3", color: "#2ca02c", values: [50, 55, 45, 60] },
  { legend: "Q4", color: "#b13f84", values: [60, 65, 55, 65] },
];

const stackedWithLine: CategoricalSeriesItem[] = [
  { legend: "Revenue", color: "#1f77b4", values: [80, 120, 100, 140] },
  { legend: "Expenses", color: "#ff7f0e", values: [50, 70, 60, 80] },
  {
    legend: "Target",
    color: "#d62728",
    variant: "line",
    values: [100, 150, 130, 180],
  },
];

const stackedDivergingSeries: CategoricalSeriesItem[] = [
  { legend: "Income", color: "#2ca02c", values: [50, 80, 60, 90] },
  { legend: "Savings", color: "#1f77b4", values: [20, 30, 25, 35] },
  { legend: "Expenses", color: "#d62728", values: [-40, -60, -45, -70] },
  { legend: "Taxes", color: "#ff7f0e", values: [-15, -25, -20, -30] },
];

const stackedDivergingAreas: TimeSeriesItem[] = [
  {
    legend: "Revenue",
    color: "#2ca02c",
    variant: "area",
    data: [30, 45, 35, 50, 55, 48, 60],
  },
  {
    legend: "Other Income",
    color: "#1f77b4",
    variant: "area",
    data: [10, 15, 12, 18, 20, 16, 22],
  },
  {
    legend: "Costs",
    color: "#d62728",
    variant: "area",
    data: [-20, -30, -25, -35, -40, -32, -45],
  },
  {
    legend: "Depreciation",
    color: "#ff7f0e",
    variant: "area",
    data: [-5, -8, -6, -10, -12, -9, -14],
  },
];

// --- Playground ---

export function ChartPg() {
  const [ss, setSs] = useState("");

  useEffect(() => {
    setTimeout(() => {
      setSs(
        renderAsString(
          <CombinedChart
            title="Sample Time Series Chart"
            items={testTimeSeries}
            time={testTime}
            legendCols={[120, 120]}
          />,
        ),
      );
    }, 10);
  }, []);

  return (
    <div>
      <h2>CombinedChart</h2>
      <CombinedChart
        title="Sample Time Series Chart"
        items={testTimeSeries}
        time={testTime}
        legendCols={[120, 120]}
      />
      <h2>CombinedChart STRING</h2>
      <div
        dangerouslySetInnerHTML={{
          __html: ss,
        }}
      />

      <h2>Time Series Charts</h2>
      <TimeSeriesChart
        title="Sample Time Series Chart"
        timeSeries={testTimeSeries}
        time={testTime}
        timeFormat={formatDate}
        legendWidth={[120, 120]}
        showAxis={true}
      />

      <h2>Categorical Charts</h2>
      <CategoricalChart
        title="Sample Categorical"
        labels={[...categoricalLabels, "Class E", "Class F"]}
        series={categoricalSeries}
        legendWidth={[80, 80]}
      />

      <h3>Categorical with negative values</h3>
      <CategoricalChart
        title="Changes by Class"
        labels={categoricalLabels}
        series={categoricalMixedSeries}
        legendWidth={[80, 80]}
      />

      <h3>Bars with line overlay</h3>
      <CategoricalChart
        title="Sales vs Costs with Trend"
        labels={categoricalLabels}
        series={categoricalWithLine}
        legendWidth={[80, 80, 80]}
      />

      <h3>Stacked bars</h3>
      <CategoricalChart
        title="Quarterly Revenue by Class"
        labels={categoricalLabels}
        series={stackedSeries}
        stackedBars={true}
        legendWidth={[60, 60]}
      />

      <h3>Stacked bars with line overlay</h3>
      <CategoricalChart
        title="Revenue vs Target"
        labels={categoricalLabels}
        series={stackedWithLine}
        stackedBars={true}
        legendWidth={[80, 80]}
      />

      <h3>Diverging stacked bars (positive/negative)</h3>
      <CategoricalChart
        title="Cash Flow Analysis"
        labels={categoricalLabels}
        series={stackedDivergingSeries}
        stackedBars={true}
        legendWidth={[80, 80]}
      />

      <h3>Legend before chart</h3>
      <TimeSeriesChart
        title="Legend First"
        timeSeries={testTimeSeries}
        time={testTime}
        timeFormat={formatDate}
        legendWidth={[100, 100, 100]}
        showAxis={true}
        layoutRows={["title", "legend", "chart"]}
      />

      <h3>Chart only (no legend)</h3>
      <TimeSeriesChart
        timeSeries={testTimeSeries}
        time={testTime}
        timeFormat={formatDate}
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

      <h3>Stacked areas with line overlay</h3>
      <TimeSeriesChart
        title="Revenue vs Target"
        timeSeries={stackedAreaWithLine}
        time={testTime}
        timeFormat={formatDate}
        legendWidth={[100, 100, 100]}
        showAxis={true}
        stackedAreas={true}
      />

      <h3>Diverging stacked areas (positive/negative)</h3>
      <TimeSeriesChart
        title="Income vs Expenses"
        timeSeries={stackedDivergingAreas}
        time={testTime}
        timeFormat={formatDate}
        legendWidth={[100, 100, 100, 100]}
        showAxis={true}
        stackedAreas={true}
      />
    </div>
  );
}
