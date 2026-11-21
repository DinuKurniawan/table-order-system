"use client";

import { formatRupiah } from "@/lib/utils";
import type { DashboardSeriesPoint } from "@/server/services/dashboard";
import {
  TimeSeriesChart,
  bucketLabel,
  compactRupiah,
  type ChartSeries,
} from "@/components/admin/time-series-chart";

type SeriesKey = "pemasukan" | "pengeluaran" | "pesanan";

const SERIES: Array<ChartSeries & { key: SeriesKey }> = [
  {
    key: "pemasukan",
    label: "Pemasukan",
    color: "#0E8F66",
    axis: "left",
    format: formatRupiah,
  },
  {
    key: "pengeluaran",
    label: "Pengeluaran",
    color: "#F59A2B",
    axis: "left",
    format: formatRupiah,
  },
  {
    key: "pesanan",
    label: "Pesanan",
    color: "#4B2FE0",
    axis: "right",
    format: (value) => `${value} pesanan`,
  },
];

export function SalesChart({
  data,
  granularity,
  visible,
}: {
  data: DashboardSeriesPoint[];
  granularity: string;
  visible: Record<SeriesKey, boolean>;
}) {
  const active = SERIES.filter((item) => visible[item.key]);

  return (
    <TimeSeriesChart
      data={data as unknown as Array<Record<string, string | number>>}
      bucketKey="tanggal"
      series={active}
      xLabel={(bucket) => bucketLabel(bucket, granularity)}
      leftFormat={compactRupiah}
      rightFormat={(value) => String(Math.round(value))}
      height={320}
    />
  );
}
