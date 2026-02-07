import { useState, useEffect, useMemo } from "react";
import * as d3 from "d3";
import { TimeSeriesChart, HeatMapChart, type TimeSeriesItem } from "./Chart";

const DATA_FILES = [
  "calc_15min_consumption_2024.json",
  "calc_15min_battery_2024.json",
  "calc_15min_pv_2025.json",
  "calc_15min_generator_2025.json",
  "calc_15min_partial_2025.json",
  "calc_daily_consumption_2024.json",
  "calc_daily_simple_2024.json",
  "calc_daily_pv_2024.json",
  "calc_monthly_2024.json",
  "profiles_15min_consumption_2024.json",
  "profiles_15min_pv_2025.json",
  "profiles_15min_partial_2025.json",
  "profiles_15min_extra_2025.json",
  "profiles_15min_full_2024.json",
];

const COLORS = [
  "#e53935",
  "#1e88e5",
  "#43a047",
  "#f9a825",
  "#8e24aa",
  "#00acc1",
  "#ff7043",
  "#5c6bc0",
  "#d81b60",
  "#2ca02c",
  "#17becf",
  "#ff7f0e",
  "#9467bd",
  "#bcbd22",
  "#7f7f7f",
];

type Variant = "line" | "area" | "bars";

type ColumnarData = Record<string, (number | string | null)[]>;

export function ExplorerTab() {
  const [file, setFile] = useState(DATA_FILES[0]);
  const [data, setData] = useState<ColumnarData | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [variant, setVariant] = useState<Variant>("line");
  const [heatmapMode, setHeatmapMode] = useState<"day" | "week">("day");

  // Load file
  useEffect(() => {
    setData(null);
    setSelected([]);
    fetch(`/${file}`)
      .then((r) => r.json())
      .then((d: ColumnarData) => {
        setData(d);
        // Auto-select first 3 numeric columns
        const cols = numericColumns(d);
        setSelected(cols.slice(0, 3));
      });
  }, [file]);

  const columns = useMemo(() => (data ? numericColumns(data) : []), [data]);

  const time = useMemo(() => {
    if (!data?.timestamps) return [];
    return (data.timestamps as string[]).map((t) => new Date(t));
  }, [data]);

  const timeFormat = useMemo(() => {
    if (time.length <= 12) return d3.timeFormat("%b %Y");
    if (time.length <= 400) return d3.timeFormat("%d %b");
    return d3.timeFormat("%d %b");
  }, [time]);

  const series: TimeSeriesItem[] = useMemo(
    () =>
      selected.map((col, i) => ({
        legend: col,
        color: COLORS[i % COLORS.length],
        variant,
        data: data![col] as number[],
      })),
    [selected, variant, data],
  );

  const toggleColumn = (col: string) => {
    setSelected((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col],
    );
  };

  if (!data) return <div style={{ padding: 16 }}>Loading...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Controls */}
      <div
        style={{
          display: "flex",
          gap: 24,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        {/* File select */}
        <label style={labelStyle}>
          File
          <select
            value={file}
            onChange={(e) => setFile(e.target.value)}
            style={selectStyle}
          >
            {DATA_FILES.map((f) => (
              <option key={f} value={f}>
                {f.replace(".json", "")}
              </option>
            ))}
          </select>
        </label>

        {/* Chart type */}
        <fieldset style={{ border: "none", padding: 0 }}>
          <legend style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
            Chart type
          </legend>
          {(["line", "area", "bars"] as Variant[]).map((v) => (
            <label
              key={v}
              style={{ marginRight: 12, fontSize: 13, cursor: "pointer" }}
            >
              <input
                type="radio"
                name="variant"
                value={v}
                checked={variant === v}
                onChange={() => setVariant(v)}
                style={{ marginRight: 4 }}
              />
              {v}
            </label>
          ))}
        </fieldset>

        {/* Heatmap mode */}
        <fieldset style={{ border: "none", padding: 0 }}>
          <legend style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
            Heatmap
          </legend>
          {(["day", "week"] as const).map((m) => (
            <label
              key={m}
              style={{ marginRight: 12, fontSize: 13, cursor: "pointer" }}
            >
              <input
                type="radio"
                name="heatmapMode"
                value={m}
                checked={heatmapMode === m}
                onChange={() => setHeatmapMode(m)}
                style={{ marginRight: 4 }}
              />
              {m}
            </label>
          ))}
        </fieldset>
      </div>

      {/* Column checkboxes */}
      <div>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
          Columns ({selected.length}/{columns.length})
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
          {columns.map((col, i) => (
            <label
              key={col}
              style={{ fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              <input
                type="checkbox"
                checked={selected.includes(col)}
                onChange={() => toggleColumn(col)}
                style={{ marginRight: 4 }}
              />
              <span
                style={{
                  color: selected.includes(col)
                    ? COLORS[selected.indexOf(col) % COLORS.length]
                    : "#666",
                }}
              >
                {col}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Chart */}
      {selected.length > 0 && time.length > 0 && (
        <div className="chart-section">
          <TimeSeriesChart
            title={file.replace(".json", "")}
            timeSeries={series}
            time={time}
            timeFormat={timeFormat}
            legendWidth={[200]}
            unit=""
          />
        </div>
      )}

      {/* Heatmaps */}
      {selected.length > 0 &&
        time.length > 0 &&
        selected.map((col, i) => {
          const values = data![col] as number[];
          const color = COLORS[i % COLORS.length];

          if (heatmapMode === "week") {
            const wk = reshapeForWeeklyHeatmap(values, time);
            if (!wk) return null;
            return (
              <div key={col} className="chart-section">
                <HeatMapChart
                  title={col}
                  data={wk.data}
                  xLabels={wk.xLabels}
                  yLabels={wk.yLabels}
                  colorRange={["#ffffff", color]}
                  cellWidth={wk.cellWidth}
                  cellHeight={wk.cellHeight}
                />
              </div>
            );
          }

          const hm = reshapeForDayHeatmap(values, time);
          if (!hm) return null;
          return (
            <div key={col} className="chart-section">
              <HeatMapChart
                title={col}
                data={hm.data}
                days={hm.days}
                colorRange={["#ffffff", color]}
                cellWidth={hm.cellWidth}
                cellHeight={hm.cellHeight}
              />
            </div>
          );
        })}
    </div>
  );
}

function numericColumns(data: ColumnarData): string[] {
  return Object.keys(data).filter(
    (k) =>
      k !== "timestamps" &&
      Array.isArray(data[k]) &&
      typeof data[k][0] === "number",
  );
}

/** Detect the interval in minutes between consecutive timestamps */
function detectIntervalMinutes(time: Date[]): number {
  if (time.length < 2) return 0;
  const diffs: number[] = [];
  for (let i = 1; i < Math.min(time.length, 10); i++) {
    diffs.push((time[i].getTime() - time[i - 1].getTime()) / 60000);
  }
  return Math.round(d3.median(diffs)!);
}

/** Reshape into data[day][slot] — X = days, Y = time-of-day */
function reshapeForDayHeatmap(
  values: number[],
  time: Date[],
): {
  data: number[][];
  days: Date[];
  cellWidth: number;
  cellHeight: number;
} | null {
  const interval = detectIntervalMinutes(time);
  if (interval <= 0) return null;

  const slotsPerDay = Math.round((24 * 60) / interval);
  if (slotsPerDay < 4 || values.length < slotsPerDay * 2) return null;

  const numDays = Math.floor(values.length / slotsPerDay);
  const startDate = time[0];
  const days: Date[] = [];
  const data: number[][] = [];

  for (let d = 0; d < numDays; d++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    days.push(date);
    data.push(values.slice(d * slotsPerDay, (d + 1) * slotsPerDay));
  }

  const cellHeight = slotsPerDay <= 24 ? 4 : slotsPerDay <= 48 ? 2 : 1;
  const cellWidth = numDays > 200 ? 2 : numDays > 60 ? 3 : 5;

  return { data, days, cellWidth, cellHeight };
}

/**
 * Reshape into weekly grid — X = Mon–Sun (with intra-day resolution), Y = week number.
 * data[weekSlot][weekIndex] where weekSlot = dow * slotsPerDay + slotInDay.
 */
function reshapeForWeeklyHeatmap(
  values: number[],
  time: Date[],
): {
  data: number[][];
  xLabels: { col: number; label: string }[];
  yLabels: { row: number; label: string }[];
  cellWidth: number;
  cellHeight: number;
} | null {
  const interval = detectIntervalMinutes(time);
  if (interval <= 0) return null;

  const slotsPerDay = Math.round((24 * 60) / interval);
  if (slotsPerDay < 4 || values.length < slotsPerDay * 2) return null;

  const totalDays = Math.floor(values.length / slotsPerDay);
  const startDate = time[0];
  const startDow = (startDate.getDay() + 6) % 7; // Mon=0
  const totalWeeks = Math.ceil((totalDays + startDow) / 7);
  const weekCols = 7 * slotsPerDay;

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
      data[colBase + s][week] = values[srcBase + s] ?? NaN;
    }
  }

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const xLabels = dayNames.map((label, i) => ({
    col: i * slotsPerDay,
    label,
  }));

  // Y labels: month boundaries mapped to week rows
  const yLabels: { row: number; label: string }[] = [];
  const fmt = d3.timeFormat("%b");
  for (let m = 0; m < 24; m++) {
    const year = startDate.getFullYear() + Math.floor(m / 12);
    const month = m % 12;
    const mDate = new Date(year, month, 1);
    const diffDays = Math.round(
      (mDate.getTime() - startDate.getTime()) / 86400000,
    );
    if (diffDays >= 0 && diffDays < totalDays) {
      const week = Math.floor((diffDays + startDow) / 7);
      yLabels.push({ row: week, label: fmt(mDate) });
    }
  }

  const cellWidth = 1;
  const cellHeight = totalWeeks > 30 ? 2 : 3;

  return { data, xLabels, yLabels, cellWidth, cellHeight };
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  fontSize: 12,
  color: "#666",
  gap: 4,
};

const selectStyle: React.CSSProperties = {
  fontSize: 14,
  padding: "4px 8px",
  borderRadius: 4,
  border: "1px solid #ccc",
};
