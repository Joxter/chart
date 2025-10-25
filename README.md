# Recharts Playground

A high-performance interactive chart playground for visualizing large timeseries datasets using React and Recharts.

## Features

- **Interactive Chart Visualization** - Display multiple timeseries on a single chart
- **Time Period Navigation** - Split data by day/week/month and navigate between periods
- **Performance Optimized** - Handles 65k+ data points with precomputed keys and efficient algorithms
- **Dynamic Data Selection** - Toggle series on/off with checkboxes
- **Timestamp Support** - Smart date/time formatting on X-axis based on period

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

### 1. Precomputed Period Keys
Day/week/month keys calculated once on data load and stored for instant grouping operations.

### 2. Optimized for Sorted Data
Takes advantage of sorted timestamps to avoid redundant calculations during period splitting.

### 3. Selective Processing
Only processes and renders selected data series, not all available keys.

### 4. Period-Based Splitting
View data in manageable chunks (day/week/month) instead of all 65k+ points at once.

### 5. Memoization
Strategic use of `useMemo` and `useCallback` to prevent unnecessary recalculations.

### 6. Performance Monitoring
Console logs show timing for all major operations (fetch, parse, split, transform).

### 7. Lazy Loading
2.2MB JSON file fetched at runtime, not bundled with the app.

## UI Controls

- **Group Dropdown** - Split data by None/Day/Week/Month
- **Period Navigation** - Previous/next buttons and dropdown to select specific periods
- **Series Checkboxes** - Toggle which data series to display on the chart

### Period Modes

- **None** - Display all data as one continuous timeline
- **Day** - Split into individual days with navigation between them
- **Week** - Split into weeks (Sunday to Saturday)
- **Month** - Split into calendar months

Each period shows all raw data points for that time range.

## Project Structure

```
d3-playground/
├── public/
│   └── calculationPS_small.json  # 2.2MB timeseries data
├── src/
│   ├── App.tsx                   # Main app component (UI & state)
│   ├── utils.ts                  # Data processing utilities
│   ├── index.css                 # Global styles
│   └── main.tsx                  # Entry point
├── package.json
└── vite.config.ts
```

## Key Components

### utils.ts

**preprocessData()** - Precomputes day/week/month keys for all timestamps on data load

**splitByPeriod()** - Splits data into periods using precomputed keys
- Uses sorted data optimization
- Returns array of periods with labels and data

### App.tsx

**State Management** - Handles period selection, series selection, and data loading

**Chart Rendering** - Transforms period data to Recharts format and renders interactive chart

**Performance Monitoring** - Console logs timing for all operations

## Performance Tips

1. **Use period splitting** - Split by day/week/month to view smaller data chunks
2. **Limit selected series** - Display only the series you need to analyze
3. **Check console logs** - Monitor operation timings to identify bottlenecks
4. **Start with day view** - Individual days have fewer points and render faster

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
