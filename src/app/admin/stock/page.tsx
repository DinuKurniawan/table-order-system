import { AlertTriangle, Plus, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/admin/section-card";
import { PillBadge } from "@/components/admin/pill-badge";
import { TableSkeleton } from "@/components/admin/table-skeleton";

export default function AdminStockPage() {
  return (
    <div className="space-y-6">
      <SectionCard
        title="Manajemen & Riwayat Stok"
        subtitle="Pantau sisa stok bahan/produk, atur ambang batas minimum, dan lakukan penyesuaian."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-border text-xs gap-1.5"
            >
              <History className="size-3.5" />
              Log Mutasi
            </Button>
            <Button
              size="sm"
              className="rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium gap-1.5 shadow-sm"
            >
              <Plus className="size-4" />
              Catat Stok Masuk
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <PillBadge variant="neutral">Semua Produk (12)</PillBadge>
            <PillBadge variant="warning">
              <AlertTriangle className="size-3 mr-1" />
              Stok Menipis (2)
            </PillBadge>
            <PillBadge variant="danger">Habis (0)</PillBadge>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <TableSkeleton rows={4} columns={6} />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
