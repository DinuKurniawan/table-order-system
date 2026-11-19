import type { Metadata } from "next";
import { getPublicMenu } from "@/server/services/menu";
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
  const initialProducts = await getPublicMenu({ token }).catch(() => null);

  return <MenuClient token={token} initialProducts={initialProducts} />;
}
