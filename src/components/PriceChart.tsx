"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCzk, formatDate } from "@/lib/format";

export interface PricePoint {
  price_date: string;
  price: number;
  supplier_name: string;
  track: "invoiced" | "offered";
}

const COLORS = ["#856442", "#2f7d63", "#8a5b8f", "#b06a2c", "#3b6ea5", "#a03a4a", "#5c7a3a"];

/**
 * Vývoj ceny materiálu v čase — jedna čára na dvojici dodavatel + druh ceny.
 * Nabídkové ceny jsou čárkovaně, ať je na první pohled vidět, co je závazné.
 */
export default function PriceChart({ points }: { points: PricePoint[] }) {
  const series = Array.from(
    new Set(
      points.map((p) =>
        p.track === "offered" ? `${p.supplier_name} (nabídka)` : p.supplier_name,
      ),
    ),
  );
  const keyOf = (p: PricePoint) =>
    p.track === "offered" ? `${p.supplier_name} (nabídka)` : p.supplier_name;
  const dates = Array.from(new Set(points.map((p) => p.price_date))).sort();

  // Recharts potřebuje jeden řádek na datum a sloupec na sérii.
  const data = dates.map((date) => {
    const row: Record<string, string | number | null> = { date };
    for (const name of series) {
      const match = points.find((p) => p.price_date === date && keyOf(p) === name);
      row[name] = match ? match.price : null;
    }
    return row;
  });

  if (points.length < 2) {
    return (
      <p className="p-6 text-sm text-bark-600">
        Na graf je potřeba aspoň dva nákupy. Zatím jich máme {points.length}.
      </p>
    );
  }

  return (
    <div className="h-72 w-full p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="#e3d7c3" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={(v: string) => formatDate(v)}
            tick={{ fontSize: 12, fill: "#6b4f37" }}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "#6b4f37" }}
            width={70}
            tickFormatter={(v: number) => v.toLocaleString("cs-CZ")}
          />
          <Tooltip
            formatter={(value: number) => formatCzk(value)}
            labelFormatter={(label: string) => formatDate(label)}
            contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e3d7c3" }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((name, i) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              strokeDasharray={name.endsWith("(nabídka)") ? "5 4" : undefined}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
