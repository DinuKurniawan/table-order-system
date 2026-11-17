import { Download, Wallet, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/admin/section-card";
import { PillBadge } from "@/components/admin/pill-badge";
import { EmptyState } from "@/components/admin/empty-state";

export default function AdminFinancePage() {
  return (
    <div className="space-y-6">
      <SectionCard
        title="Laporan Keuangan & Arus Kas"
        subtitle="Analisis pemasukan omzet penjualan dan pengeluaran operasional kafe."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-border text-xs gap-1.5"
            >
              <Calendar className="size-3.5" />
              Bulan Ini
            </Button>
            <Button
              size="sm"
              className="rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium gap-1.5 shadow-sm"
            >
              <Download className="size-4" />
              Ekspor Laporan
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <PillBadge variant="success">Total Omzet: Rp 1.450.000</PillBadge>
            <PillBadge variant="danger">Pengeluaran: Rp 320.000</PillBadge>
            <PillBadge variant="primary">Laba Bersih: Rp 1.130.000</PillBadge>
          </div>

          <EmptyState
            icon={Wallet}
            title="Tabel Transaksi & Jurnal Keuangan"
            description="Detail histori transaksi debit/kredit, filter rentang tanggal, dan grafik arus kas akan diimplementasikan pada modul keuangan."
          />
        </div>
      </SectionCard>
    </div>
  );
}
