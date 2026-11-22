import { TicketPercent } from "lucide-react";
import { EmptyState } from "@/components/admin/empty-state";
import { Badge } from "@/components/ui/badge";

export default function AdminVouchersPage() {
  return (
    <section className="rounded-[20px] border border-border bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-text-strong">
            Voucher Diskon
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            Kelola kode promo dan potongan harga untuk pelanggan.
          </p>
        </div>
        <Badge className="bg-primary-50 text-primary-800 border-none text-[10px] font-medium">
          Segera Hadir
        </Badge>
      </div>

      <EmptyState
        className="mt-5"
        icon={TicketPercent}
        title="Halaman masih disiapkan"
        description="Fitur voucher diskon belum tersedia. Halaman ini hanya placeholder rute."
      />
    </section>
  );
}
