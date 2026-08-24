import { leverageRatioCurve, REFERENCE_TRAIL_BIKE } from "@framer/schema/browser";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

interface LeverageCurveChartProps {
  className?: string;
}

export function LeverageCurveChart({ className }: LeverageCurveChartProps) {
  const data = leverageRatioCurve(REFERENCE_TRAIL_BIKE, 20).slice(1);

  return (
    <div className={className}>
      <p className="mb-2 text-xs text-neutral-500">Leverage ratio vs. travel</p>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="travelMm"
            tick={{ fill: "#737373", fontSize: 10 }}
            axisLine={{ stroke: "#404040" }}
            tickLine={false}
            label={{ value: "Travel (mm)", position: "insideBottom", offset: -2, fill: "#737373", fontSize: 10 }}
          />
          <YAxis
            domain={[1.5, 4]}
            tick={{ fill: "#737373", fontSize: 10 }}
            axisLine={{ stroke: "#404040" }}
            tickLine={false}
            width={28}
          />
          <Tooltip
            contentStyle={{ background: "#171717", border: "1px solid #404040", borderRadius: 8, fontSize: 12 }}
            labelFormatter={(v) => `${v} mm`}
            formatter={(v: number) => [v.toFixed(2), "Leverage"]}
          />
          <Line type="monotone" dataKey="leverageRatio" stroke="#60a5fa" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
