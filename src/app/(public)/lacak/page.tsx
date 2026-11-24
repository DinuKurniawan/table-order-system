import type { Metadata } from "next";
import { connection } from "next/server";
import {
  findActiveTableByToken,
  listActiveTableNames,
} from "@/server/services/tables";
import { TrackForm } from "./track-form";

export const metadata: Metadata = {
  title: "Lacak Pesanan",
  description:
    "Pantau status pesanan Anda dengan nama pemesan dan nomor meja.",
  robots: { index: false, follow: false },
};

// Butuh searchParams + data meja per request; jangan diprerender.
export const instant = false;

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ meja?: string | string[] }>;
}) {
  // Data meja per request; jangan dirender statis saat build.
  await connection();
  const { meja } = await searchParams;
  const tableToken = typeof meja === "string" ? meja : null;

  // Hanya token dari barcode meja aktif yang boleh dipakai. Meja ditentukan
  // server, bukan input pengguna, agar tidak bisa melacak meja lain.
  const [tables, table] = await Promise.all([
    listActiveTableNames(),
    tableToken ? findActiveTableByToken(tableToken) : Promise.resolve(null),
  ]);

  return (
    <main className="min-h-screen bg-app px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-xl">
        <TrackForm
          tables={tables}
          tableToken={table ? tableToken : null}
          lockedTable={table?.name ?? null}
        />
      </div>
    </main>
  );
}
