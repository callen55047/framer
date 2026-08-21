import { useId } from "react";
import { Area, AreaChart, Label, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PricePoint } from "../lib/api.js";

const SQLITE_DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;

function parseTimestamp(value: string): number {
  const normalized = SQLITE_DATETIME_RE.test(value) ? `${value.replace(" ", "T")}Z` : value;
  return new Date(normalized).getTime();
}

function formatRefreshTick(timestamp: number, spanMs: number): string {
  const date = new Date(timestamp);
  if (spanMs < 48 * 60 * 60 * 1000) {
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTooltipLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PriceHistoryChart({
  pricePoints,
  watchCreatedAt,
  compact = false,
}: {
  pricePoints: PricePoint[];
  watchCreatedAt: string;
  compact?: boolean;
}) {
  const gradientId = useId().replace(/:/g, "");

  if (pricePoints.length === 0) {
    return (
      <p className={`text-center text-sm text-neutral-500 ${compact ? "py-3" : "py-6"}`}>
        No price history yet.
      </p>
    );
  }

  const data = [...pricePoints]
    .sort((a, b) => parseTimestamp(a.scrapedAt) - parseTimestamp(b.scrapedAt))
    .map((p) => ({
      timestamp: parseTimestamp(p.scrapedAt),
      price: p.price,
    }));

  const domainStart = Math.min(parseTimestamp(watchCreatedAt), data[0]!.timestamp);
  const domainEnd = Math.max(Date.now(), data[data.length - 1]!.timestamp);
  const spanMs = domainEnd - domainStart;

  const refreshTicks = data.map((d) => d.timestamp);
  const crowdedTicks = refreshTicks.length > 6;

  if (compact) {
    return (
      <div className="h-20 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id={`${gradientId}-line`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-brand-pink)" />
                <stop offset="50%" stopColor="var(--color-brand-purple)" />
                <stop offset="100%" stopColor="var(--color-brand-blue)" />
              </linearGradient>
              <linearGradient id={`${gradientId}-area`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand-pink)" stopOpacity={0.3} />
                <stop offset="50%" stopColor="var(--color-brand-purple)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--color-brand-blue)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="timestamp" type="number" scale="time" domain={[domainStart, domainEnd]} hide />
            <YAxis hide domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={{ background: "#171717", border: "1px solid #262626", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#a3a3a3" }}
              labelFormatter={(label) => formatTooltipLabel(Number(label))}
              formatter={(value: number) => [`$${value.toFixed(2)}`, "Price"]}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={`url(#${gradientId}-line)`}
              strokeWidth={1.5}
              fill={`url(#${gradientId}-area)`}
              dot={false}
              activeDot={{ r: 3, fill: "var(--color-brand-blue)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 16, bottom: 28, left: 8 }}>
          <defs>
            <linearGradient id={`${gradientId}-line`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--color-brand-pink)" />
              <stop offset="50%" stopColor="var(--color-brand-purple)" />
              <stop offset="100%" stopColor="var(--color-brand-blue)" />
            </linearGradient>
            <linearGradient id={`${gradientId}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-pink)" stopOpacity={0.3} />
              <stop offset="50%" stopColor="var(--color-brand-purple)" stopOpacity={0.2} />
              <stop offset="100%" stopColor="var(--color-brand-blue)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="timestamp"
            type="number"
            scale="time"
            domain={[domainStart, domainEnd]}
            ticks={refreshTicks}
            tickFormatter={(ts) => formatRefreshTick(ts, spanMs)}
            angle={crowdedTicks ? -35 : 0}
            textAnchor={crowdedTicks ? "end" : "middle"}
            height={crowdedTicks ? 50 : 30}
            stroke="#737373"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          >
            <Label value="Time" position="insideBottom" offset={-8} fill="#a3a3a3" fontSize={12} />
          </XAxis>
          <YAxis
            stroke="#737373"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            width={64}
            domain={["auto", "auto"]}
            tickFormatter={(v) => `$${v}`}
          >
            <Label value="Price ($)" angle={-90} position="insideLeft" fill="#a3a3a3" fontSize={12} />
          </YAxis>
          <Tooltip
            contentStyle={{ background: "#171717", border: "1px solid #262626", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#a3a3a3" }}
            labelFormatter={(label) => formatTooltipLabel(Number(label))}
            formatter={(value: number) => [`$${value.toFixed(2)}`, "Price"]}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke={`url(#${gradientId}-line)`}
            strokeWidth={2}
            fill={`url(#${gradientId}-area)`}
            dot={{ r: 3, fill: "var(--color-brand-purple)" }}
            activeDot={{ r: 4, fill: "var(--color-brand-blue)" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
