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

// Precompute period keys for efficient grouping
export function preprocessData(data: Record<string, number[]>): Record<string, number[]> {
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

  return data;
}
