import { useState, useMemo } from 'react';
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
import { calc_ps } from "./files/calculationPS_small.ts";

// WARNING: calc_ps is a HUGE file with timeseries data for a full year.
// the type if like: calc_ps: Record<string, number[]>, each array contains 65k elements

const COLORS = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1',
  '#d084d0', '#a4de6c', '#ffb347', '#76d7c4', '#f06292',
];

// Helper function to get only first X values from the data
function getFirstNValues(data: Record<string, number[]>, count: number): Record<string, number[]> {
  const result: Record<string, number[]> = {};

  for (const key in data) {
    result[key] = data[key].slice(0, count);
  }

  return result;
}

function App() {
  const [dataLimit, setDataLimit] = useState<number>(1000);

  // Get limited data based on dataLimit
  const limitedData = useMemo(() => getFirstNValues(calc_ps, dataLimit), [dataLimit]);

  // Filter out 'date' from data keys since it's used as x-axis
  const dataKeys = Object.keys(limitedData).filter(key => key !== 'date');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set(dataKeys.slice(0, 2)));

  const chartData = useMemo(() => {
    const dates = limitedData.date;
    const arrayLength = dates?.length || 0;
    const data = [];

    for (let i = 0; i < arrayLength; i++) {
      const point: Record<string, number> = { date: dates[i] };
      dataKeys.forEach(key => {
        if (selectedKeys.has(key)) {
          point[key] = limitedData[key][i];
        }
      });
      data.push(point);
    }

    return data;
  }, [selectedKeys, dataKeys, limitedData]);

  const toggleKey = (key: string) => {
    setSelectedKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit'
    });
  };

  const totalDataPoints = calc_ps.date?.length || 0;

  return (
    <div className="container">
      <h1>Recharts Playground</h1>

      <div className="chart-section">
        <h2>Data Limit</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
            <span style={{ minWidth: '120px' }}>
              Points: {dataLimit.toLocaleString()} / {totalDataPoints.toLocaleString()}
            </span>
            <input
              type="range"
              min="100"
              max={totalDataPoints}
              step="100"
              value={dataLimit}
              onChange={(e) => setDataLimit(Number(e.target.value))}
              style={{ flex: 1 }}
            />
          </label>
          <input
            type="number"
            min="100"
            max={totalDataPoints}
            value={dataLimit}
            onChange={(e) => setDataLimit(Number(e.target.value))}
            style={{ width: '100px', padding: '0.25rem' }}
          />
        </div>
      </div>

      <div className="chart-section">
        <h2>Select Data Series</h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '0.5rem',
          marginBottom: '1rem'
        }}>
          {dataKeys.map((key, index) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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

      <div className="chart-section">
        <h2>Line Chart ({selectedKeys.size} series selected)</h2>
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
            {Array.from(selectedKeys).map((key, index) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={COLORS[dataKeys.indexOf(key) % COLORS.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default App;
