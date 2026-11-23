import "server-only";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { parseSizePrices, priceForSize } from "@/lib/size-pricing";
import type { CupSize } from "@/lib/size-pricing";

export interface PricingItem {
  productId: string;
  quantity: number;
  size?: CupSize;
}

/**
 * Satu jalur perhitungan subtotal untuk preview voucher dan checkout.
 * Harga selalu dari DB, tidak pernah dari payload client.
 */
export async function resolveOrderPricing(items: PricingItem[]) {
  const productIds = items.map((item) => item.productId);
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      deletedAt: null,
      isActive: true,
    },
    include: { category: { select: { type: true } } },
  });
  const productMap = new Map(products.map((product) => [product.id, product]));

  const linePrices = items.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Salah satu produk tidak tersedia atau sudah tidak aktif",
        400
      );
    }
    if (item.size && product.category.type !== "DRINK") {
      throw new AppError("VALIDATION_ERROR", "Size hanya untuk minuman", 400);
    }
    // Harga size hanya berlaku untuk minuman; makanan selalu harga dasar.
    return product.category.type === "DRINK"
      ? priceForSize(product.price, parseSizePrices(product.sizePrices), item.size)
      : product.price;
  });

  const subtotal = items.reduce(
    (sum, item, index) => sum + linePrices[index] * item.quantity,
    0
  );

  return { products, productMap, linePrices, subtotal };
}
