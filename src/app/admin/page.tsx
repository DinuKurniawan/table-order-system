import {
  ShoppingBag,
  Clock,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/admin/stat-card";
import { SectionCard } from "@/components/admin/section-card";
import { PillBadge } from "@/components/admin/pill-badge";
import { EmptyState } from "@/components/admin/empty-state";

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      {/* 4 Stat Cards Jobie (Indigo, Blue, Green, Lemon) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <StatCard
          title="Pesanan Hari Ini"
          value="48"
          subtext="▲ 12% dibanding kemarin"
          icon={ShoppingBag}
          variant="indigo"
        />
        <StatCard
          title="Menunggu Verifikasi"
          value="3"
          subtext="Perlu konfirmasi pembayaran"
          icon={Clock}
          variant="blue"
        />
        <StatCard
          title="Pendapatan Hari Ini"
          value="Rp 1.450.000"
          subtext="Laba kotor hari berjalan"
          icon={TrendingUp}
          variant="green"
        />
        <StatCard
          title="Stok Menipis"
          value="2"
          subtext="Produk butuh restok"
          icon={AlertTriangle}
          variant="lemon"
        />
      </div>

      {/* Main Grid: Chart / Analytics & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 span): Sales Overview & Recent Orders */}
        <div className="lg:col-span-2 space-y-6">
          <SectionCard
            title="Aktivitas Penjualan & Pesanan"
            subtitle="Ringkasan transaksi dan tren omzet hari ini"
            action={
              <Link href="/admin/finance">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full text-xs font-semibold gap-1 border-border hover:bg-surface-muted"
                >
                  Detail Keuangan
                  <ArrowRight className="size-3.5" />
                </Button>
              </Link>
            }
          >
            <div className="h-64 rounded-2xl bg-surface-muted border border-border/70 flex flex-col items-center justify-center text-center p-6">
              <div className="size-12 rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center mb-3">
                <TrendingUp className="size-6" />
              </div>
              <p className="text-sm font-semibold text-text-strong">
                Grafik Analitik Transaksi Realtime
              </p>
              <p className="text-xs text-text-muted max-w-sm mt-1">
                Visualisasi grafik garis omzet dan volume pesanan per jam akan aktif terhubung ke database pada modul keuangan.
              </p>
            </div>
          </SectionCard>

          <SectionCard
            title="Antrean Pesanan Terbaru"
            subtitle="Pantau pesanan customer dari meja secara realtime"
            action={
              <div className="flex items-center gap-2">
                <PillBadge variant="success">3 Baru</PillBadge>
              </div>
            }
          >
            <EmptyState
              title="Belum ada pesanan aktif"
              description="Ketika pengunjung melakukan checkout pesanan via barcode meja, pesanan akan muncul di sini secara otomatis."
            />
          </SectionCard>
        </div>

        {/* Right Column (1 span): Categories & Quick Actions */}
        <div className="space-y-6">
          <SectionCard
            title="Status Kategori Menu"
            subtitle="Ketersediaan menu aktif"
            action={
              <Link href="/admin/menu">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-xs text-primary-600 hover:text-primary-700 hover:bg-primary-50 p-2 h-auto"
                >
                  Kelola
                </Button>
              </Link>
            }
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-muted border border-border/60">
                <div className="flex items-center gap-2.5">
                  <span className="size-2.5 rounded-full bg-accent-green" />
                  <span className="text-xs font-semibold text-text-strong">
                    Kopi & Espresso
                  </span>
                </div>
                <PillBadge variant="success">6 Menu Aktif</PillBadge>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-muted border border-border/60">
                <div className="flex items-center gap-2.5">
                  <span className="size-2.5 rounded-full bg-accent-blue" />
                  <span className="text-xs font-semibold text-text-strong">
                    Non Kopi & Teh
                  </span>
                </div>
                <PillBadge variant="info">3 Menu Aktif</PillBadge>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-muted border border-border/60">
                <div className="flex items-center gap-2.5">
                  <span className="size-2.5 rounded-full bg-accent-orange" />
                  <span className="text-xs font-semibold text-text-strong">
                    Makanan & Camilan
                  </span>
                </div>
                <PillBadge variant="warning">3 Menu Aktif</PillBadge>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Aksi Cepat Admin"
            subtitle="Pintasan modul utama kafe"
          >
            <div className="grid grid-cols-1 gap-2.5">
              <Link href="/admin/menu">
                <Button
                  variant="outline"
                  className="w-full justify-start rounded-xl text-xs font-medium h-10 border-border hover:bg-surface-muted"
                >
                  <Plus className="mr-2 size-4 text-primary-600" />
                  Tambah Menu Baru
                </Button>
              </Link>

              <Link href="/admin/stock">
                <Button
                  variant="outline"
                  className="w-full justify-start rounded-xl text-xs font-medium h-10 border-border hover:bg-surface-muted"
                >
                  <Plus className="mr-2 size-4 text-accent-green" />
                  Pencatatan Stok Masuk
                </Button>
              </Link>

              <Link href="/admin/tables">
                <Button
                  variant="outline"
                  className="w-full justify-start rounded-xl text-xs font-medium h-10 border-border hover:bg-surface-muted"
                >
                  <Plus className="mr-2 size-4 text-accent-blue" />
                  Unduh QR Meja (PDF)
                </Button>
              </Link>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
