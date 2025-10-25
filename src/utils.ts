export type AggregationPeriod = 'none' | 'day' | 'week' | 'month';

export interface PeriodData {
  label: string;
  data: Record<string, number[]>;
}

// Helper function to split data by time periods (day/week/month)
// Returns array where each element is all data for that period
export function splitByPeriod(
  data: Record<string, number[]>,
  period: AggregationPeriod,
): PeriodData[] {
  const startTime = performance.now();
  const selectedKeys = Object.keys(data).filter(key =>
    key !== 'date' && !key.startsWith('_')
  )

  if (period === 'none') {
    return [{
      label: 'All Data',
      data
    }];
  }

  const dates = data.date;
  const groups: Array<{ label: string; startIndex: number; endIndex: number }> = [];

  let currentKey: string | null = null;
  let currentGroup: { label: string; startIndex: number; endIndex: number } | null = null;

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
      currentGroup = { label: getLabel(dates[index]), startIndex: index, endIndex: index };
      groups.push(currentGroup);
    } else {
      // Same period - just update end index (no calculation needed)
      currentGroup!.endIndex = index;
    }
  }

  // Extract all data for each period (not averaged)
  const result: PeriodData[] = [];

  groups.forEach((group) => {
    const periodData: Record<string, number[]> = {
      date: dates.slice(group.startIndex, group.endIndex + 1)
    };

    // Use array slicing instead of forEach - much faster
    selectedKeys.forEach(key => {
      periodData[key] = data[key].slice(group.startIndex, group.endIndex + 1);
    });

    result.push({
      label: group.label,
      data: periodData
    });
  });
  console.log(`✓ splitByPeriod (${period}): ${(performance.now() - startTime).toFixed(2)}ms total`);

  return result;
}

// Precompute period keys for efficient grouping
export function preprocessData(data: Record<string, number[]>): Record<string, number[]> {
  const preprocessStart = performance.now();
  const dates = data.date;
  const length = dates.length;

  // Pre-allocate arrays for better performance
  const dayKeys: string[] = new Array(length);
  const weekKeys: string[] = new Array(length);
  const monthKeys: string[] = new Array(length);

  for (let i = 0; i < length; i++) {
    const date = new Date(dates[i]);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    // Day key: "2024-01-01"
    dayKeys[i] = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // Week key: Use the date of the week start (Sunday) as unique identifier
    // This ensures each week has a unique key across years
    const weekStart = new Date(date);
    weekStart.setDate(day - date.getDay());
    weekKeys[i] = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;

    // Month key: "2024-01"
    monthKeys[i] = `${year}-${String(month).padStart(2, '0')}`;
  }

  data._day_key = dayKeys;
  data._week_key = weekKeys;
  data._month_key = monthKeys;

  console.log(`✓ Precompute period keys: ${(performance.now() - preprocessStart).toFixed(2)}ms`);

  return data;
}
