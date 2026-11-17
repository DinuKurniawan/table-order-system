import { Plus, Users, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/admin/section-card";
import { PillBadge } from "@/components/admin/pill-badge";
import { EmptyState } from "@/components/admin/empty-state";

export default function AdminCashiersPage() {
  return (
    <div className="space-y-6">
      <SectionCard
        title="Manajemen Akun Kasir"
        subtitle="Kelola staf kasir yang berhak login ke sistem dan memverifikasi pesanan meja."
        action={
          <Button
            size="sm"
            className="rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium gap-1.5 shadow-sm"
          >
            <Plus className="size-4" />
            Tambah Kasir
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <PillBadge variant="success">
              <UserCheck className="size-3.5 mr-1" />
              1 Kasir Aktif
            </PillBadge>
          </div>

          <EmptyState
            icon={Users}
            title="Daftar Kasir Terdaftar"
            description="Tabel pengelolaan akun staf kasir (tambah, edit, reset password, dan status aktif) akan dihubungkan pada modul kasir."
          />
        </div>
      </SectionCard>
    </div>
  );
}
