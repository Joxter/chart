import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const COLORS = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1',
  '#d084d0', '#a4de6c', '#ffb347', '#76d7c4', '#f06292',
];

type AggregationPeriod = 'none' | 'day' | 'week' | 'month';

interface PeriodData {
  label: string;
  data: Record<string, number[]>;
}

// Helper function to split data by time periods (day/week/month)
// Returns array where each element is all data for that period
function splitByPeriod(
  data: Record<string, number[]>,
  period: AggregationPeriod,
  selectedKeys: string[]
): PeriodData[] {
  if (period === 'none') {
    return [{
      label: 'All Data',
      data
    }];
  }

  const dates = data.date;
  const groups: Map<string, { label: string; indices: number[] }> = new Map();

  // Group indices by period
  dates.forEach((timestamp, index) => {
    const date = new Date(timestamp);
    let key: string;
    let label: string;

    switch (period) {
      case 'day':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        key = `${weekStart.getFullYear()}-W${String(Math.ceil(weekStart.getDate() / 7)).padStart(2, '0')}`;
        label = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        break;
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        break;
      default:
        key = timestamp.toString();
        label = 'All Data';
    }

    if (!groups.has(key)) {
      groups.set(key, { label, indices: [] });
    }
    groups.get(key)!.indices.push(index);
  });

  // Extract all data for each period (not averaged)
  const result: PeriodData[] = [];

  groups.forEach((group) => {
    const periodData: Record<string, number[]> = {
      date: []
    };

    selectedKeys.forEach(key => {
      periodData[key] = [];
    });

    // Copy all data points for this period
    group.indices.forEach(i => {
      periodData.date.push(dates[i]);
      selectedKeys.forEach(key => {
        periodData[key].push(data[key][i]);
      });
    });

    result.push({
      label: group.label,
      data: periodData
    });
  });

  return result;
}

// Downsample data using Largest-Triangle-Three-Buckets algorithm (simplified)
function downsampleData(data: Record<string, number[]>, targetPoints: number, selectedKeys: string[]): Record<string, number[]> {
  const dates = data.date;
  const dataLength = dates.length;

  if (dataLength <= targetPoints) {
    // No need to downsample
    return data;
  }

  const result: Record<string, number[]> = {
    date: []
  };

  selectedKeys.forEach(key => {
    result[key] = [];
  });

  const bucketSize = (dataLength - 2) / (targetPoints - 2);

  // Always include first point
  result.date.push(dates[0]);
  selectedKeys.forEach(key => {
    result[key].push(data[key][0]);
  });

  // Sample middle points
  for (let i = 0; i < targetPoints - 2; i++) {
    const bucketStart = Math.floor(i * bucketSize) + 1;
    const bucketEnd = Math.floor((i + 1) * bucketSize) + 1;
    const bucketMiddle = Math.floor((bucketStart + bucketEnd) / 2);

    result.date.push(dates[bucketMiddle]);
    selectedKeys.forEach(key => {
      result[key].push(data[key][bucketMiddle]);
    });
  }

  // Always include last point
  result.date.push(dates[dataLength - 1]);
  selectedKeys.forEach(key => {
    result[key].push(data[key][dataLength - 1]);
  });

  return result;
}

function App() {
  const [calc_ps, setCalcPs] = useState<Record<string, number[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataLimit, setDataLimit] = useState<number>(10000);
  const [debouncedDataLimit, setDebouncedDataLimit] = useState<number>(10000);
  const [maxPoints, setMaxPoints] = useState<number>(1000);
  const [aggregation, setAggregation] = useState<AggregationPeriod>('none');
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState<number>(0);

  // Fetch data on mount
  useEffect(() => {
    fetch('/calculationPS_small.json')
      .then(res => res.json())
      .then(data => {
        setCalcPs(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load data:', err);
        setLoading(false);
      });
  }, []);

  // Debounce dataLimit changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedDataLimit(dataLimit);
    }, 300);
    return () => clearTimeout(timer);
  }, [dataLimit]);

  // Filter out 'date' from data keys since it's used as x-axis
  const dataKeys = useMemo(() => calc_ps ? Object.keys(calc_ps).filter(key => key !== 'date') : [], [calc_ps]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // Initialize selected keys when data loads
  useEffect(() => {
    if (dataKeys.length > 0 && selectedKeys.size === 0) {
      setSelectedKeys(new Set(dataKeys.slice(0, 2)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKeys]);

  // Split data by periods and get available periods
  const periods = useMemo(() => {
    if (!calc_ps) return [];

    // First, limit the data
    const limitedData: Record<string, number[]> = {
      date: calc_ps.date.slice(0, debouncedDataLimit)
    };

    const selectedKeysArray = Array.from(selectedKeys);
    selectedKeysArray.forEach(key => {
      limitedData[key] = calc_ps[key].slice(0, debouncedDataLimit);
    });

    // Split by period
    return splitByPeriod(limitedData, aggregation, selectedKeysArray);
  }, [calc_ps, debouncedDataLimit, selectedKeys, aggregation]);

  // Reset selected period when aggregation changes or periods change
  useEffect(() => {
    if (selectedPeriodIndex >= periods.length) {
      setSelectedPeriodIndex(0);
    }
  }, [periods.length, selectedPeriodIndex]);

  // Get chart data for selected period
  const chartData = useMemo(() => {
    if (periods.length === 0) return [];

    const currentPeriod = periods[selectedPeriodIndex] || periods[0];
    const selectedKeysArray = Array.from(selectedKeys);

    // Downsample the selected period
    const downsampled = downsampleData(currentPeriod.data, maxPoints, selectedKeysArray);

    // Transform to chart format
    const result = [];
    const arrayLength = downsampled.date.length;

    for (let i = 0; i < arrayLength; i++) {
      const point: Record<string, number> = { date: downsampled.date[i] };
      selectedKeysArray.forEach(key => {
        point[key] = downsampled[key][i];
      });
      result.push(point);
    }

    return result;
  }, [periods, selectedPeriodIndex, selectedKeys, maxPoints]);

  const toggleKey = useCallback((key: string) => {
    setSelectedKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  }, []);

  const formatDate = useCallback((timestamp: number) => {
    const date = new Date(timestamp);

    // For period-based views, show time within the period
    if (aggregation === 'day' || aggregation === 'week' || aggregation === 'month') {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    // For 'none', show date + time
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit'
    });
  }, [aggregation]);

  const totalDataPoints = calc_ps?.date?.length || 0;

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
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
              Data: {dataLimit.toLocaleString()}
            </span>
            <input
              type="range"
              min="100"
              max={totalDataPoints}
              step="100"
              value={dataLimit}
              onChange={(e) => setDataLimit(Number(e.target.value))}
              style={{ width: '120px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
              Max: {maxPoints.toLocaleString()}
            </span>
            <input
              type="range"
              min="100"
              max="5000"
              step="100"
              value={maxPoints}
              onChange={(e) => setMaxPoints(Number(e.target.value))}
              style={{ width: '120px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
              Group:
            </span>
            <select
              value={aggregation}
              onChange={(e) => {
                setAggregation(e.target.value as AggregationPeriod);
                setSelectedPeriodIndex(0);
              }}
              style={{ fontSize: '0.875rem', padding: '0.25rem', cursor: 'pointer' }}
            >
              <option value="none">None</option>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </div>
          {aggregation !== 'none' && periods.length > 1 && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                onClick={() => setSelectedPeriodIndex(Math.max(0, selectedPeriodIndex - 1))}
                disabled={selectedPeriodIndex === 0}
                style={{ fontSize: '0.875rem', padding: '0.25rem 0.5rem', cursor: 'pointer' }}
              >
                ←
              </button>
              <select
                value={selectedPeriodIndex}
                onChange={(e) => setSelectedPeriodIndex(Number(e.target.value))}
                style={{ fontSize: '0.875rem', padding: '0.25rem', cursor: 'pointer', minWidth: '150px' }}
              >
                {periods.map((period, index) => (
                  <option key={index} value={index}>
                    {period.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setSelectedPeriodIndex(Math.min(periods.length - 1, selectedPeriodIndex + 1))}
                disabled={selectedPeriodIndex === periods.length - 1}
                style={{ fontSize: '0.875rem', padding: '0.25rem 0.5rem', cursor: 'pointer' }}
              >
                →
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {dataKeys.map((key, index) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={selectedKeys.has(key)}
                  onChange={() => toggleKey(key)}
                />
                <span style={{ color: COLORS[index % COLORS.length] }}>{key}</span>
              </label>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={500}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              scale="time"
              type="number"
              domain={['dataMin', 'dataMax']}
            />
            <YAxis />
            <Tooltip
              labelFormatter={(value) => new Date(value).toLocaleString()}
            />
            <Legend />
            {Array.from(selectedKeys).map((key) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={COLORS[dataKeys.indexOf(key) % COLORS.length]}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default App;
