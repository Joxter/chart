import { useEffect, useRef, useState, useMemo } from 'react';
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
  highlightedCols?: number[];
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
  highlightedCols = [],
}: HeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rectCacheRef = useRef<DOMRect | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    content: '',
  });

  // Memoize dimension calculations
  const dimensions = useMemo(() => {
    const totalCellWidth = cellWidth + cellGap;
    const totalCellHeight = cellHeight + cellGap;
    const chartWidth = cols * totalCellWidth - cellGap;
    const chartHeight = rows * totalCellHeight - cellGap;
    const width = chartWidth + margins.left + margins.right;
    const height = chartHeight + margins.top + margins.bottom;

    return {
      totalCellWidth,
      totalCellHeight,
      chartWidth,
      chartHeight,
      width,
      height,
    };
  }, [cellWidth, cellHeight, cellGap, cols, rows, margins]);

  // Create color palette with fast lookup (OPTIMIZED: 256 colors instead of 35k)
  const colorPalette = useMemo(() => {
    console.time('Create color palette');
    const dataMin = minValue ?? d3.min(data) ?? 0;
    const dataMax = maxValue ?? d3.max(data) ?? 1;
    const hasNegative = dataMin < 0;
    const useDiverging = hasNegative && colorScale.length === 3;
    const absMax = useDiverging ? Math.max(Math.abs(dataMin), Math.abs(dataMax)) : 0;

    // Create D3 color scale function (only used for palette generation)
    let colorFn: (value: number) => string;
    if (useDiverging) {
      colorFn = d3.scaleLinear<string>()
        .domain([-absMax, 0, absMax])
        .range([colorScale[0], colorScale[1], colorScale[2]])
        .clamp(true);
    } else {
      const colors = colorScale.length === 3 ? [colorScale[1], colorScale[2]] : colorScale;
      colorFn = d3.scaleSequential(d3.interpolateRgb(colors[0], colors[1]))
        .domain([dataMin, dataMax]);
    }

    // Pre-generate palette of 256 distinct colors
    const paletteSize = 256;
    const palette = new Array(paletteSize);

    if (useDiverging) {
      for (let i = 0; i < paletteSize; i++) {
        const t = i / (paletteSize - 1); // 0 to 1
        const value = -absMax + t * (2 * absMax); // Map to [-absMax, +absMax]
        palette[i] = colorFn(value);
      }
    } else {
      for (let i = 0; i < paletteSize; i++) {
        const t = i / (paletteSize - 1); // 0 to 1
        const value = dataMin + t * (dataMax - dataMin); // Map to [dataMin, dataMax]
        palette[i] = colorFn(value);
      }
    }

    // Fast value-to-color lookup function using simple math (no binary search needed)
    const getColor = (value: number): string | null => {
      if (value === null || value === undefined || isNaN(value)) return null;

      let index: number;
      if (useDiverging) {
        // Map value from [-absMax, absMax] to [0, paletteSize-1]
        const t = (value + absMax) / (2 * absMax);
        index = Math.round(t * (paletteSize - 1));
      } else {
        // Map value from [dataMin, dataMax] to [0, paletteSize-1]
        const t = (value - dataMin) / (dataMax - dataMin);
        index = Math.round(t * (paletteSize - 1));
      }

      // Clamp to valid range
      index = Math.max(0, Math.min(paletteSize - 1, index));
      return palette[index];
    };

    console.timeEnd('Create color palette');
    return { dataMin, dataMax, useDiverging, absMax, palette, getColor };
  }, [data, minValue, maxValue, colorScale]);

  // Pre-calculate which axis labels to show (OPTIMIZATION)
  const axisLabels = useMemo(() => {
    const xLabels: Array<{ col: number; label: string; x: number }> = [];
    const yLabels: Array<{ row: number; label: string; y: number }> = [];

    if (showAxes) {
      // X-axis labels
      for (let col = 0; col < cols; col++) {
        let label: string = '';
        if (typeof xAxisLabels === 'function') {
          label = xAxisLabels(col);
        } else if (Array.isArray(xAxisLabels)) {
          label = xAxisLabels[col] || '';
        } else {
          const xLabelStep = Math.ceil(cols / 12);
          label = col % xLabelStep === 0 ? `Day ${col + 1}` : '';
        }

        if (label) {
          xLabels.push({
            col,
            label,
            x: margins.left + col * dimensions.totalCellWidth + cellWidth / 2,
          });
        }
      }

      // Y-axis labels
      for (let row = 0; row < rows; row++) {
        let label: string = '';
        if (typeof yAxisLabels === 'function') {
          label = yAxisLabels(row);
        } else if (Array.isArray(yAxisLabels)) {
          label = yAxisLabels[row] || '';
        } else {
          if (row % 4 === 0) {
            const hour = Math.floor(row / 4);
            const minute = (row % 4) * 15;
            label = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          }
        }

        if (label) {
          yLabels.push({
            row,
            label,
            y: margins.top + row * dimensions.totalCellHeight + cellHeight / 2,
          });
        }
      }
    }

    return { xLabels, yLabels };
  }, [showAxes, cols, rows, xAxisLabels, yAxisLabels, margins, dimensions, cellWidth]);

  useEffect(() => {
    if (!canvasRef.current || !data || data.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height, totalCellWidth, totalCellHeight, chartWidth } = dimensions;

    // Set canvas size with device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Update cached rect for mouse events
    rectCacheRef.current = canvas.getBoundingClientRect();

    // Draw cells using palette lookup (OPTIMIZED: 256 colors, fast math lookup)
    console.time('Heatmap render');
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = col * rows + row;
        if (index >= data.length) break;

        const value = data[index];
        const color = colorPalette.getColor(value);
        if (!color) continue;

        const x = margins.left + col * totalCellWidth;
        const y = margins.top + row * totalCellHeight;

        ctx.fillStyle = color;
        ctx.fillRect(x, y, cellWidth, cellHeight);
      }
    }
    console.timeEnd('Heatmap render');

    // Draw axes using pre-computed labels (OPTIMIZED)
    if (showAxes) {
      ctx.fillStyle = '#333';
      ctx.font = '10px sans-serif';

      // X-axis labels (bottom)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const yPos = margins.top + dimensions.chartHeight + 5;
      for (const { label, x } of axisLabels.xLabels) {
        ctx.fillText(label, x, yPos);
      }

      // Y-axis labels (left)
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const xPos = margins.left - 5;
      for (const { label, y } of axisLabels.yLabels) {
        ctx.fillText(label, xPos, y);
      }
    }

    // Draw legend using color palette (OPTIMIZED)
    if (showLegend) {
      const legendWidth = 200;
      const legendHeight = 15;
      const legendX = margins.left;
      const legendY = 10;

      // Draw gradient (horizontal)
      const gradient = ctx.createLinearGradient(legendX, 0, legendX + legendWidth, 0);

      if (colorPalette.useDiverging) {
        // Diverging gradient: negative -> zero -> positive
        gradient.addColorStop(0, colorScale[0]);
        gradient.addColorStop(0.5, colorScale[1]);
        gradient.addColorStop(1, colorScale[2]);
      } else {
        // Sequential gradient: min -> max
        const colors = colorScale.length === 3 ? [colorScale[1], colorScale[2]] : colorScale;
        gradient.addColorStop(0, colors[0]);
        gradient.addColorStop(1, colors[1]);
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

      if (colorPalette.useDiverging) {
        // For diverging scale, show symmetric min/max around zero
        ctx.textAlign = 'left';
        ctx.fillText(valueFormatter(-colorPalette.absMax), legendX, legendY + legendHeight + 3);

        ctx.textAlign = 'center';
        ctx.fillText(valueFormatter(0), legendX + legendWidth / 2, legendY + legendHeight + 3);

        ctx.textAlign = 'right';
        ctx.fillText(valueFormatter(colorPalette.absMax), legendX + legendWidth, legendY + legendHeight + 3);
      } else {
        // For sequential scale, show actual min/max
        ctx.textAlign = 'left';
        ctx.fillText(valueFormatter(colorPalette.dataMin), legendX, legendY + legendHeight + 3);

        ctx.textAlign = 'right';
        ctx.fillText(valueFormatter(colorPalette.dataMax), legendX + legendWidth, legendY + legendHeight + 3);

        ctx.textAlign = 'center';
        const midValue = (colorPalette.dataMin + colorPalette.dataMax) / 2;
        ctx.fillText(valueFormatter(midValue), legendX + legendWidth / 2, legendY + legendHeight + 3);
      }
    }

    // Draw ticks for highlighted columns (selected period)
    if (highlightedCols.length > 0) {
      ctx.strokeStyle = '#ff6b00';
      ctx.lineWidth = 2;
      ctx.fillStyle = '#ff6b00';

      highlightedCols.forEach((col) => {
        const x = margins.left + col * totalCellWidth;

        // Draw tick mark at top
        ctx.beginPath();
        ctx.moveTo(x, margins.top - 8);
        ctx.lineTo(x, margins.top - 2);
        ctx.stroke();

        // Draw tick mark at bottom
        ctx.beginPath();
        ctx.moveTo(x, margins.top + dimensions.chartHeight + 2);
        ctx.lineTo(x, margins.top + dimensions.chartHeight + 8);
        ctx.stroke();
      });
    }
  }, [data, rows, cols, cellWidth, cellHeight, cellGap, colorScale, margins, showAxes, showLegend, dimensions, axisLabels, colorPalette, valueFormatter, highlightedCols]);

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!showTooltip || !canvasRef.current) return;

    // Use cached rect (OPTIMIZED)
    const rect = rectCacheRef.current || canvasRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Use pre-computed dimensions (OPTIMIZED)
    const { totalCellWidth, totalCellHeight } = dimensions;

    const col = Math.floor((x - margins.left) / totalCellWidth);
    const row = Math.floor((y - margins.top) / totalCellHeight);

    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      const index = col * rows + row;
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

    // Use cached rect (OPTIMIZED)
    const rect = rectCacheRef.current || canvasRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Use pre-computed dimensions (OPTIMIZED)
    const { totalCellWidth, totalCellHeight } = dimensions;

    const col = Math.floor((x - margins.left) / totalCellWidth);
    const row = Math.floor((y - margins.top) / totalCellHeight);

    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      const index = col * rows + row;
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
