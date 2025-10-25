# Recharts Playground

A high-performance interactive chart playground for visualizing large timeseries datasets using React and Recharts.

## Features

- **Interactive Chart Visualization** - Display multiple timeseries on a single chart
- **Performance Optimized** - Handles 65k+ data points with downsampling
- **Dynamic Data Selection** - Toggle series on/off with checkboxes
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

### 1. Data Downsampling
Uses a simplified Largest-Triangle-Three-Buckets algorithm to reduce rendered points while preserving visual accuracy.

```typescript
// Example: 65,000 points → 1,000 points for rendering
downsampleData(data, maxPoints, selectedKeys)
```

### 2. Debouncing
300ms debounce on slider changes prevents excessive re-renders.

### 3. Memoization
- `useMemo` for expensive data transformations
- `useCallback` for event handlers

### 4. Selective Processing
Only processes selected series, not all data keys.

### 5. No Animations
`isAnimationActive={false}` on chart lines for better performance.

### 6. Lazy Loading
Data fetched asynchronously, not bundled in the app.

## UI Controls

- **Data Slider** - Adjust how many data points to load (100 - total available)
- **Max Slider** - Control maximum rendered points (100 - 5,000)
- **Checkboxes** - Select which series to display on the chart

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

**Data Fetching** (lines 73-84)
```typescript
fetch('/calculationPS_small.json')
  .then(res => res.json())
  .then(data => setCalcPs(data))
```

**Downsampling Function** (lines 23-67)
```typescript
function downsampleData(
  data: Record<string, number[]>,
  targetPoints: number,
  selectedKeys: string[]
): Record<string, number[]>
```

**Chart Data Transformation** (lines 106-134)
- Limits data range
- Applies downsampling
- Transforms to Recharts format

## Performance Tips

1. **Start with defaults** - 10,000 data points, 1,000 max render points
2. **Increase gradually** - Monitor performance as you increase limits
3. **Limit selected series** - Fewer lines = better performance
4. **Use downsampling** - Keep max points under 2,000 for smooth interactions

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
