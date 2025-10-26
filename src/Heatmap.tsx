import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

export interface HeatmapProps {
  data: number[];
  rows?: number;
  cols?: number;
  cellWidth?: number;
  cellHeight?: number;
  cellGap?: number;
  colorScale?: [string, string] | [string, string, string];
  margins?: { top: number; right: number; bottom: number; left: number };
  showAxes?: boolean;
  showTooltip?: boolean;
  showLegend?: boolean;
  xAxisLabels?: string[] | ((col: number) => string);
  yAxisLabels?: string[] | ((row: number) => string);
  onCellClick?: (row: number, col: number, value: number) => void;
  valueFormatter?: (value: number) => string;
  minValue?: number;
  maxValue?: number;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  content: string;
}

export default function Heatmap({
  data,
  rows = 96,
  cols = 365,
  cellWidth = 4,
  cellHeight = 4,
  cellGap = 1,
  colorScale = ['#2166ac', '#f7f7f7', '#b2182b'],
  margins = { top: 30, right: 10, bottom: 30, left: 40 },
  showAxes = true,
  showTooltip = true,
  showLegend = true,
  xAxisLabels,
  yAxisLabels,
  onCellClick,
  valueFormatter = (v) => v.toFixed(2),
  minValue,
  maxValue,
}: HeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    content: '',
  });

  useEffect(() => {
    if (!canvasRef.current || !data || data.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate dimensions
    const totalCellWidth = cellWidth + cellGap;
    const totalCellHeight = cellHeight + cellGap;
    const chartWidth = cols * totalCellWidth - cellGap;
    const chartHeight = rows * totalCellHeight - cellGap;
    const width = chartWidth + margins.left + margins.right;
    const height = chartHeight + margins.top + margins.bottom;

    // Set canvas size with device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate color scale
    const dataMin = minValue ?? d3.min(data) ?? 0;
    const dataMax = maxValue ?? d3.max(data) ?? 1;

    // Determine if we should use diverging scale (when data has negative values)
    const hasNegative = dataMin < 0;
    const useDiverging = hasNegative && colorScale.length === 3;

    let color: (value: number) => string;
    if (useDiverging) {
      // Diverging scale: negative -> zero -> positive
      const absMax = Math.max(Math.abs(dataMin), Math.abs(dataMax));
      color = d3.scaleLinear<string>()
        .domain([-absMax, 0, absMax])
        .range([colorScale[0], colorScale[1], colorScale[2]])
        .clamp(true);
    } else {
      // Sequential scale: min -> max
      const colors = colorScale.length === 3 ? [colorScale[1], colorScale[2]] : colorScale;
      color = d3.scaleSequential(d3.interpolateRgb(colors[0], colors[1]))
        .domain([dataMin, dataMax]);
    }

    // Draw cells
    console.time('Heatmap render');
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col;
        if (index >= data.length) continue;

        const value = data[index];
        if (value === null || value === undefined || isNaN(value)) continue;

        const x = margins.left + col * totalCellWidth;
        const y = margins.top + row * totalCellHeight;

        ctx.fillStyle = color(value);
        ctx.fillRect(x, y, cellWidth, cellHeight);
      }
    }
    console.timeEnd('Heatmap render');

    // Draw axes if enabled
    if (showAxes) {
      ctx.fillStyle = '#333';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      // X-axis labels (bottom)
      for (let col = 0; col < cols; col++) {
        let label: string;
        if (typeof xAxisLabels === 'function') {
          label = xAxisLabels(col);
        } else if (Array.isArray(xAxisLabels)) {
          label = xAxisLabels[col] || '';
        } else {
          // Default: show ~12 labels
          const xLabelStep = Math.ceil(cols / 12);
          label = col % xLabelStep === 0 ? `Day ${col + 1}` : '';
        }

        // Only render if label is non-empty
        if (label) {
          const x = margins.left + col * totalCellWidth + cellWidth / 2;
          const y = margins.top + chartHeight + 5;
          ctx.fillText(label, x, y);
        }
      }

      // Y-axis labels (left)
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let row = 0; row < rows; row++) {
        let label: string;
        if (typeof yAxisLabels === 'function') {
          label = yAxisLabels(row);
        } else if (Array.isArray(yAxisLabels)) {
          label = yAxisLabels[row] || '';
        } else {
          // Default: show time labels every 4 rows (1 hour)
          if (row % 4 === 0) {
            const hour = Math.floor(row / 4);
            const minute = (row % 4) * 15;
            label = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          } else {
            label = '';
          }
        }

        // Only render if label is non-empty
        if (label) {
          const x = margins.left - 5;
          const y = margins.top + row * totalCellHeight + cellHeight / 2;
          ctx.fillText(label, x, y);
        }
      }
    }

    // Draw legend if enabled
    if (showLegend) {
      const legendWidth = 200;
      const legendHeight = 15;
      const legendX = margins.left;
      const legendY = 10;

      // Draw gradient (horizontal)
      const gradient = ctx.createLinearGradient(legendX, 0, legendX + legendWidth, 0);

      if (useDiverging) {
        // Diverging gradient: negative -> zero -> positive
        gradient.addColorStop(0, colorScale[0]); // Negative (left)
        gradient.addColorStop(0.5, colorScale[1]); // Zero (center)
        gradient.addColorStop(1, colorScale[2]); // Positive (right)
      } else {
        // Sequential gradient: min -> max
        const colors = colorScale.length === 3 ? [colorScale[1], colorScale[2]] : colorScale;
        gradient.addColorStop(0, colors[0]); // Min at left
        gradient.addColorStop(1, colors[1]); // Max at right
      }

      ctx.fillStyle = gradient;
      ctx.fillRect(legendX, legendY, legendWidth, legendHeight);

      // Draw border
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);

      // Draw labels
      ctx.fillStyle = '#333';
      ctx.font = '11px sans-serif';
      ctx.textBaseline = 'top';

      if (useDiverging) {
        // For diverging scale, show symmetric min/max around zero
        const absMax = Math.max(Math.abs(dataMin), Math.abs(dataMax));

        // Negative value (left)
        ctx.textAlign = 'left';
        ctx.fillText(valueFormatter(-absMax), legendX, legendY + legendHeight + 3);

        // Zero (center)
        ctx.textAlign = 'center';
        ctx.fillText(valueFormatter(0), legendX + legendWidth / 2, legendY + legendHeight + 3);

        // Positive value (right)
        ctx.textAlign = 'right';
        ctx.fillText(valueFormatter(absMax), legendX + legendWidth, legendY + legendHeight + 3);
      } else {
        // For sequential scale, show actual min/max
        // Min value (left)
        ctx.textAlign = 'left';
        ctx.fillText(valueFormatter(dataMin), legendX, legendY + legendHeight + 3);

        // Max value (right)
        ctx.textAlign = 'right';
        ctx.fillText(valueFormatter(dataMax), legendX + legendWidth, legendY + legendHeight + 3);

        // Middle value (center)
        ctx.textAlign = 'center';
        const midValue = (dataMin + dataMax) / 2;
        ctx.fillText(valueFormatter(midValue), legendX + legendWidth / 2, legendY + legendHeight + 3);
      }
    }
  }, [data, rows, cols, cellWidth, cellHeight, cellGap, colorScale, margins, showAxes, showLegend, xAxisLabels, yAxisLabels, minValue, maxValue, valueFormatter]);

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!showTooltip || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Calculate which cell is being hovered
    const totalCellWidth = cellWidth + cellGap;
    const totalCellHeight = cellHeight + cellGap;

    const col = Math.floor((x - margins.left) / totalCellWidth);
    const row = Math.floor((y - margins.top) / totalCellHeight);

    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      const index = row * cols + col;
      if (index < data.length) {
        const value = data[index];
        if (value !== null && value !== undefined && !isNaN(value)) {
          const hour = Math.floor(row / 4);
          const minute = (row % 4) * 15;
          const timeLabel = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

          setTooltip({
            visible: true,
            x: event.clientX,
            y: event.clientY,
            content: `Day ${col + 1}, ${timeLabel}: ${valueFormatter(value)}`,
          });
          return;
        }
      }
    }

    setTooltip({ visible: false, x: 0, y: 0, content: '' });
  };

  const handleMouseLeave = () => {
    setTooltip({ visible: false, x: 0, y: 0, content: '' });
  };

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onCellClick || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const totalCellWidth = cellWidth + cellGap;
    const totalCellHeight = cellHeight + cellGap;

    const col = Math.floor((x - margins.left) / totalCellWidth);
    const row = Math.floor((y - margins.top) / totalCellHeight);

    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      const index = row * cols + col;
      if (index < data.length) {
        const value = data[index];
        if (value !== null && value !== undefined && !isNaN(value)) {
          onCellClick(row, col, value);
        }
      }
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        style={{ cursor: showTooltip || onCellClick ? 'pointer' : 'default' }}
      />
      {tooltip.visible && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 10,
            top: tooltip.y + 10,
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            pointerEvents: 'none',
            zIndex: 1000,
            whiteSpace: 'nowrap',
          }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  );
}
