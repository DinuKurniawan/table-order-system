"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatRupiah } from "@/lib/utils";
import type { FinanceOverview } from "@/server/services/finance";

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

export function FinanceChart({
  series,
  granularity,
  showIncome,
  showExpense,
}: {
  series: FinanceOverview["series"];
  granularity: string;
  showIncome: boolean;
  showExpense: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0E8F66" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#0E8F66" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F59A2B" stopOpacity={0.24} />
            <stop offset="100%" stopColor="#F59A2B" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDEDF3" />
        <XAxis
          dataKey="bucket"
          tickFormatter={(value: string) => bucketLabel(value, granularity)}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "#5B5B73" }}
          minTickGap={16}
        />
        <YAxis
          tickFormatter={(value: number) => compactRupiah(value)}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "#5B5B73" }}
          width={48}
        />
        <Tooltip
          formatter={(value, name) => [
            formatRupiah(Number(value)),
            name === "income" ? "Pemasukan" : "Pengeluaran",
          ]}
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
        {showIncome && (
          <Area
            type="monotone"
            dataKey="income"
            name="income"
            stroke="#0E8F66"
            strokeWidth={2}
            fill="url(#incomeFill)"
          />
        )}
        {showExpense && (
          <Area
            type="monotone"
            dataKey="expense"
            name="expense"
            stroke="#F59A2B"
            strokeWidth={2}
            fill="url(#expenseFill)"
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
