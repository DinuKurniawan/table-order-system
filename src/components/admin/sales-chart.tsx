"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatRupiah } from "@/lib/utils";
import type { DashboardSeriesPoint } from "@/server/services/dashboard";

type SeriesKey = "pemasukan" | "pengeluaran" | "pesanan";

const SERIES: Array<{
  key: SeriesKey;
  color: string;
  axis: "money" | "orders";
}> = [
  { key: "pemasukan", color: "#0E8F66", axis: "money" },
  { key: "pengeluaran", color: "#F59A2B", axis: "money" },
  { key: "pesanan", color: "#4B2FE0", axis: "orders" },
];

function compactRupiah(value: number): string {
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

function bucketLabel(bucket: string, granularity: string): string {
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

export function SalesChart({
  data,
  granularity,
  visible,
}: {
  data: DashboardSeriesPoint[];
  granularity: string;
  visible: Record<SeriesKey, boolean>;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#E7E7EF" />
        <XAxis
          dataKey="tanggal"
          tickFormatter={(value: string) => bucketLabel(value, granularity)}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "#5B5B73" }}
          minTickGap={20}
        />
        <YAxis
          yAxisId="money"
          tickFormatter={(value: number) => compactRupiah(value)}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "#5B5B73" }}
          width={48}
        />
        <YAxis
          yAxisId="orders"
          orientation="right"
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "#5B5B73" }}
          width={28}
        />
        <Tooltip
          formatter={(value, name) => {
            if (name === "pesanan") {
              return [`${Number(value)} pesanan`, "Pesanan"];
            }
            return [
              formatRupiah(Number(value)),
              name === "pemasukan" ? "Pemasukan" : "Pengeluaran",
            ];
          }}
          labelFormatter={(label) => bucketLabel(String(label), granularity)}
          contentStyle={{
            backgroundColor: "#fff",
            borderRadius: 14,
            border: "1px solid #EDEDF3",
            boxShadow: "0 12px 32px rgba(24, 24, 40, 0.12)",
            fontSize: 12,
          }}
          labelStyle={{ color: "#181828", fontWeight: 600 }}
          itemStyle={{ padding: 0 }}
        />
        {SERIES.map((option) => {
          if (!visible[option.key]) return null;
          return (
            <Line
              key={option.key}
              yAxisId={option.axis}
              type="monotone"
              dataKey={option.key}
              name={option.key}
              stroke={option.color}
              strokeWidth={2.2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}
