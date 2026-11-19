import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/errors";
import { getPublicMenu, type PublicMenuProduct } from "@/server/services/menu";
import { MenuClient } from "./menu-client";

export const metadata: Metadata = {
  title: "Menu Kafe",
  description: "Pilih menu dan pesan langsung dari meja Anda",
};

// Render server blocking: katalog awal harus ikut HTML pertama (target LCP).
export const instant = false;

export default async function MejaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Render awal di server: LCP tidak menunggu fetch client.
  // Token invalid -> halaman 404; error lain (DB down) dibiarkan naik ke
  // error.tsx agar bisa didiagnosis (audit S-09).
  let initialProducts: PublicMenuProduct[];
  try {
    initialProducts = await getPublicMenu({ token });
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") {
      notFound();
    }
    throw err;
  }

  return <MenuClient token={token} initialProducts={initialProducts} />;
}
