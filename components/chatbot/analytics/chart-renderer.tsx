"use client";

import { memo, useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertCircle } from "lucide-react";

export interface ChartSeries {
  key: string;
  label?: string;
  color?: string;
}

export interface ChartSpec {
  type: "bar" | "line" | "area" | "pie" | "donut";
  title?: string;
  description?: string;
  data: Array<Record<string, string | number>>;
  x?: string;
  y?: string; // for pie/donut value key
  nameKey?: string; // for pie/donut label key
  series?: ChartSeries[];
  stacked?: boolean;
  height?: number;
  unit?: string;
}

const CHART_PALETTE = [
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ec4899", // pink
  "#3b82f6", // blue
  "#ef4444", // red
  "#14b8a6", // teal
  "#f97316", // orange
  "#a855f7", // purple
];

function pickColor(idx: number, provided?: string): string {
  if (provided) return provided;
  return CHART_PALETTE[idx % CHART_PALETTE.length];
}

function formatNumber(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return String(value ?? "");
  }
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toFixed(2);
}

interface TooltipPayloadEntry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string;
}

function CustomTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
  unit?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-border/70 bg-background/95 backdrop-blur px-3 py-2 shadow-lg text-xs">
      {label !== undefined && (
        <div className="font-semibold text-foreground mb-1">{String(label)}</div>
      )}
      <div className="space-y-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-mono font-semibold text-foreground">
              {formatNumber(entry.value)}
              {unit ? ` ${unit}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const AXIS_STYLE = {
  fontSize: 11,
  fill: "hsl(var(--muted-foreground))",
};

function ChartRendererImpl({ spec }: { spec: ChartSpec }) {
  const height = spec.height ?? 260;
  const data = spec.data;

  // Derive series: explicit spec, or everything numeric except x.
  const effectiveSeries = useMemo<ChartSeries[]>(() => {
    if (spec.series && spec.series.length > 0) return spec.series;
    if (!data || data.length === 0) return [];
    const first = data[0];
    const keys = Object.keys(first).filter((k) => {
      if (k === spec.x || k === spec.nameKey) return false;
      const v = first[k];
      return typeof v === "number";
    });
    return keys.map((k) => ({ key: k, label: k }));
  }, [spec.series, spec.x, spec.nameKey, data]);

  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
        <AlertCircle className="h-3.5 w-3.5" />
        Chart has no data.
      </div>
    );
  }

  const renderChart = () => {
    switch (spec.type) {
      case "line":
        return (
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              vertical={false}
            />
            <XAxis
              dataKey={spec.x ?? "name"}
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))" }}
            />
            <YAxis
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatNumber(v)}
            />
            <Tooltip content={<CustomTooltip unit={spec.unit} />} />
            {effectiveSeries.length > 1 && (
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              />
            )}
            {effectiveSeries.map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label ?? s.key}
                stroke={pickColor(i, s.color)}
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 0, fill: pickColor(i, s.color) }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }}
              />
            ))}
          </LineChart>
        );

      case "area":
        return (
          <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              {effectiveSeries.map((s, i) => {
                const color = pickColor(i, s.color);
                return (
                  <linearGradient
                    key={s.key}
                    id={`chart-area-${s.key}-${i}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                );
              })}
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              vertical={false}
            />
            <XAxis
              dataKey={spec.x ?? "name"}
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))" }}
            />
            <YAxis
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatNumber(v)}
            />
            <Tooltip content={<CustomTooltip unit={spec.unit} />} />
            {effectiveSeries.length > 1 && (
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              />
            )}
            {effectiveSeries.map((s, i) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label ?? s.key}
                stroke={pickColor(i, s.color)}
                strokeWidth={2}
                fill={`url(#chart-area-${s.key}-${i})`}
                stackId={spec.stacked ? "stack" : undefined}
              />
            ))}
          </AreaChart>
        );

      case "pie":
      case "donut": {
        const valueKey = spec.y ?? effectiveSeries[0]?.key ?? "value";
        const nameKey = spec.nameKey ?? spec.x ?? "name";
        const inner = spec.type === "donut" ? "55%" : 0;
        return (
          <PieChart>
            <Tooltip content={<CustomTooltip unit={spec.unit} />} />
            <Pie
              data={data}
              dataKey={valueKey}
              nameKey={nameKey}
              cx="50%"
              cy="50%"
              innerRadius={inner}
              outerRadius="80%"
              paddingAngle={2}
              stroke="hsl(var(--background))"
              strokeWidth={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={pickColor(i)} />
              ))}
            </Pie>
            <Legend
              iconType="circle"
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            />
          </PieChart>
        );
      }

      case "bar":
      default:
        return (
          <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              vertical={false}
            />
            <XAxis
              dataKey={spec.x ?? "name"}
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))" }}
            />
            <YAxis
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatNumber(v)}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
              content={<CustomTooltip unit={spec.unit} />}
            />
            {effectiveSeries.length > 1 && (
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              />
            )}
            {effectiveSeries.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label ?? s.key}
                fill={pickColor(i, s.color)}
                radius={[6, 6, 0, 0]}
                stackId={spec.stacked ? "stack" : undefined}
                maxBarSize={42}
              />
            ))}
          </BarChart>
        );
    }
  };

  return (
    <div className="my-3 rounded-xl border border-border/70 bg-gradient-to-br from-background to-muted/20 p-3 shadow-sm">
      {(spec.title || spec.description) && (
        <div className="mb-2 px-1">
          {spec.title && (
            <div className="text-sm font-semibold text-foreground">
              {spec.title}
            </div>
          )}
          {spec.description && (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {spec.description}
            </div>
          )}
        </div>
      )}
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export const ChartRenderer = memo(ChartRendererImpl);

export function parseChartSpec(raw: string): ChartSpec | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const spec = parsed as ChartSpec;
    if (!spec.type) spec.type = "bar";
    if (!Array.isArray(spec.data)) return null;
    return spec;
  } catch {
    return null;
  }
}
