import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as d3 from "d3";
import { DateTime } from "luxon";
import {
  TimeSeriesChart,
  HeatMapChart,
  RangeChart,
  type RangeChartProps,
  type TimeSeriesItem,
  type TimeSeriesClickEvent,
  type HighlightPeriod,
} from "./Chart";
import {
  type Strategy,
  STRATEGY_LABELS,
  usesTargetPoints,
  downsampleIndices,
} from "./downsample";

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

type ChartType = "lines" | "area" | "range" | "heatmap-day" | "heatmap-week";
type ColumnarData = Record<string, number[]>;

const CHART_TYPE_LABELS: Record<ChartType, string> = {
  lines: "Lines",
  area: "Area",
  range: "Range",
  "heatmap-day": "HeatMap (day)",
  "heatmap-week": "HeatMap (week)",
};

type MidMarker = NonNullable<RangeChartProps["midMarker"]>;

const MID_MARKER_LABELS: Record<MidMarker, string> = {
  none: "None",
  "mean-line": "Mean (line)",
  "mean-circle": "Mean (dot)",
  "median-line": "Median (line)",
  "median-circle": "Median (dot)",
};

type ChartConfig = {
  id: number;
  file: string;
  selected: string[];
  chartType: ChartType;
  downsample: Strategy;
  targetPoints: number;
  midMarker: MidMarker;
};

const LS_KEY = "explorerTab_v2";
let nextId = 1;

function loadCharts(): ChartConfig[] {
  // return [];

  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const charts: ChartConfig[] = JSON.parse(raw).map(migrateConfig);
    for (const c of charts) {
      if (c.id >= nextId) nextId = c.id + 1;
    }
    return charts;
  } catch {
    return [];
  }
}

function saveCharts(charts: ChartConfig[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(charts));
}

function newConfig(): ChartConfig {
  return {
    id: nextId++,
    file: DATA_FILES[0],
    selected: [],
    chartType: "lines",
    downsample: "none",
    targetPoints: 5000,
    midMarker: "none",
  };
}

function migrateConfig(c: ChartConfig): ChartConfig {
  return {
    ...c,
    downsample: "none",
    targetPoints: 5000,
    midMarker: c.midMarker ?? "none",
  };
}

// --------------- Config Editor ---------------

function ConfigEditor({
  config: draft,
  onChange: setDraft,
}: {
  config: ChartConfig;
  onChange: (c: ChartConfig) => void;
}) {
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const prevFile = useRef(draft.file);

  // Load columns when file changes
  useEffect(() => {
    setLoading(true);
    fetch(`/${draft.file}`)
      .then((r) => r.json())
      .then((d: ColumnarData) => {
        const cols = numericColumns(d);
        setColumns(cols);
        // If file changed, auto-select first 3; otherwise keep selection
        if (draft.file !== prevFile.current) {
          setDraft({ ...draft, selected: cols.slice(0, 2) });
          prevFile.current = draft.file;
        }
        setLoading(false);
      });
  }, [draft.file]);

  const toggleColumn = (col: string) => {
    setDraft({
      ...draft,
      selected: draft.selected.includes(col)
        ? draft.selected.filter((c) => c !== col)
        : [...draft.selected, col],
    });
  };

  return (
    <>
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
          <select
            value={draft.file}
            onChange={(e) => {
              setDraft({ ...draft, file: e.target.value });
            }}
            style={selectStyle}
          >
            {DATA_FILES.map((f) => (
              <option key={f} value={f}>
                {f.replace(".json", "")}
              </option>
            ))}
          </select>
        </label>

        {/* Downsample */}
        <fieldset style={{ border: "none", padding: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select
              value={draft.downsample}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  downsample: e.target.value as Strategy,
                })
              }
              style={selectStyle}
            >
              {(Object.keys(STRATEGY_LABELS) as Strategy[]).map((s) => (
                <option key={s} value={s}>
                  {STRATEGY_LABELS[s]}
                </option>
              ))}
            </select>
            {usesTargetPoints(draft.downsample) && (
              <select
                value={draft.targetPoints}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    targetPoints: +e.target.value,
                  })
                }
                style={{ ...selectStyle, width: "100px" }}
              >
                {Array(20)
                  .fill(0)
                  .map((_, s) => {
                    return (
                      <option key={s} value={(s + 1) * 1000}>
                        {(s + 1) * 1000}
                      </option>
                    );
                  })}
              </select>
            )}
          </div>
        </fieldset>
      </div>
      <fieldset style={{ border: "none", padding: 0 }}>
        {(Object.keys(CHART_TYPE_LABELS) as ChartType[]).map((ct) => (
          <label
            key={ct}
            style={{ marginRight: 12, fontSize: 13, cursor: "pointer" }}
          >
            <input
              type="radio"
              name={`chartType-${draft.id}`}
              value={ct}
              checked={draft.chartType === ct}
              onChange={() => {
                setDraft({ ...draft, chartType: ct });
              }}
              style={{ marginRight: 4 }}
            />
            {CHART_TYPE_LABELS[ct]}
          </label>
        ))}
      </fieldset>
      {draft.chartType === "range" && (
        <fieldset style={{ border: "none", padding: 0 }}>
          <label style={{ fontSize: 13, color: "#666", marginRight: 8 }}>
            Mid marker:
          </label>
          <select
            value={draft.midMarker}
            onChange={(e) =>
              setDraft({ ...draft, midMarker: e.target.value as MidMarker })
            }
            style={selectStyle}
          >
            {(Object.keys(MID_MARKER_LABELS) as MidMarker[]).map((m) => (
              <option key={m} value={m}>
                {MID_MARKER_LABELS[m]}
              </option>
            ))}
          </select>
        </fieldset>
      )}
      {/* Column checkboxes */}
      {loading ? (
        <div style={{ fontSize: 13, color: "#999" }}>Loading columns...</div>
      ) : (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
            {columns.map((col) => (
              <label
                key={col}
                style={{
                  fontSize: 13,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                <input
                  type="checkbox"
                  checked={draft.selected.includes(col)}
                  onChange={() => toggleColumn(col)}
                  style={{ marginRight: 4 }}
                />
                <span
                  style={{
                    color: draft.selected.includes(col)
                      ? COLORS[draft.selected.indexOf(col) % COLORS.length]
                      : "#666",
                  }}
                >
                  {col}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// --------------- Chart Card ---------------

function ChartCard({ config }: { config: ChartConfig }) {
  const [data, setData] = useState<ColumnarData | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const variant = config.chartType === "area" ? "area" : "line";
  const isHeatmap =
    config.chartType === "heatmap-day" || config.chartType === "heatmap-week";
  const isRange = config.chartType === "range";

  useEffect(() => {
    setData(null);
    setSelectedDay(null);
    fetch(`/${config.file}`)
      .then((r) => r.json())
      .then((d: ColumnarData) => setData(d));
  }, [config.file]);

  const time = useMemo(() => {
    if (!data?.timestamps) return [];
    return (data.timestamps as any as string[]).map((t) => new Date(t));
  }, [data]);

  const timeFormat = useMemo(() => {
    if (time.length <= 12) return d3.timeFormat("%b %Y");
    return d3.timeFormat("%d %b");
  }, [time]);

  const dsIndices = useMemo(() => {
    if (
      !data ||
      isHeatmap ||
      isRange ||
      config.selected.length === 0 ||
      time.length === 0
    )
      return [];
    const refCol = data[config.selected[0]] as number[];
    const res = downsampleIndices(
      time,
      refCol,
      config.downsample,
      config.targetPoints,
    );
    return res;
  }, [data, time, config, isHeatmap, isRange]);

  const dsTime = useMemo(() => {
    if (!dsIndices) return time;
    return dsIndices.map((i) => time[i]);
  }, [dsIndices, time]);

  const series: TimeSeriesItem[] = useMemo(() => {
    if (!data) return [];
    return config.selected.map((col, i) => {
      const raw = data[col] as number[];
      const values = dsIndices ? dsIndices.map((j) => raw[j]) : raw;
      return {
        legend: col,
        color: COLORS[i % COLORS.length],
        variant,
        data: values,
      };
    });
  }, [config.selected, variant, data, dsIndices]);

  const handleChartClick = useCallback((e: TimeSeriesClickEvent) => {
    setSelectedDay(e.time);
  }, []);

  const days = useMemo(() => {
    if (time.length === 0) return [];
    return sliceByDay(time).map((s) => s.dayStart);
  }, [time]);

  const selectedDayIdx = useMemo(() => {
    if (!selectedDay || days.length === 0) return -1;
    const target = DateTime.fromJSDate(selectedDay).startOf("day").toMillis();
    return days.findIndex((d) => d.toMillis() === target);
  }, [selectedDay, days]);

  const goDay = useCallback(
    (delta: number) => {
      const next = selectedDayIdx + delta;
      if (next >= 0 && next < days.length) {
        setSelectedDay(days[next].toJSDate());
      }
    },
    [selectedDayIdx, days],
  );

  const daySlice = useMemo(() => {
    if (
      !selectedDay ||
      !data ||
      config.selected.length === 0 ||
      time.length === 0
    )
      return null;

    const dayStart = DateTime.fromJSDate(selectedDay).startOf("day");
    const dayEnd = dayStart.plus({ days: 1 });

    const from = lowerBound(time, dayStart.toMillis());
    const to = lowerBound(time, dayEnd.toMillis());
    if (from >= to) return null;
    const sdDayTimes = dsIndices.filter((ind) => ind >= from && ind <= to);

    const sliceSeries: TimeSeriesItem[] = config.selected.map((col, i) => ({
      legend: col,
      color: COLORS[i % COLORS.length],
      variant,
      data: sdDayTimes.map((ind) => data[col][ind]),
    }));

    return {
      time: sdDayTimes.map((ind) => time[ind]),
      series: sliceSeries,
      label: dayStart.toFormat("dd MMM yyyy"),
    };
  }, [selectedDay, data, config, variant, time]);

  const highlights = useMemo<HighlightPeriod[] | undefined>(() => {
    if (!selectedDay) return undefined;

    const dayStart = DateTime.fromJSDate(selectedDay).startOf("day");
    const dayEnd = dayStart.plus({ days: 1 });

    return [{ from: dayStart.toJSDate(), to: dayEnd.toJSDate() }];
  }, [selectedDay]);

  if (!data)
    return <div style={{ padding: 16, color: "#999" }}>Loading...</div>;

  return (
    <div>
      {/* Time series chart (lines / area) */}
      {!isHeatmap && !isRange && series.length > 0 && dsTime.length > 0 && (
        <>
          <div className="chart-section">
            <p style={{ fontSize: "12px" }}>
              {`${config.file.replace(".json", "")}${dsIndices ? ` (${dsIndices.length}/${time.length} pts)` : ""}`}
            </p>
            <TimeSeriesChart
              timeSeries={series}
              time={dsTime}
              timeFormat={timeFormat}
              legendWidth={[200]}
              unit=""
              onClick={handleChartClick}
              highlights={highlights}
            />
          </div>
          {daySlice && (
            <div className="chart-section">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <button
                  style={btnArrow}
                  disabled={selectedDayIdx <= 0}
                  onClick={() => goDay(-1)}
                >
                  &#9664;
                </button>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    minWidth: 100,
                    textAlign: "center",
                  }}
                >
                  {daySlice.label}
                </span>
                <button
                  style={btnArrow}
                  disabled={selectedDayIdx >= days.length - 1}
                  onClick={() => goDay(1)}
                >
                  &#9654;
                </button>
              </div>
              <TimeSeriesChart
                timeSeries={daySlice.series}
                time={daySlice.time}
                timeFormat={d3.timeFormat("%H:%M")}
                legendWidth={[200]}
                unit=""
              />
            </div>
          )}
        </>
      )}

      {/* Range chart (one per selected column) */}
      {isRange &&
        time.length > 0 &&
        config.selected.map((col, i) => {
          if (!data) return null;
          const values = data[col] as number[];
          return (
            <div key={col} className="chart-section">
              <RangeChart
                title={col}
                series={{
                  legend: col,
                  color: COLORS[i % COLORS.length],
                  data: values,
                }}
                time={time}
                timeFormat={timeFormat}
                legendWidth={[200]}
                // midMarker="median-line"
                // midMarker="mean-line"
                // midMarker="mean-circle"
                midMarker="median-circle"
                lineWidth={1}
                gap={2}
              />
            </div>
          );
        })}

      {/* Heatmaps */}
      {isHeatmap &&
        series.length > 0 &&
        time.length > 0 &&
        config.selected.map((col, i) => {
          const values = data[col] as number[];
          const color = COLORS[i % COLORS.length];
          const hasNeg = values.some((v) => v < 0);
          const range: [string, string] | [string, string, string] = hasNeg
            ? ["#1e88e5", "#ffffff", color]
            : ["#ffffff", color];

          if (config.chartType === "heatmap-week") {
            const wk = reshapeForWeeklyHeatmap(values, time);
            if (!wk) return null;
            return (
              <div key={col} className="chart-section">
                <HeatMapChart
                  title={col}
                  data={wk.data}
                  xLabels={wk.xLabels}
                  yLabels={wk.yLabels}
                  colorRange={range}
                  cellWidth={wk.cellWidth} // 1
                  cellHeight={wk.cellHeight} // 2
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
                colorRange={range}
                cellWidth={hm.cellWidth} // 2
                cellHeight={hm.cellHeight} // 1
              />
            </div>
          );
        })}
    </div>
  );
}

// --------------- Main Component ---------------

export function ExplorerTab() {
  const [charts, setCharts] = useState<ChartConfig[]>(() => loadCharts());
  const [editing, setEditing] = useState<Record<number, boolean>>({});

  useEffect(() => {
    saveCharts(charts);
  }, [charts]);

  const handleAdd = () => {
    const n = newConfig();

    setCharts((prev) => {
      return [...prev, n];
    });
    setEditing({ ...editing, [n.id]: true });
  };

  const handleDelete = (id: number) => {
    setCharts((prev) => prev.filter((c) => c.id !== id));
    setEditing({ ...editing, [id]: false });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button style={btnPrimary} onClick={handleAdd}>
          + Add chart
        </button>
      </div>

      {/* Chart list */}
      {charts.map((config) => {
        const isEditing = editing[config.id] || false;
        return (
          <div style={editorStyle} key={config.id}>
            {isEditing && (
              <ConfigEditor
                config={config}
                onChange={(c) => {
                  setCharts(
                    charts.map((it) => {
                      return it.id === config.id ? c : it;
                    }),
                  );
                }}
              />
            )}
            <ChartCard config={config} />
            <button
              style={{
                ...btnBase,
                position: "absolute",
                top: "8px",
                right: "158px",
              }}
              onClick={() =>
                setEditing({ ...editing, [config.id]: !isEditing })
              }
            >
              {isEditing ? "Save" : "Edit"}
            </button>

            <button
              style={{
                ...btnDanger,
                position: "absolute",
                top: "8px",
                right: "8px",
              }}
              onClick={() => handleDelete(config.id)}
            >
              Delete
            </button>
          </div>
        );
      })}

      {charts.length === 0 && editing === null && (
        <div
          style={{
            color: "#999",
            fontSize: 14,
            padding: 32,
            textAlign: "center",
          }}
        >
          No charts yet. Click "+ Add chart" to get started.
        </div>
      )}
    </div>
  );
}

// --------------- Styles ---------------

const editorStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 16,
  background: "#fff",
};

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

const btnBase: React.CSSProperties = {
  padding: "6px 16px",
  borderRadius: 4,
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: "#1e88e5",
  color: "#fff",
};

const btnDanger: React.CSSProperties = {
  ...btnBase,
  background: "#ffebee",
  color: "#c62828",
};

const btnArrow: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: 4,
  border: "1px solid #ccc",
  background: "#fff",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
};

// --------------- Utility functions ---------------

function numericColumns(data: ColumnarData): string[] {
  return Object.keys(data).filter(
    (k) =>
      k !== "timestamps" &&
      Array.isArray(data[k]) &&
      typeof data[k][0] === "number",
  );
}

function detectIntervalMinutes(time: Date[]): number {
  if (time.length < 2) return 0;
  const diffs: number[] = [];
  for (let i = 1; i < Math.min(time.length, 10); i++) {
    diffs.push((time[i].getTime() - time[i - 1].getTime()) / 60000);
  }
  return Math.round(d3.median(diffs)!);
}

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
    if (from < to) slices.push({ dayStart: cursor, from, to });
    cursor = next;
  }
  return slices;
}

function normalizeDay(
  values: number[],
  from: number,
  to: number,
  slotsPerDay: number,
): number[] {
  const raw = values.slice(from, to);
  if (raw.length === slotsPerDay) return raw;
  if (raw.length > slotsPerDay) return raw.slice(0, slotsPerDay);
  const padded = new Array(slotsPerDay).fill(0);
  for (let i = 0; i < raw.length; i++) padded[i] = raw[i];
  return padded;
}

function reshapeForDayHeatmap(values: number[], time: Date[]) {
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

function reshapeForWeeklyHeatmap(values: number[], time: Date[]) {
  const interval = detectIntervalMinutes(time);
  if (interval <= 0) return null;

  const slotsPerDay = Math.round((24 * 60) / interval);
  if (slotsPerDay < 4 || time.length < slotsPerDay * 2) return null;
  const daySlices = sliceByDay(time);
  if (daySlices.length < 2) return null;

  const firstDow = daySlices[0].dayStart.weekday - 1;
  const totalWeeks = Math.ceil((daySlices.length + firstDow) / 7);
  const weekCols = 7 * slotsPerDay;
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
  const xLabels = dayNames.map((label, i) => ({ col: i * slotsPerDay, label }));
  const yLabels: { row: number; label: string }[] = [];
  for (let d = 0; d < daySlices.length; d++) {
    const dt = daySlices[d].dayStart;
    if (dt.day === 1 && dt.month % 3 == 1) {
      const week = Math.floor((d + firstDow) / 7);
      yLabels.push({ row: week, label: dt.toFormat("MMM") });
    }
  }
  const cellWidth = 1;
  const cellHeight = totalWeeks > 30 ? 2 : 3;
  return { data, xLabels, yLabels, cellWidth, cellHeight };
}
