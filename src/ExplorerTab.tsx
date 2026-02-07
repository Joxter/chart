import { useState, useEffect, useMemo } from "react";
import * as d3 from "d3";
import { DateTime } from "luxon";
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

const LS_KEY = "explorerTab";

type SavedState = {
  file: string;
  selected: string[];
  variant: Variant;
  heatmapMode: "day" | "week";
};

function loadState(): Partial<SavedState> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveState(s: SavedState) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

export function ExplorerTab() {
  const saved = useMemo(() => loadState(), []);
  const [file, setFile] = useState(saved.file ?? DATA_FILES[0]);
  const [data, setData] = useState<ColumnarData | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [variant, setVariant] = useState<Variant>(saved.variant ?? "line");
  const [heatmapMode, setHeatmapMode] = useState<"day" | "week">(
    saved.heatmapMode ?? "day",
  );

  // Persist to localStorage
  useEffect(() => {
    saveState({ file, selected, variant, heatmapMode });
  }, [file, selected, variant, heatmapMode]);

  // Load file
  useEffect(() => {
    setData(null);
    setSelected([]);
    fetch(`/${file}`)
      .then((r) => r.json())
      .then((d: ColumnarData) => {
        setData(d);
        // Restore saved columns if they exist in the new file, otherwise auto-select
        const cols = numericColumns(d);
        const restored =
          saved.file === file && saved.selected
            ? saved.selected.filter((c) => cols.includes(c))
            : [];
        setSelected(restored.length > 0 ? restored : cols.slice(0, 3));
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
      selected.map((col, i) => {
        const vals = data![col] as number[];
        return {
          legend: col + statsLabel(vals),
          color: COLORS[i % COLORS.length],
          variant,
          data: vals,
        };
      }),
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
          const hasNeg = values.some((v) => v < 0);
          const range: [string, string] | [string, string, string] = hasNeg
            ? ["#1e88e5", "#ffffff", color]
            : ["#ffffff", color];
          const hmTitle = col + statsLabel(values);

          if (heatmapMode === "week") {
            const wk = reshapeForWeeklyHeatmap(values, time);
            if (!wk) return null;
            return (
              <div key={col} className="chart-section">
                <HeatMapChart
                  title={hmTitle}
                  data={wk.data}
                  xLabels={wk.xLabels}
                  yLabels={wk.yLabels}
                  colorRange={range}
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
                title={hmTitle}
                data={hm.data}
                days={hm.days}
                colorRange={range}
                cellWidth={hm.cellWidth}
                cellHeight={hm.cellHeight}
              />
            </div>
          );
        })}
    </div>
  );
}

const fmt = d3.format(",.1f");

function statsLabel(values: number[]): string {
  const valid = values.filter((v) => v != null && !isNaN(v));
  if (valid.length === 0) return "";
  const sum = valid.reduce((a, b) => a + b, 0);
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const avg = sum / valid.length;
  return `  tot ${fmt(sum)}  min ${fmt(min)}  max ${fmt(max)}  avg ${fmt(avg)}`;
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

/**
 * Binary-search for the first index where time[i] >= target.
 * Data must be sorted ascending.
 */
function lowerBound(time: Date[], target: number): number {
  let lo = 0,
    hi = time.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (time[mid].getTime() < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Split sorted timestamps into calendar-day slices using luxon.
 * Each slice is { start, end } indices into the original arrays.
 * DST-safe: uses luxon's startOf("day") which respects local tz.
 */
function sliceByDay(
  time: Date[],
): { dayStart: DateTime; from: number; to: number }[] {
  if (time.length === 0) return [];
  const first = DateTime.fromJSDate(time[0]).startOf("day");
  const last = DateTime.fromJSDate(time[time.length - 1]).startOf("day");
  const slices: { dayStart: DateTime; from: number; to: number }[] = [];

  let cursor = first;
  while (cursor <= last) {
    const next = cursor.plus({ days: 1 });
    const from = lowerBound(time, cursor.toMillis());
    const to = lowerBound(time, next.toMillis());
    if (from < to) {
      slices.push({ dayStart: cursor, from, to });
    }
    cursor = next;
  }
  return slices;
}

/**
 * Normalize a day-slice to exactly `slotsPerDay` entries.
 * Extra slots (fall-back DST) → truncated.
 * Missing slots (spring-forward DST) → zero-padded.
 */
function normalizeDay(
  values: number[],
  from: number,
  to: number,
  slotsPerDay: number,
): number[] {
  const raw = values.slice(from, to);
  if (raw.length === slotsPerDay) return raw;
  if (raw.length > slotsPerDay) return raw.slice(0, slotsPerDay);
  // pad with zeros
  const padded = new Array(slotsPerDay).fill(0);
  for (let i = 0; i < raw.length; i++) padded[i] = raw[i];
  return padded;
}

/** Reshape into data[day][slot] — X = days, Y = time-of-day. DST-safe. */
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
  if (slotsPerDay < 4 || time.length < slotsPerDay * 2) return null;

  const daySlices = sliceByDay(time);
  if (daySlices.length < 2) return null;

  const days: Date[] = [];
  const data: number[][] = [];

  for (const { dayStart, from, to } of daySlices) {
    days.push(dayStart.toJSDate());
    data.push(normalizeDay(values, from, to, slotsPerDay));
  }

  const cellHeight = slotsPerDay <= 24 ? 4 : slotsPerDay <= 48 ? 2 : 1;
  const cellWidth = days.length > 200 ? 2 : days.length > 60 ? 3 : 5;

  return { data, days, cellWidth, cellHeight };
}

/**
 * Reshape into weekly grid — X = Mon–Sun (with intra-day resolution), Y = week number.
 * DST-safe: each day is normalized to exactly slotsPerDay entries.
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
  if (slotsPerDay < 4 || time.length < slotsPerDay * 2) return null;

  const daySlices = sliceByDay(time);
  if (daySlices.length < 2) return null;

  const firstDow = daySlices[0].dayStart.weekday - 1; // luxon: 1=Mon → 0
  const totalWeeks = Math.ceil((daySlices.length + firstDow) / 7);
  const weekCols = 7 * slotsPerDay;

  // data[weekSlot][weekIndex]
  const data: number[][] = Array.from({ length: weekCols }, () =>
    Array(totalWeeks).fill(NaN),
  );

  for (let d = 0; d < daySlices.length; d++) {
    const { from, to } = daySlices[d];
    const dow = (d + firstDow) % 7;
    const week = Math.floor((d + firstDow) / 7);
    const row = normalizeDay(values, from, to, slotsPerDay);
    const colBase = dow * slotsPerDay;
    for (let s = 0; s < slotsPerDay; s++) {
      data[colBase + s][week] = row[s];
    }
  }

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const xLabels = dayNames.map((label, i) => ({
    col: i * slotsPerDay,
    label,
  }));

  // Y labels: month boundaries mapped to week rows
  const yLabels: { row: number; label: string }[] = [];
  for (let d = 0; d < daySlices.length; d++) {
    const dt = daySlices[d].dayStart;
    if (dt.day === 1) {
      const week = Math.floor((d + firstDow) / 7);
      yLabels.push({ row: week, label: dt.toFormat("MMM") });
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
