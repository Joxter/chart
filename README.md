# Recharts Playground

A high-performance interactive chart playground for visualizing large timeseries datasets using React and Recharts.

## Features

- **Interactive Chart Visualization** - Display multiple timeseries on a single chart
- **Performance Optimized** - Handles 65k+ data points with downsampling
- **Dynamic Data Selection** - Toggle series on/off with checkboxes
- **Time Period Aggregation** - Group data by day, week, or month
- **Adjustable Performance Settings** - Control data range and rendering points
- **Timestamp Support** - Properly formatted date/time on X-axis

## Tech Stack

- **Vite** - Fast build tool and dev server
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Recharts** - Chart library
- **No bundled data** - 2.2MB JSON fetched at runtime

## Installation

```bash
npm install
```

## Running the App

```bash
npm run dev
```

Open your browser to the URL shown in the terminal (typically `http://localhost:5173`)

## Data Format

The app expects a JSON file at `/public/calculationPS_small.json` with this structure:

```json
{
  "date": [1704060000000, 1704060900000, ...],
  "series1": [100, 200, ...],
  "series2": [150, 250, ...],
  ...
}
```

- `date` - Array of Unix timestamps (milliseconds)
- Other keys - Arrays of numeric values (same length as `date`)

## Performance Optimizations

### 1. Time Period Aggregation
Group data points by day, week, or month with automatic averaging. Reduces data density while preserving trends.

```typescript
// Example: 65,000 15-minute intervals → ~365 daily averages
aggregateByPeriod(data, 'day', selectedKeys)
```

### 2. Data Downsampling
Uses a simplified Largest-Triangle-Three-Buckets algorithm to reduce rendered points while preserving visual accuracy.

```typescript
// Example: 65,000 points → 1,000 points for rendering
downsampleData(data, maxPoints, selectedKeys)
```

### 3. Debouncing
300ms debounce on slider changes prevents excessive re-renders.

### 4. Memoization
- `useMemo` for expensive data transformations
- `useCallback` for event handlers

### 5. Selective Processing
Only processes selected series, not all data keys.

### 6. No Animations
`isAnimationActive={false}` on chart lines for better performance.

### 7. Lazy Loading
Data fetched asynchronously, not bundled in the app.

## UI Controls

- **Data Slider** - Adjust how many data points to load (100 - total available)
- **Max Slider** - Control maximum rendered points (100 - 5,000)
- **Group Dropdown** - Aggregate data by None/Day/Week/Month
- **Checkboxes** - Select which series to display on the chart

### Aggregation Modes

- **None** - Display raw data (with downsampling if needed)
- **Day** - Average values by calendar day
- **Week** - Average values by week (Sunday to Saturday)
- **Month** - Average values by calendar month

Aggregation is applied before downsampling, providing better performance for long time ranges.

## Project Structure

```
d3-playground/
├── public/
│   └── calculationPS_small.json  # 2.2MB timeseries data
├── src/
│   ├── App.tsx                   # Main app component
│   ├── index.css                 # Global styles
│   └── main.tsx                  # Entry point
├── package.json
└── vite.config.ts
```

## Key Components

### App.tsx

**Data Fetching** (lines 139-150)
```typescript
fetch('/calculationPS_small.json')
  .then(res => res.json())
  .then(data => setCalcPs(data))
```

**Aggregation Function** (lines 21-82)
```typescript
function aggregateByPeriod(
  data: Record<string, number[]>,
  period: AggregationPeriod,
  selectedKeys: string[]
): Record<string, number[]>
```
- Groups data points by day/week/month
- Calculates averages for each period
- Reduces data points significantly

**Downsampling Function** (lines 85-129)
```typescript
function downsampleData(
  data: Record<string, number[]>,
  targetPoints: number,
  selectedKeys: string[]
): Record<string, number[]>
```
- Samples data intelligently
- Preserves visual shape

**Chart Data Transformation** (lines 173-206)
- Limits data range
- Applies aggregation (if selected)
- Applies downsampling
- Transforms to Recharts format

## Performance Tips

1. **Start with defaults** - 10,000 data points, 1,000 max render points, no aggregation
2. **Use aggregation for long ranges** - When viewing months/years of data, aggregate by day/week/month
3. **Increase gradually** - Monitor performance as you increase limits
4. **Limit selected series** - Fewer lines = better performance
5. **Combine aggregation + downsampling** - Aggregate to reduce data, then downsample for rendering
6. **Keep max points reasonable** - Under 2,000 points for smooth interactions

## Build for Production

```bash
npm run build
npm run preview
```

The build output will be in the `dist/` directory.

## Browser Requirements

- Modern browsers with ES6+ support
- Chrome, Firefox, Safari, Edge (latest versions)

## License

MIT
