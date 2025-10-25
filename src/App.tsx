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
  const startTime = performance.now();

  if (period === 'none') {
    console.log(`✓ splitByPeriod (none): ${(performance.now() - startTime).toFixed(2)}ms`);
    return [{
      label: 'All Data',
      data
    }];
  }

  const dates = data.date;
  const groups: Map<string, { label: string; indices: number[] }> = new Map();

  // Group indices by period (using precomputed keys)
  const groupStartTime = performance.now();

  let currentKey: string | null = null;
  let currentGroup: { label: string; indices: number[] } | null = null;

  // Get precomputed key array based on period
  let keyArray: string[];
  switch (period) {
    case 'day':
      keyArray = data._day_key;
      break;
    case 'week':
      keyArray = data._week_key;
      break;
    case 'month':
      keyArray = data._month_key;
      break;
    default:
      keyArray = [];
  }

  // Helper to get formatted label (slow, only called once per group)
  const getLabel = (timestamp: number): string => {
    const date = new Date(timestamp);

    switch (period) {
      case 'day':
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      case 'month':
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      default:
        return 'All Data';
    }
  };

  // Process sorted data efficiently using precomputed keys
  for (let index = 0; index < dates.length; index++) {
    const key = keyArray[index];

    if (key !== currentKey) {
      // New period detected - create new group with label
      currentKey = key;
      currentGroup = { label: getLabel(dates[index]), indices: [index] };
      groups.set(key, currentGroup);
    } else {
      // Same period - just add index (no calculation needed)
      currentGroup!.indices.push(index);
    }
  }

  console.log(`  - Grouping indices: ${(performance.now() - groupStartTime).toFixed(2)}ms (${groups.size} groups)`);

  // Extract all data for each period (not averaged)
  const extractStartTime = performance.now();
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
  console.log(`  - Extracting data: ${(performance.now() - extractStartTime).toFixed(2)}ms`);
  console.log(`✓ splitByPeriod (${period}): ${(performance.now() - startTime).toFixed(2)}ms total`);

  return result;
}

function App() {
  const [calc_ps, setCalcPs] = useState<Record<string, number[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [aggregation, setAggregation] = useState<AggregationPeriod>('week');
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState<number>(0);

  // Fetch data on mount
  useEffect(() => {
    const fetchStart = performance.now();
    console.log('⏳ Fetching data...');

    fetch('/calculationPS_small.json')
      .then(res => {
        const parseStart = performance.now();
        console.log(`✓ Fetch complete: ${(parseStart - fetchStart).toFixed(2)}ms`);
        return res.json();
      })
      .then(data => {
        console.log(`✓ Parse JSON: ${(performance.now() - fetchStart).toFixed(2)}ms total`);

        // Precompute period keys for fast grouping
        const preprocessStart = performance.now();
        const dates = data.date;
        const dayKeys: string[] = [];
        const weekKeys: string[] = [];
        const monthKeys: string[] = [];

        for (let i = 0; i < dates.length; i++) {
          const date = new Date(dates[i]);

          // Day key: "2024-01-01"
          dayKeys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);

          // Week key: "2024-W01"
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          weekKeys.push(`${weekStart.getFullYear()}-W${String(Math.ceil(weekStart.getDate() / 7)).padStart(2, '0')}`);

          // Month key: "2024-01"
          monthKeys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
        }

        data._day_key = dayKeys;
        data._week_key = weekKeys;
        data._month_key = monthKeys;

        console.log(`✓ Precompute period keys: ${(performance.now() - preprocessStart).toFixed(2)}ms`);

        setCalcPs(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load data:', err);
        setLoading(false);
      });
  }, []);

  // Filter out 'date' and internal keys from data keys since they're not series data
  const dataKeys = useMemo(() =>
    calc_ps ? Object.keys(calc_ps).filter(key =>
      key !== 'date' && !key.startsWith('_')
    ) : [],
  [calc_ps]);
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
    const startTime = performance.now();

    if (!calc_ps) {
      console.log(`✓ periods: 0ms (no data)`);
      return [];
    }

    const selectedKeysArray = Array.from(selectedKeys);
    console.log(`🔄 Calculating periods (${aggregation}, ${selectedKeysArray.length} keys)...`);

    const result = splitByPeriod(calc_ps, aggregation, selectedKeysArray);

    console.log(`✓ periods: ${(performance.now() - startTime).toFixed(2)}ms (${result.length} periods created)\n`);
    return result;
  }, [calc_ps, selectedKeys, aggregation]);

  // Reset selected period when aggregation changes or periods change
  useEffect(() => {
    if (selectedPeriodIndex >= periods.length) {
      setSelectedPeriodIndex(0);
    }
  }, [periods.length, selectedPeriodIndex]);

  // Get chart data for selected period
  const chartData = useMemo(() => {
    const startTime = performance.now();
    console.log(`🔄 Generating chart data (period ${selectedPeriodIndex}, ${selectedKeys.size} keys)...`);

    if (periods.length === 0) {
      console.log(`✓ chartData: 0ms (no periods)`);
      return [];
    }

    const currentPeriod = periods[selectedPeriodIndex] || periods[0];
    const selectedKeysArray = Array.from(selectedKeys);

    const processedData = currentPeriod.data;

    const transformStartTime = performance.now();
    const result = [];
    const arrayLength = processedData.date.length;

    for (let i = 0; i < arrayLength; i++) {
      const point: Record<string, number> = { date: processedData.date[i] };
      selectedKeysArray.forEach(key => {
        point[key] = processedData[key][i];
      });
      result.push(point);
    }

    console.log(`  - Transform to chart format: ${(performance.now() - transformStartTime).toFixed(2)}ms (${arrayLength} points)`);
    console.log(`✓ chartData: ${(performance.now() - startTime).toFixed(2)}ms total\n`);

    return result;
  }, [periods, selectedPeriodIndex, selectedKeys]);

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

        <ResponsiveContainer width="100%" height={300}>
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
