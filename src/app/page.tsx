import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Coffee, ShieldCheck, UtensilsCrossed } from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-app">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-2">
          <Badge variant="secondary" className="px-3 py-1 text-sm bg-primary-50 text-primary-800 border-none font-medium">
            Sistem Pemesanan Realtime F&B
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight text-text-strong sm:text-4xl">
            Selamat Datang di Kafe Kami
          </h1>
          <p className="text-text-muted text-base">
            Pesan makanan & minuman langsung dari meja via QR code, tanpa antre.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="rounded-[18px] border-border shadow-card bg-surface">
            <CardHeader>
              <div className="size-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-700 mb-2">
                <UtensilsCrossed className="size-5" />
              </div>
              <CardTitle className="text-lg text-text-strong">Customer Meja</CardTitle>
              <CardDescription className="text-text-muted">
                Scan QR di meja kafe Anda untuk melihat menu dan memesan langsung.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full bg-primary-600 hover:bg-primary-700 text-white rounded-xl">
                <Link href="/m/demo-table">
                  <Coffee className="mr-2 size-4" /> Buka Menu Demo
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-[18px] border-border shadow-card bg-surface">
            <CardHeader>
              <div className="size-10 rounded-xl bg-accent-blue/10 flex items-center justify-center text-accent-blue mb-2">
                <ShieldCheck className="size-5" />
              </div>
              <CardTitle className="text-lg text-text-strong">Staff & Kasir</CardTitle>
              <CardDescription className="text-text-muted">
                Masuk ke panel kasir untuk memverifikasi pesanan atau panel admin.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full rounded-xl border-border hover:bg-surface-muted">
                <Link href="/login">
                  Masuk ke Sistem
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="text-center text-xs text-text-muted">
          &copy; 2026 Sistem Pemesanan F&B via QR Meja. Hak cipta dilindungi.
        </div>
      </div>
    </div>
  );
}
