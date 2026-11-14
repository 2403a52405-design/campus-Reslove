import { useEffect, useRef } from 'react';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PieController,
  PointElement,
  Tooltip,
  type ChartConfiguration,
} from 'chart.js';

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PieController,
  PointElement,
  Tooltip
);

interface ChartCanvasProps {
  type: 'pie' | 'doughnut' | 'bar' | 'line';
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
    tension?: number;
    fill?: boolean;
    borderRadius?: number;
  }>;
  darkMode: boolean;
  height?: number;
  horizontal?: boolean;
}

export function ChartCanvas({
  type,
  labels,
  datasets,
  darkMode,
  height = 260,
  horizontal = false,
}: ChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    const textColor = darkMode ? '#cbd5e1' : '#334155';
    const gridColor = darkMode ? 'rgba(148, 163, 184, 0.14)' : 'rgba(15, 23, 42, 0.08)';
    const isRadial = type === 'pie' || type === 'doughnut';

    const config: ChartConfiguration = {
      type,
      data: {
        labels,
        datasets: datasets.map((ds) => ({
          ...ds,
          borderWidth: ds.borderWidth ?? (isRadial ? 2 : 2),
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: type === 'bar' && horizontal ? 'y' : 'x',
        plugins: {
          legend: {
            position: isRadial ? 'right' : 'top',
            labels: {
              color: textColor,
              boxWidth: 12,
              boxHeight: 12,
              padding: 14,
              font: {
                family: "'DM Sans', system-ui, sans-serif",
                size: 12,
              },
            },
          },
          tooltip: {
            backgroundColor: darkMode ? '#0f172a' : '#1e293b',
            titleColor: '#f8fafc',
            bodyColor: '#e2e8f0',
            padding: 10,
            cornerRadius: 6,
          },
        },
        scales: isRadial
          ? undefined
          : {
              x: {
                ticks: {
                  color: textColor,
                  font: { size: 11, family: "'DM Sans', system-ui, sans-serif" },
                },
                grid: { color: horizontal ? gridColor : 'transparent' },
              },
              y: {
                beginAtZero: true,
                ticks: {
                  color: textColor,
                  precision: 0,
                  font: { size: 11, family: "'JetBrains Mono', monospace" },
                },
                grid: { color: horizontal ? 'transparent' : gridColor },
              },
            },
      },
    };

    chartRef.current = new Chart(canvas, config);

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [type, labels, datasets, darkMode, horizontal]);

  return (
    <div style={{ height }} className="relative w-full">
      <canvas ref={canvasRef} />
    </div>
  );
}
