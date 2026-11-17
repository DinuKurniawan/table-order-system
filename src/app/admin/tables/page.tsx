import { Plus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/admin/section-card";
import { PillBadge } from "@/components/admin/pill-badge";
import { TableSkeleton } from "@/components/admin/table-skeleton";

export default function AdminTablesPage() {
  return (
    <div className="space-y-6">
      <SectionCard
        title="Meja & Barcode QR Code"
        subtitle="Kelola nomor meja kafe, cetak lembar stiker QR, dan pantau status meja yang sedang aktif terisi."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-border text-xs gap-1.5"
            >
              <Printer className="size-3.5" />
              Cetak Semua QR
            </Button>
            <Button
              size="sm"
              className="rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium gap-1.5 shadow-sm"
            >
              <Plus className="size-4" />
              Tambah Meja
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <PillBadge variant="primary">10 Meja Terdaftar</PillBadge>
            <PillBadge variant="success">Meja Aktif: 10</PillBadge>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <TableSkeleton rows={4} columns={4} />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
