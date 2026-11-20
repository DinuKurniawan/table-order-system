import "server-only";
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
 */
export async function getPublicMenu(input: {
  token: string;
  search?: string;
  category?: string;
}): Promise<PublicMenuProduct[]> {
  if (!input.token || !(await findActiveTableByToken(input.token))) {
    throw new AppError(
      "NOT_FOUND",
      "Meja tidak aktif atau tidak ditemukan",
      404
    );
  }

  const where: Prisma.ProductWhereInput = { deletedAt: null, isActive: true };

  if (input.search) {
    where.name = {
      contains: input.search.slice(0, 80),
      mode: "insensitive",
    };
  }

  const category = input.category;
  if (category === "makanan" || category === "food") {
    where.category = { type: "FOOD" };
  } else if (category === "kopi" || category === "coffee") {
    where.category = { type: "DRINK", subtype: "COFFEE" };
  } else if (category === "non-kopi" || category === "non-coffee") {
    where.category = { type: "DRINK", subtype: "NON_COFFEE" };
  }

  const products = await prisma.product.findMany({
    where,
    select: publicProductSelect,
    orderBy: { name: "asc" },
  });

  return products.map(toPublicProduct);
}

/** Detail satu produk publik; tetap divalidasi terhadap meja aktif. */
export async function getPublicProduct(input: {
  token: string;
  productId: string;
}): Promise<PublicMenuProduct> {
  if (!input.token || !(await findActiveTableByToken(input.token))) {
    throw new AppError(
      "NOT_FOUND",
      "Meja tidak aktif atau tidak ditemukan",
      404
    );
  }

  const product = await prisma.product.findFirst({
    where: { id: input.productId, deletedAt: null, isActive: true },
    select: publicProductSelect,
  });

  if (!product) {
    throw new AppError("NOT_FOUND", "Produk tidak ditemukan", 404);
  }

  return toPublicProduct(product);
}
