import { useState, useMemo, useCallback, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { splitByPeriod, preprocessData, type AggregationPeriod } from "./utils";
import Heatmap from "./Heatmap";

const COLORS = [
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#ff7c7c",
  "#8dd1e1",
  "#d084d0",
  "#a4de6c",
  "#ffb347",
  "#76d7c4",
  "#f06292",
];

export function App() {
  const [calc_ps, setCalcPs] = useState<Record<string, number[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [aggregation, setAggregation] = useState<AggregationPeriod>("week");
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState<number>(0);
  const [displayMode, setDisplayMode] = useState<"combined" | "separate">(
    "combined",
  );
  const [allInOne, setAllInOne] = useState(false);
  const [heatmapKey, setHeatmapKey] = useState<string>("");

  // Fetch data on mount
  useEffect(() => {
    fetch("/calculationPS_small.json")
      .then((res) => {
        return res.json();
      })
      .then((data) => {
        const processedData = preprocessData(data);
        setCalcPs(processedData);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load data:", err);
        setLoading(false);
      });
  }, []);

  // Filter out 'date' and internal keys from data keys since they're not series data
  const dataKeys = useMemo(
    () =>
      calc_ps
        ? Object.keys(calc_ps).filter(
            (key) => key !== "date" && !key.startsWith("_"),
          )
        : [],
    [calc_ps],
  );
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // Initialize selected keys when data loads
  useEffect(() => {
    if (dataKeys.length > 0 && selectedKeys.size === 0) {
      setSelectedKeys(new Set(dataKeys.slice(0, 2)));
      setHeatmapKey(dataKeys[0] || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKeys]);

  // Split data by periods and get available periods
  const periods = useMemo(() => {
    const startTime = performance.now();

    if (!calc_ps) {
      return [];
    }
    const result = splitByPeriod(calc_ps, aggregation);
    // console.log(result);

    console.log(`periods: ${(performance.now() - startTime).toFixed(2)}ms`);
    return result;
  }, [calc_ps, aggregation]);

  // Reset selected period when aggregation changes or periods change
  useEffect(() => {
    if (selectedPeriodIndex >= periods.length) {
      setSelectedPeriodIndex(0);
    }
  }, [periods.length, selectedPeriodIndex]);

  // Get chart data for selected period
  const chartData = useMemo(() => {
    const startTime = performance.now();
    if (periods.length === 0) {
      return [];
    }

    const currentPeriod = periods[selectedPeriodIndex] || periods[0];
    const selectedKeysArray = Array.from(selectedKeys);

    const processedData = currentPeriod.data;

    const result = [];
    const arrayLength = processedData.date.length;

    for (let i = 0; i < arrayLength; i++) {
      const point: Record<string, number> = { date: processedData.date[i] };
      selectedKeysArray.forEach((key) => {
        point[key] = processedData[key][i];
      });
      result.push(point);
    }

    console.log(`chartData: ${(performance.now() - startTime).toFixed(1)}ms`);
    return result;
  }, [periods, selectedPeriodIndex, selectedKeys]);

  // Get combined data for all periods (for "all in one" mode)
  const allPeriodsChartData = useMemo(() => {
    if (periods.length === 0 || !allInOne || displayMode !== "separate") {
      return null;
    }

    const startTime = performance.now();
    const selectedKeysArray = Array.from(selectedKeys);

    // Find the maximum length across all periods
    let maxLength = 0;
    periods.forEach((period) => {
      maxLength = Math.max(maxLength, period.data.date.length);
    });

    // Create combined data structure with index as x-axis
    const result = [];
    for (let i = 0; i < maxLength; i++) {
      const point: Record<string, number | null> = { index: i };

      // For each period, add data for each key
      periods.forEach((period, periodIndex) => {
        const periodData = period.data;
        selectedKeysArray.forEach((key) => {
          const dataKey = `${key}_p${periodIndex}`;
          point[dataKey] =
            i < periodData.date.length ? periodData[key][i] : null;
        });
      });

      result.push(point);
    }

    console.log(
      `allPeriodsChartData: ${(performance.now() - startTime).toFixed(1)}ms`,
    );
    return result;
  }, [periods, selectedKeys, allInOne, displayMode]);

  // Prepare heatmap data: show whole year with highlighted selected period
  const heatmapData = useMemo(() => {
    if (!calc_ps || !heatmapKey || !calc_ps[heatmapKey]) {
      return { data: [], rows: 0, cols: 0, highlightedCols: [] };
    }

    const startTime = performance.now();
    const data = calc_ps[heatmapKey];

    // Each day has 96 time slices (15-minute intervals)
    const rows = 96;
    const cols = Math.floor(data.length / rows);

    // Take only complete days for the whole year
    const heatmapArray = data.slice(0, rows * cols);

    // Calculate which columns (days) are in the selected period
    const highlightedCols: number[] = [];
    if (periods.length > 0 && aggregation !== "none") {
      const currentPeriod = periods[selectedPeriodIndex] || periods[0];
      const periodDates = currentPeriod.data.date;
      const allDates = calc_ps.date;

      if (periodDates && periodDates.length > 0 && allDates) {
        // Find the start index of the period in the full dataset
        const periodStartDate = periodDates[0];
        const periodEndDate = periodDates[periodDates.length - 1];

        for (let col = 0; col < cols; col++) {
          const dayStartIndex = col * 96;
          if (dayStartIndex < allDates.length) {
            const dayDate = allDates[dayStartIndex];
            if (dayDate >= periodStartDate && dayDate <= periodEndDate) {
              highlightedCols.push(col);
            }
          }
        }
      }
    }

    console.log(
      `heatmapData prepared: ${(performance.now() - startTime).toFixed(1)}ms, length: ${heatmapArray.length}, rows: ${rows}, cols: ${cols}, highlighted: ${highlightedCols.length}`,
    );
    return { data: heatmapArray, rows, cols, highlightedCols };
  }, [calc_ps, heatmapKey, periods, selectedPeriodIndex, aggregation]);

  const toggleKey = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  }, []);

  const formatDate = useCallback(
    (timestamp: number) => {
      const date = new Date(timestamp);

      // For period-based views, show time within the period
      if (aggregation === "day") {
        return date.toLocaleTimeString("en-UK", {
          hour: "2-digit",
          minute: "2-digit",
        });
      }

      return date.toLocaleDateString("en-UK", {
        month: "short",
        day: "numeric",
      });
    },
    [aggregation],
  );

  // Memoize heatmap label functions to prevent unnecessary re-renders
  const heatmapXAxisLabels = useCallback(
    (col: number) => {
      if (!calc_ps || !calc_ps.date) return "";

      const dates = calc_ps.date;
      const dateIndex = col * 96; // 96 time slices per day

      if (dateIndex >= dates.length) return "";

      const currentDate = new Date(dates[dateIndex]);
      const currentMonth = currentDate.getMonth();

      // Check if this is the first column OR if the month changed from previous column
      let isMonthStart = col === 0;
      if (col > 0) {
        const prevDateIndex = (col - 1) * 96;
        if (prevDateIndex < dates.length) {
          const prevDate = new Date(dates[prevDateIndex]);
          const prevMonth = prevDate.getMonth();
          isMonthStart = currentMonth !== prevMonth;
        }
      }

      if (isMonthStart) {
        const monthNames = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];
        return monthNames[currentMonth];
      }

      return "";
    },
    [calc_ps],
  );

  const heatmapYAxisLabels = useCallback((row: number) => {
    if (row % 12 === 0) {
      const hour = Math.floor(row / 4);
      return `${hour.toString().padStart(2, "0")}:00`;
    }
    return "";
  }, []);

  const heatmapValueFormatter = useCallback((v: number) => v.toFixed(1), []);

  if (loading) {
    return (
      <div className="container">
        <h1>Recharts Playground</h1>
        <div className="chart-section">
          <p>Loading data...</p>
        </div>
      </div>
    );
  }

  if (!calc_ps) {
    return (
      <div className="container">
        <h1>Recharts Playground</h1>
        <div className="chart-section">
          <p>Failed to load data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>Recharts Playground</h1>

      <div className="chart-section">
        <div
          style={{
            display: "flex",
            gap: "1.5rem",
            alignItems: "center",
            marginBottom: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <span style={{ fontSize: "0.875rem", whiteSpace: "nowrap" }}>
              Group:
            </span>
            <select
              value={aggregation}
              onChange={(e) => {
                setAggregation(e.target.value as AggregationPeriod);
                setSelectedPeriodIndex(0);
              }}
              style={{
                fontSize: "0.875rem",
                padding: "0.25rem",
                cursor: "pointer",
              }}
            >
              <option value="none">None</option>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </div>
          <label
            style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
          >
            <input
              type="checkbox"
              checked={displayMode === "separate"}
              onChange={(e) =>
                setDisplayMode(e.target.checked ? "separate" : "combined")
              }
            />
            <span style={{ fontSize: "0.875rem" }}>Separate charts</span>
          </label>
          {displayMode === "separate" &&
            aggregation !== "none" &&
            periods.length > 1 && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                }}
              >
                <input
                  type="checkbox"
                  checked={allInOne}
                  onChange={(e) => setAllInOne(e.target.checked)}
                />
                <span style={{ fontSize: "0.875rem" }}>All in one</span>
              </label>
            )}
          {aggregation !== "none" && periods.length > 1 && (
            <div
              style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
            >
              <button
                onClick={() =>
                  setSelectedPeriodIndex(Math.max(0, selectedPeriodIndex - 1))
                }
                disabled={selectedPeriodIndex === 0}
                style={{
                  fontSize: "0.875rem",
                  padding: "0.25rem 0.5rem",
                  cursor: "pointer",
                }}
              >
                ←
              </button>
              <select
                value={selectedPeriodIndex}
                onChange={(e) => setSelectedPeriodIndex(Number(e.target.value))}
                style={{
                  fontSize: "0.875rem",
                  padding: "0.25rem",
                  cursor: "pointer",
                  minWidth: "150px",
                }}
              >
                {periods.map((period, index) => (
                  <option key={index} value={index}>
                    {period.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() =>
                  setSelectedPeriodIndex(
                    Math.min(periods.length - 1, selectedPeriodIndex + 1),
                  )
                }
                disabled={selectedPeriodIndex === periods.length - 1}
                style={{
                  fontSize: "0.875rem",
                  padding: "0.25rem 0.5rem",
                  cursor: "pointer",
                }}
              >
                →
              </button>
            </div>
          )}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {dataKeys.map((key, index) => (
              <label
                key={key}
                style={{ display: "flex", alignItems: "center", gap: "2px" }}
              >
                <input
                  type="checkbox"
                  checked={selectedKeys.has(key)}
                  onChange={() => toggleKey(key)}
                />
                <span style={{ color: COLORS[index % COLORS.length] }}>
                  {key}
                </span>
              </label>
            ))}
          </div>
        </div>

        {displayMode === "combined" ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                scale="time"
                minTickGap={40}
              />
              <YAxis />
              <Tooltip
                labelFormatter={(value) => new Date(value).toLocaleString()}
              />
              <Legend />
              {Array.from(selectedKeys).map((key) => {
                return (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={COLORS[dataKeys.indexOf(key) % COLORS.length]}
                    strokeWidth={1}
                    dot={false}
                    isAnimationActive={false}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            {Array.from(selectedKeys).map((key) => {
              const useAllInOne = allInOne && allPeriodsChartData;
              const data = useAllInOne ? allPeriodsChartData : chartData;
              const xAxisKey = useAllInOne ? "index" : "date";

              return (
                <div
                  key={key}
                  style={{ display: "flex", flexDirection: "column" }}
                >
                  <p
                    style={{
                      color: COLORS[dataKeys.indexOf(key) % COLORS.length],
                    }}
                  >
                    {key}
                  </p>
                  <ResponsiveContainer width="100%" height={150}>
                    <LineChart data={data} syncId="anyId">
                      <XAxis
                        dataKey={xAxisKey}
                        tickFormatter={useAllInOne ? undefined : formatDate}
                        scale={useAllInOne ? "auto" : "time"}
                        minTickGap={40}
                      />
                      <YAxis />
                      {!useAllInOne && (
                        <Tooltip
                          labelFormatter={
                            useAllInOne
                              ? (value) => `Index: ${value}`
                              : (value) => new Date(value).toLocaleString()
                          }
                        />
                      )}
                      {useAllInOne ? (
                        // Render a line for each period with opacity
                        periods.map((_, periodIndex) => (
                          <Line
                            key={`${key}_p${periodIndex}`}
                            type="monotone"
                            dataKey={`${key}_p${periodIndex}`}
                            stroke={
                              selectedPeriodIndex === periodIndex
                                ? COLORS[dataKeys.indexOf(key) % COLORS.length]
                                : "#999"
                            }
                            strokeWidth={
                              selectedPeriodIndex === periodIndex ? 2 : 1
                            }
                            strokeOpacity={
                              selectedPeriodIndex === periodIndex
                                ? 1
                                : Math.max(1 / (periods.length / 3), 0.05)
                            }
                            dot={false}
                            style={{
                              zIndex:
                                selectedPeriodIndex === periodIndex
                                  ? "20"
                                  : "1",
                            }}
                            isAnimationActive={false}
                            connectNulls={false}
                          />
                        ))
                      ) : (
                        <Line
                          type="monotone"
                          dataKey={key}
                          stroke={COLORS[dataKeys.indexOf(key) % COLORS.length]}
                          strokeWidth={1}
                          dot={false}
                          isAnimationActive={false}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Heatmap Section */}
      <div className="chart-section" style={{ marginTop: "2rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.875rem" }}>Series:</span>
          <select
            value={heatmapKey}
            onChange={(e) => setHeatmapKey(e.target.value)}
            style={{
              fontSize: "0.875rem",
              padding: "0.25rem",
              cursor: "pointer",
            }}
          >
            {dataKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>
        {heatmapData.data.length > 0 && (
          <div
            style={{ overflowX: "auto", overflowY: "auto", maxHeight: "600px" }}
          >
            <Heatmap
              data={heatmapData.data}
              rows={heatmapData.rows}
              cols={heatmapData.cols}
              cellWidth={2}
              cellHeight={2}
              cellGap={0}
              colorScale={["#22c55e", "#fef9e7", "#ef4444"]}
              margins={{ top: 40, right: 20, bottom: 40, left: 50 }}
              showAxes={true}
              showTooltip={true}
              showLegend={true}
              xAxisLabels={heatmapXAxisLabels}
              yAxisLabels={heatmapYAxisLabels}
              valueFormatter={heatmapValueFormatter}
              highlightedCols={heatmapData.highlightedCols}
            />
          </div>
        )}
      </div>
    </div>
  );
}
