import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Utensils } from "lucide-react";

export default function CashierDashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-text-strong">
            Antrean Pesanan Masuk
          </h2>
          <p className="text-sm text-text-muted mt-1">
            Pantau dan verifikasi pembayaran bukti transfer dari customer meja secara realtime.
          </p>
        </div>
        <Badge className="bg-accent-blue/15 text-accent-blue border-none text-xs font-semibold px-3 py-1">
          Realtime Siaga
        </Badge>
      </div>

      <Card className="rounded-[20px] border-border bg-surface shadow-card">
        <CardHeader>
          <div className="size-10 rounded-xl bg-accent-blue/10 flex items-center justify-center text-accent-blue mb-2">
            <Utensils className="size-5" />
          </div>
          <CardTitle className="text-lg text-text-strong">
            Daftar Antrean Pesanan
          </CardTitle>
          <CardDescription className="text-text-muted">
            Tabel antrean pesanan, modal zoom bukti transfer, dan cetak struk kasir akan diimplementasikan pada step berikutnya.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
            Tidak ada pesanan yang perlu diverifikasi saat ini.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
