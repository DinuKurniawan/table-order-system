"use client";

import { formatRupiah } from "@/lib/utils";
import type { FinanceOverview } from "@/server/services/finance";
import {
  TimeSeriesChart,
  bucketLabel,
  compactRupiah,
  type ChartSeries,
} from "@/components/admin/time-series-chart";

const SERIES: ChartSeries[] = [
  {
    key: "income",
    label: "Pemasukan",
    color: "#0E8F66",
    area: true,
    format: formatRupiah,
  },
  {
    key: "expense",
    label: "Pengeluaran",
    color: "#F59A2B",
    area: true,
    format: formatRupiah,
  },
];

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
  const active = SERIES.filter((item) =>
    item.key === "income" ? showIncome : showExpense
  );

  return (
    <TimeSeriesChart
      data={series as unknown as Array<Record<string, string | number>>}
      bucketKey="bucket"
      series={active}
      xLabel={(bucket) => bucketLabel(bucket, granularity)}
      leftFormat={compactRupiah}
      height={288}
    />
  );
}
