"use client";

import * as React from "react";

/**
 * Grafik garis/area ringan berbasis SVG. Pengganti Recharts: tidak ada
 * dependency chart, tidak ada bundle 100 KB+, dan bisa dirender di server.
 */
export type ChartPoint = Record<string, string | number>;

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  axis?: "left" | "right";
  area?: boolean;
  format: (value: number) => string;
}

interface TimeSeriesChartProps {
  data: ChartPoint[];
  bucketKey: string;
  series: ChartSeries[];
  xLabel: (bucket: string) => string;
  leftFormat: (value: number) => string;
  rightFormat?: (value: number) => string;
  height?: number;
}

const PAD = { top: 12, right: 44, bottom: 28, left: 52 };

function maxOf(data: ChartPoint[], keys: string[]): number {
  let max = 0;
  for (const point of data) {
    for (const key of keys) {
      const value = Number(point[key]);
      if (Number.isFinite(value) && value > max) max = value;
    }
  }
  return max > 0 ? max * 1.12 : 1;
}

/** Catmull-Rom -> cubic Bezier, supaya garis tetap halus tanpa d3. */
function smoothPath(points: Array<[number, number]>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function niceTicks(max: number, count: number): number[] {
  return Array.from({ length: count + 1 }, (_, i) => (max * i) / count);
}

export function TimeSeriesChart({
  data,
  bucketKey,
  series,
  xLabel,
  leftFormat,
  rightFormat,
  height = 320,
}: TimeSeriesChartProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(720);
  const [hover, setHover] = React.useState<number | null>(null);

  React.useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next) setWidth(Math.max(280, Math.round(next)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const leftSeries = series.filter((item) => (item.axis ?? "left") === "left");
  const rightSeries = series.filter((item) => item.axis === "right");
  const hasRight = rightSeries.length > 0;

  const innerW = Math.max(1, width - PAD.left - PAD.right);
  const innerH = Math.max(1, height - PAD.top - PAD.bottom);
  const leftMax = maxOf(data, leftSeries.map((item) => item.key));
  const rightMax = hasRight ? maxOf(data, rightSeries.map((item) => item.key)) : 1;

  const x = (index: number) =>
    PAD.left +
    (data.length <= 1 ? innerW / 2 : (index * innerW) / (data.length - 1));
  const y = (value: number, axis: "left" | "right") =>
    PAD.top +
    innerH -
    Math.min(1, Math.max(0, value / (axis === "left" ? leftMax : rightMax))) *
      innerH;

  const tickCount = 4;
  const leftTicks = niceTicks(leftMax, tickCount);
  const rightTicks = niceTicks(rightMax, tickCount);

  const labelCount = Math.min(6, Math.max(2, data.length));
  const labelIndices = Array.from({ length: labelCount }, (_, index) =>
    Math.round((index * (data.length - 1)) / (labelCount - 1))
  ).filter((value, index, array) => array.indexOf(value) === index);

  const active = hover !== null ? data[hover] : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ height }}
      onMouseLeave={() => setHover(null)}
    >
      <svg
        role="img"
        aria-label={`Grafik ${series.map((item) => item.label).join(", ")}`}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block max-w-full overflow-visible"
        onMouseMove={(event) => {
          if (data.length === 0) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const relX =
            ((event.clientX - rect.left) / rect.width) * width;
          const index = Math.round(
            ((relX - PAD.left) / innerW) * (data.length - 1)
          );
          setHover(Math.min(data.length - 1, Math.max(0, index)));
        }}
      >
        {leftTicks.map((tick) => (
          <g key={`left-${tick}`}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(tick, "left")}
              y2={y(tick, "left")}
              stroke="#EDEDF3"
              strokeDasharray="4 4"
            />
            <text
              x={PAD.left - 8}
              y={y(tick, "left") + 4}
              textAnchor="end"
              fontSize={11}
              fill="#5B5B73"
            >
              {leftFormat(tick)}
            </text>
          </g>
        ))}

        {hasRight &&
          rightTicks.map((tick) => (
            <text
              key={`right-${tick}`}
              x={width - PAD.right + 8}
              y={y(tick, "right") + 4}
              textAnchor="start"
              fontSize={11}
              fill="#5B5B73"
            >
              {rightFormat ? rightFormat(tick) : Math.round(tick)}
            </text>
          ))}

        {labelIndices.map((index) => (
          <text
            key={`x-${index}`}
            x={x(index)}
            y={height - 8}
            textAnchor={
              index === 0
                ? "start"
                : index === data.length - 1
                  ? "end"
                  : "middle"
            }
            fontSize={11}
            fill="#5B5B73"
          >
            {xLabel(String(data[index][bucketKey]))}
          </text>
        ))}

        {series.map((item) => {
          const axis = item.axis ?? "left";
          const points = data.map(
            (point, index) =>
              [x(index), y(Number(point[item.key]) || 0, axis)] as [
                number,
                number,
              ]
          );
          const path = smoothPath(points);
          return (
            <g key={item.key}>
              {item.area && (
                <>
                  <defs>
                    <linearGradient
                      id={`fill-${item.key}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor={item.color}
                        stopOpacity={0.28}
                      />
                      <stop
                        offset="100%"
                        stopColor={item.color}
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>
                  <path
                    d={`${path} L ${points[points.length - 1]?.[0] ?? PAD.left} ${
                      PAD.top + innerH
                    } L ${points[0]?.[0] ?? PAD.left} ${PAD.top + innerH} Z`}
                    fill={`url(#fill-${item.key})`}
                  />
                </>
              )}
              <path
                d={path}
                fill="none"
                stroke={item.color}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          );
        })}

        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.top}
            y2={PAD.top + innerH}
            stroke="#C9C9D6"
            strokeDasharray="4 4"
          />
        )}

        {hover !== null &&
          series.map((item) => (
            <circle
              key={`dot-${item.key}`}
              cx={x(hover)}
              cy={y(
                Number(data[hover][item.key]) || 0,
                item.axis ?? "left"
              )}
              r={4}
              fill="#fff"
              stroke={item.color}
              strokeWidth={2}
            />
          ))}
      </svg>

      {active && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 min-w-36 rounded-[14px] border border-[#EDEDF3] bg-white px-3 py-2 text-xs shadow-[0_12px_32px_rgba(24,24,40,0.12)]"
          style={{
            left: `${(x(hover) / width) * 100}%`,
            top: 8,
            transform:
              hover > data.length / 2 ? "translateX(-105%)" : "translateX(8px)",
          }}
        >
          <p className="mb-1 font-semibold text-[#181828]">
            {xLabel(String(active[bucketKey]))}
          </p>
          {series.map((item) => (
            <p
              key={`tip-${item.key}`}
              className="flex items-center justify-between gap-3 text-text-muted"
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </span>
              <span className="font-medium text-text-strong">
                {item.format(Number(active[item.key]) || 0)}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function compactRupiah(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}jt`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(0)}rb`;
  }
  return String(value);
}

export function bucketLabel(bucket: string, granularity: string): string {
  if (granularity === "month") {
    const [year, month] = bucket.split("-");
    return new Intl.DateTimeFormat("id-ID", {
      month: "short",
      year: "2-digit",
    }).format(new Date(Number(year), Number(month) - 1, 1));
  }
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
  }).format(new Date(`${bucket}T00:00:00+07:00`));
}
