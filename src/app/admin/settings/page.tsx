import { Save, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/admin/section-card";
import { PillBadge } from "@/components/admin/pill-badge";
import { EmptyState } from "@/components/admin/empty-state";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <SectionCard
        title="Pengaturan Kafe & Sistem"
        subtitle="Konfigurasi nama toko, nomor rekening transfer manual, pajak, servis, dan kunci integrasi."
        action={
          <div className="flex items-center gap-2">
            <PillBadge variant="success">Toko Buka</PillBadge>
            <Button
              size="sm"
              className="rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium gap-1.5 shadow-sm"
            >
              <Save className="size-4" />
              Simpan Pengaturan
            </Button>
          </div>
        }
      >
        <EmptyState
          icon={Settings}
          title="Panel Konfigurasi Toko"
          description="Formulir pengaturan profil kafe, rekening bank / QRIS manual, upload logo toko, dan pengaturan operasional akan dihubungkan pada modul pengaturan."
        />
      </SectionCard>
    </div>
  );
}
