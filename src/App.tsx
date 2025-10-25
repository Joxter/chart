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

  // Get limited and downsampled data
  const chartData = useMemo(() => {
    if (!calc_ps) return [];

    // First, limit the data
    const limitedData: Record<string, number[]> = {
      date: calc_ps.date.slice(0, debouncedDataLimit)
    };

    const selectedKeysArray = Array.from(selectedKeys);
    selectedKeysArray.forEach(key => {
      limitedData[key] = calc_ps[key].slice(0, debouncedDataLimit);
    });

    // Then downsample
    const downsampled = downsampleData(limitedData, maxPoints, selectedKeysArray);

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
  }, [selectedKeys, debouncedDataLimit, maxPoints]);

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
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit'
    });
  }, []);

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
