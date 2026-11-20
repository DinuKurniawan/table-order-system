import "server-only";
import { unstable_cache } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getPublicUrl } from "@/lib/r2";
import { findActiveTableByToken } from "@/server/services/tables";
import { parseSizePrices, type SizePrices } from "@/lib/size-pricing";

export interface PublicMenuProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  sizePrices: SizePrices | null;
  stock: number;
  trackStock: boolean;
  imageUrl: string | null;
  thumbUrl: string | null;
  category: { name: string; type: string; subtype: string | null } | null;
}

const publicProductSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  sizePrices: true,
  imageKey: true,
  thumbKey: true,
  stock: true,
  trackStock: true,
  category: { select: { name: true, type: true, subtype: true } },
} satisfies Prisma.ProductSelect;

function toPublicProduct({
  imageKey,
  thumbKey,
  ...product
}: Prisma.ProductGetPayload<{ select: typeof publicProductSelect }>): PublicMenuProduct {
  return {
    ...product,
    sizePrices: parseSizePrices(product.sizePrices),
    imageUrl: imageKey ? getPublicUrl(imageKey) : null,
    thumbUrl: thumbKey ? getPublicUrl(thumbKey) : null,
  };
}

/**
 * Katalog publik untuk satu meja aktif. Dipakai route API dan render awal
 * halaman menu agar LCP tidak menunggu fetch client.
 *
 * Katalog di-cache 15 detik (tag `menu`) lalu difilter di memori. Jumlah
 * produk kafe kecil; bila katalog membesar, kembalikan filter ke query DB.
 */
const getCachedPublicProducts = unstable_cache(
  async (): Promise<PublicMenuProduct[]> => {
    const products = await prisma.product.findMany({
      where: { deletedAt: null, isActive: true },
      select: publicProductSelect,
      orderBy: { name: "asc" },
    });
    return products.map(toPublicProduct);
  },
  ["public-menu-products"],
  { revalidate: 15, tags: ["menu"] }
);

function filterPublicMenu(
  products: PublicMenuProduct[],
  input: { search?: string; category?: string }
): PublicMenuProduct[] {
  const term = input.search?.trim().slice(0, 80).toLowerCase();
  const category = input.category;

  return products.filter((product) => {
    if (term && !product.name.toLowerCase().includes(term)) return false;
    if (category === "makanan" || category === "food") {
      return product.category?.type === "FOOD";
    }
    if (category === "kopi" || category === "coffee") {
      return (
        product.category?.type === "DRINK" &&
        product.category.subtype === "COFFEE"
      );
    }
    if (category === "non-kopi" || category === "non-coffee") {
      return (
        product.category?.type === "DRINK" &&
        product.category.subtype === "NON_COFFEE"
      );
    }
    return true;
  });
}

export async function getPublicMenu(input: {
  token: string;
  search?: string;
  category?: string;
}): Promise<PublicMenuProduct[]> {
  // Validasi meja dan katalog berjalan paralel; token tidak valid tetap 404.
  const [table, products] = await Promise.all([
    input.token ? findActiveTableByToken(input.token) : Promise.resolve(null),
    getCachedPublicProducts(),
  ]);

  if (!table) {
    throw new AppError(
      "NOT_FOUND",
      "Meja tidak aktif atau tidak ditemukan",
      404
    );
  }

  return filterPublicMenu(products, input);
}

/** Detail satu produk publik; tetap divalidasi terhadap meja aktif. */
export async function getPublicProduct(input: {
  token: string;
  productId: string;
}): Promise<PublicMenuProduct> {
  const [table, product] = await Promise.all([
    input.token ? findActiveTableByToken(input.token) : Promise.resolve(null),
    prisma.product.findFirst({
      where: { id: input.productId, deletedAt: null, isActive: true },
      select: publicProductSelect,
    }),
  ]);

  if (!table) {
    throw new AppError(
      "NOT_FOUND",
      "Meja tidak aktif atau tidak ditemukan",
      404
    );
  }

  if (!product) {
    throw new AppError("NOT_FOUND", "Produk tidak ditemukan", 404);
  }

  return toPublicProduct(product);
}
