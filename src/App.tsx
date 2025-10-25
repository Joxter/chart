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
import { splitByPeriod, preprocessData, type AggregationPeriod } from './utils';

const COLORS = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1',
  '#d084d0', '#a4de6c', '#ffb347', '#76d7c4', '#f06292',
];

function App() {
  const [calc_ps, setCalcPs] = useState<Record<string, number[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [aggregation, setAggregation] = useState<AggregationPeriod>('week');
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState<number>(0);

  // Fetch data on mount
  useEffect(() => {
    fetch('/calculationPS_small.json')
      .then(res => {
        return res.json();
      })
      .then(data => {
        const processedData = preprocessData(data);
        setCalcPs(processedData);
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
      selectedKeysArray.forEach(key => {
        point[key] = processedData[key][i];
      });
      result.push(point);
    }

    console.log(`chartData: ${(performance.now() - startTime).toFixed(1)}ms`);
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
    if (aggregation === 'day') {
      return date.toLocaleTimeString('en-UK', {
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    return date.toLocaleDateString('en-UK', {
      month: 'short',
      day: 'numeric',
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
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {dataKeys.map((key, index) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                <input
                  type="checkbox"
                  checked={selectedKeys.has(key)}
                  onChange={() => toggleKey(key)}
                />
                <span style={{ color: COLORS[index % COLORS.length] }}>{key}</span>
              </label>
            ))}
          </div>
          <p>length: {chartData.length}</p>
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
