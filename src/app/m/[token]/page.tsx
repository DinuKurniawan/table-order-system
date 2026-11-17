"use client";

import { PrismaClient, Table } from "@prisma/client";
import Link from "next/link";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

const prisma = new PrismaClient();

export default async function MejaPage({
  params,
}: {
  params: { token: string };
}) {
  const { token } = params;

  // Cari meja berdasarkan token
  const table: Table | null = await prisma.table.findUnique({
    where: { token },
    select: {
      id: true,
      name: true,
      isActive: true,
      area: true,
      createdAt: true,
    },
  });

  if (!table) {
    const router = useRouter();
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-text-muted">
        <div className="rounded-2xl bg-surface p-8 max-w-sm">
          <ShieldAlert className="size-6 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-text-strong">Meja tidak ditemukan</h1>
          <p className="text-base mt-2">
            Token meja `${token}` tidak dikenali atau meja telah dinonaktifkan.
          </p>
          <p className="text-sm mt-4">
            <a href="/" className="underline text-primary-600">Kembali ke halaman utama</a>
          </p>
        </div>
      </div>
    );
  }

  // Meja aktif tapi token tidak cocok (tidak seharusnya terjadi)
  if (!table.isActive) {
    const router = useRouter();
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-text-muted">
        <div className="rounded-2xl bg-surface p-8 max-w-sm">
          <ShieldAlert className="size-6 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-text-strong">Meja Tidak Aktif</h1>
          <p className="text-base mt-2">
            Meja `${table.name}` saat ini tidak aktif. Silakan hubungi kafe.
          </p>
          <p className="text-sm mt-4">
            <a href="/" className="underline text-primary-600">Kembali ke halaman utama</a>
          </p>
        </div>
      </div>
    );
  }

  // Meja aktif: arahkan ke halaman menu customer (belum diimplementasikan penuh)
  return (
    <div className="min-h-screen bg-app flex flex-col items-center justify-center p-6">
      <h1 className="text-2xl font-bold text-text-strong">Meja {table.name} terdeteksi</h1>
      <p className="text-base text-text-muted mt-2">
        Silakan scan QR code atau kunjungi menu untuk memesan.
      </p>
      <Button
        asChild
        variant="outline"
        className="my-4 rounded-xl border-border px-6 py-2 text-sm"
      >
        <a href="/m/demo-table" className="underline text-primary-600">
          Lihat Menu Meja
        </a>
      </Button>
    </div>
  );
}