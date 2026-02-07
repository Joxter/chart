import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as d3 from "d3";
import { DateTime } from "luxon";
import {
  TimeSeriesChart,
  HeatMapChart,
  type TimeSeriesItem,
  type TimeSeriesClickEvent,
} from "./Chart";

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

type ChartType = "lines" | "area" | "heatmap-day" | "heatmap-week";
type ColumnarData = Record<string, (number | string | null)[]>;

const CHART_TYPE_LABELS: Record<ChartType, string> = {
  lines: "Lines",
  area: "Area",
  "heatmap-day": "HeatMap (day)",
  "heatmap-week": "HeatMap (week)",
};

type ChartConfig = {
  id: number;
  file: string;
  selected: string[];
  chartType: ChartType;
};

const LS_KEY = "explorerTab_v2";
let nextId = 1;

function loadCharts(): ChartConfig[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const charts: ChartConfig[] = JSON.parse(raw);
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
  };
}

// --------------- Config Editor ---------------

function ConfigEditor({
  config,
  onApply,
  onCancel,
  onDelete,
  onChange,
}: {
  config: ChartConfig;
  onApply: (c: ChartConfig) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onChange: (c: ChartConfig) => void;
}) {
  const [draft, setDraft] = useState<ChartConfig>({ ...config });
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const prevFile = useRef(config.file);

  // Push draft changes to parent
  useEffect(() => {
    onChange(draft);
  }, [draft]);

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
          setDraft((prev) => ({ ...prev, selected: cols.slice(0, 3) }));
          prevFile.current = draft.file;
        }
        setLoading(false);
      });
  }, [draft.file]);

  const toggleColumn = (col: string) => {
    setDraft((prev) => ({
      ...prev,
      selected: prev.selected.includes(col)
        ? prev.selected.filter((c) => c !== col)
        : [...prev.selected, col],
    }));
  };

  return (
    <div style={editorStyle}>
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
            value={draft.file}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, file: e.target.value }))
            }
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
                onChange={() =>
                  setDraft((prev) => ({ ...prev, chartType: ct }))
                }
                style={{ marginRight: 4 }}
              />
              {CHART_TYPE_LABELS[ct]}
            </label>
          ))}
        </fieldset>
      </div>

      {/* Column checkboxes */}
      {loading ? (
        <div style={{ fontSize: 13, color: "#999" }}>Loading columns...</div>
      ) : (
        <div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
            Columns ({draft.selected.length}/{columns.length})
          </div>
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

      {/* Buttons */}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          style={btnPrimary}
          onClick={() => onApply(draft)}
          disabled={draft.selected.length === 0}
        >
          Apply
        </button>
        <button style={btnSecondary} onClick={onCancel}>
          Cancel
        </button>
        {onDelete && (
          <button style={btnDanger} onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

// --------------- Chart Card ---------------

function ChartCard({
  config,
  onEdit,
  onDelete,
  editing,
}: {
  config: ChartConfig;
  onEdit: () => void;
  onDelete: () => void;
  editing: boolean;
}) {
  const [data, setData] = useState<ColumnarData | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const variant = config.chartType === "area" ? "area" : "line";
  const isHeatmap =
    config.chartType === "heatmap-day" || config.chartType === "heatmap-week";

  useEffect(() => {
    setData(null);
    setSelectedDay(null);
    fetch(`/${config.file}`)
      .then((r) => r.json())
      .then((d: ColumnarData) => setData(d));
  }, [config.file]);

  const time = useMemo(() => {
    if (!data?.timestamps) return [];
    return (data.timestamps as string[]).map((t) => new Date(t));
  }, [data]);

  const timeFormat = useMemo(() => {
    if (time.length <= 12) return d3.timeFormat("%b %Y");
    return d3.timeFormat("%d %b");
  }, [time]);

  const series: TimeSeriesItem[] = useMemo(() => {
    if (!data) return [];
    return config.selected.map((col, i) => ({
      legend: col,
      color: COLORS[i % COLORS.length],
      variant,
      data: data[col] as number[],
    }));
  }, [config.selected, variant, data]);

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
    const sliceTime = time.slice(from, to);
    const sliceSeries: TimeSeriesItem[] = config.selected.map((col, i) => ({
      legend: col,
      color: COLORS[i % COLORS.length],
      variant,
      data: (data[col] as number[]).slice(from, to),
    }));
    return {
      time: sliceTime,
      series: sliceSeries,
      label: dayStart.toFormat("dd MMM yyyy"),
    };
  }, [selectedDay, data, config.selected, variant, time]);

  if (!data)
    return <div style={{ padding: 16, color: "#999" }}>Loading...</div>;

  return (
    <div
      style={
        editing
          ? { ...cardStyle, borderColor: "#1e88e5", borderWidth: 2 }
          : cardStyle
      }
    >
      {/* Toolbar */}
      {!editing && (
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button style={btnSmall} onClick={onEdit}>
            Edit
          </button>
          <button style={{ ...btnSmall, color: "#c62828" }} onClick={onDelete}>
            Delete
          </button>
        </div>
      )}

      {/* Time series chart (lines / area) */}
      {!isHeatmap && series.length > 0 && time.length > 0 && (
        <>
          <div className="chart-section">
            <TimeSeriesChart
              title={config.file.replace(".json", "")}
              timeSeries={series}
              time={time}
              timeFormat={timeFormat}
              legendWidth={[200]}
              unit=""
              onClick={handleChartClick}
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

// --------------- Main Component ---------------

export function ExplorerTab() {
  const [charts, setCharts] = useState<ChartConfig[]>(() => loadCharts());
  // id of chart being edited, or "new" for adding
  const [editing, setEditing] = useState<number | "new" | null>(null);
  // live draft config while editing (for real-time chart preview)
  const [draft, setDraft] = useState<ChartConfig | null>(null);
  const newConfigRef = useRef<ChartConfig | null>(null);

  useEffect(() => {
    saveCharts(charts);
  }, [charts]);

  const handleAdd = () => {
    newConfigRef.current = newConfig();
    setDraft(newConfigRef.current);
    setEditing("new");
  };

  const handleApplyNew = (config: ChartConfig) => {
    setCharts((prev) => [...prev, config]);
    setEditing(null);
    setDraft(null);
    newConfigRef.current = null;
  };

  const handleCancelNew = () => {
    setEditing(null);
    setDraft(null);
    newConfigRef.current = null;
  };

  const handleApplyEdit = (config: ChartConfig) => {
    setCharts((prev) => prev.map((c) => (c.id === config.id ? config : c)));
    setEditing(null);
    setDraft(null);
  };

  const handleCancelEdit = () => {
    setEditing(null);
    setDraft(null);
  };

  const handleDelete = (id: number) => {
    setCharts((prev) => prev.filter((c) => c.id !== id));
    if (editing === id) {
      setEditing(null);
      setDraft(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          style={btnPrimary}
          onClick={handleAdd}
          disabled={editing === "new"}
        >
          + Add chart
        </button>
      </div>

      {/* New chart editor + live preview */}
      {editing === "new" && newConfigRef.current && (
        <div>
          <ConfigEditor
            config={newConfigRef.current}
            onApply={handleApplyNew}
            onCancel={handleCancelNew}
            onChange={setDraft}
          />
          {draft && draft.selected.length > 0 && (
            <ChartCard
              config={draft}
              onEdit={() => {}}
              onDelete={handleCancelNew}
              editing={true}
            />
          )}
        </div>
      )}

      {/* Chart list */}
      {charts.map((config) => {
        const isEditing = editing === config.id;
        const displayConfig = isEditing && draft ? draft : config;
        return (
          <div key={config.id}>
            {isEditing && (
              <ConfigEditor
                config={config}
                onApply={handleApplyEdit}
                onCancel={() => handleCancelEdit()}
                onDelete={() => handleDelete(config.id)}
                onChange={setDraft}
              />
            )}
            <ChartCard
              config={displayConfig}
              onEdit={() => setEditing(config.id)}
              onDelete={() => handleDelete(config.id)}
              editing={isEditing}
            />
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
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 16,
  border: "2px solid #1e88e5",
  borderRadius: 8,
  background: "#f5f9ff",
};

const cardStyle: React.CSSProperties = {
  padding: 16,
  border: "1px solid #ddd",
  borderRadius: 8,
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

const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: "#e0e0e0",
  color: "#333",
};

const btnDanger: React.CSSProperties = {
  ...btnBase,
  background: "#ffebee",
  color: "#c62828",
};

const btnSmall: React.CSSProperties = {
  padding: "3px 10px",
  borderRadius: 4,
  border: "1px solid #ccc",
  background: "#fff",
  cursor: "pointer",
  fontSize: 12,
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
    if (dt.day === 1) {
      const week = Math.floor((d + firstDow) / 7);
      yLabels.push({ row: week, label: dt.toFormat("MMM") });
    }
  }
  const cellWidth = 1;
  const cellHeight = totalWeeks > 30 ? 2 : 3;
  return { data, xLabels, yLabels, cellWidth, cellHeight };
}
