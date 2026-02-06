import { useState, useEffect, useMemo } from "react";
import * as d3 from "d3";
import { TimeSeriesChart, type TimeSeriesItem } from "./Chart";

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
