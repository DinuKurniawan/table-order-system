import "server-only";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { runInTransaction } from "@/lib/tx";
import { getPublicUrl, deleteObject } from "@/lib/r2";
import { env } from "@/lib/env";
import {
  CategoryType,
  DrinkSubtype,
  Prisma,
  Product,
  StockMoveType,
} from "@prisma/client";
import {
  ProductCreateInput,
  ProductListQuery,
  ProductUpdateInput,
  productCreateSchema,
  productUpdateSchema,
} from "@/lib/validators/product";
import { parseSizePrices, type SizePrices } from "@/lib/size-pricing";

export interface ProductDTO {
  id: string;
  name: string;
  description: string | null;
  price: number;
  sizePrices: SizePrices | null;
  imageKey: string | null;
  thumbKey: string | null;
  imageUrl: string | null;
  thumbUrl: string | null;
  category: {
    id: string;
    name: string;
    type: CategoryType;
    subtype: DrinkSubtype | null;
  };
  isActive: boolean;
  trackStock: boolean;
  stock: number;
  lowStockThreshold: number;
  createdAt: string;
}

export interface ProductListResult {
  items: ProductDTO[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

type ProductWithCategory = Product & {
  category: { id: string; name: string; type: CategoryType; subtype: DrinkSubtype | null };
};

function toDTO(product: ProductWithCategory): ProductDTO {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    sizePrices: parseSizePrices(product.sizePrices),
    imageKey: product.imageKey,
    thumbKey: product.thumbKey,
    imageUrl: product.imageKey ? getPublicUrl(product.imageKey) : null,
    thumbUrl: product.thumbKey ? getPublicUrl(product.thumbKey) : null,
    category: {
      id: product.category.id,
      name: product.category.name,
      type: product.category.type,
      subtype: product.category.subtype,
    },
    isActive: product.isActive,
    trackStock: product.trackStock,
    stock: product.stock,
    lowStockThreshold: product.lowStockThreshold,
    createdAt: product.createdAt.toISOString(),
  };
}

function buildWhere(query: ProductListQuery): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { deletedAt: null };

  if (query.q) {
    where.name = { contains: query.q, mode: "insensitive" };
  }

  if (query.status !== "all") {
    where.isActive = query.status === "active";
  }

  if (query.tab === "food") {
    where.category = { type: CategoryType.FOOD };
  } else if (query.tab === "coffee") {
    where.category = { type: CategoryType.DRINK, subtype: DrinkSubtype.COFFEE };
  } else if (query.tab === "non_coffee") {
    where.category = { type: CategoryType.DRINK, subtype: DrinkSubtype.NON_COFFEE };
  }

  return where;
}

function buildOrderBy(sort: ProductListQuery["sort"]): Prisma.ProductOrderByWithRelationInput {
  switch (sort) {
    case "name_asc":
      return { name: "asc" };
    case "price_asc":
      return { price: "asc" };
    case "price_desc":
      return { price: "desc" };
    case "stock_asc":
      return { stock: "asc" };
    default:
      return { createdAt: "desc" };
  }
}

export async function listProducts(
  query: ProductListQuery
): Promise<ProductListResult> {
  const where = buildWhere(query);
  const skip = (query.page - 1) * query.pageSize;

  const [total, products] = await runInTransaction(async (tx) => {
    const total = await tx.product.count({ where });
    const products = await tx.product.findMany({
      where,
      include: { category: true },
      orderBy: buildOrderBy(query.sort),
      skip,
      take: query.pageSize,
    });
    return [total, products] as const;
  });

  return {
    items: products.map(toDTO),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

async function assertCategoryExists(categoryId: string) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) {
    throw new AppError("VALIDATION_ERROR", "Kategori yang dipilih tidak ditemukan", 400);
  }
  return category;
}

export async function createProduct(
  input: ProductCreateInput,
  userId: string
): Promise<ProductDTO> {
  const data = productCreateSchema.parse(input);
  const category = await assertCategoryExists(data.categoryId);
  if (data.sizePrices && category.type !== "DRINK") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Harga size hanya untuk kategori minuman",
      400
    );
  }

  const created = await runInTransaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        price: data.price,
        sizePrices: data.sizePrices
          ? (data.sizePrices as Prisma.InputJsonValue)
          : Prisma.DbNull,
        categoryId: data.categoryId,
        imageKey: data.imageKey ?? null,
        thumbKey: data.thumbKey ?? null,
        isActive: data.isActive,
        trackStock: data.trackStock,
        stock: data.trackStock ? data.stock : 0,
        lowStockThreshold: data.lowStockThreshold,
      },
      include: { category: true },
    });

    if (product.trackStock && product.stock > 0) {
      await tx.stockMovement.create({
        data: {
          productId: product.id,
          type: StockMoveType.PURCHASE,
          quantity: product.stock,
          balance: product.stock,
          note: "Stok awal saat pembuatan produk",
          userId,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        userId,
        action: "product.create",
        entity: "Product",
        entityId: product.id,
        meta: { name: product.name, price: product.price, categoryId: product.categoryId },
      },
    });

    return product;
  });

  return toDTO(created);
}

async function deleteR2ObjectsQuietly(keys: (string | null | undefined)[]): Promise<void> {
  for (const key of keys) {
    if (!key) continue;
    try {
      await deleteObject(env.R2_BUCKET_PUBLIC, key);
    } catch (err) {
      console.warn("Gagal menghapus objek R2 lama:", key, err);
    }
  }
}

export async function updateProduct(
  id: string,
  input: ProductUpdateInput,
  userId: string
): Promise<ProductDTO> {
  const data = productUpdateSchema.parse(input);

  const current = await prisma.product.findFirst({
    where: { id, deletedAt: null },
    include: { category: true },
  });

  if (!current) {
    throw new AppError("NOT_FOUND", "Produk tidak ditemukan", 404);
  }

  const nextCategory = data.categoryId
    ? await assertCategoryExists(data.categoryId)
    : current.category;
  if (data.sizePrices && nextCategory.type !== "DRINK") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Harga size hanya untuk kategori minuman",
      400
    );
  }

  const updated = await runInTransaction(async (tx) => {
    const product = await tx.product.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description ?? null } : {}),
        ...(data.price !== undefined ? { price: data.price } : {}),
        ...(data.sizePrices !== undefined
          ? {
              sizePrices: data.sizePrices
                ? (data.sizePrices as Prisma.InputJsonValue)
                : Prisma.DbNull,
            }
          : {}),
        ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
        ...(data.imageKey !== undefined ? { imageKey: data.imageKey ?? null } : {}),
        ...(data.thumbKey !== undefined ? { thumbKey: data.thumbKey ?? null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.trackStock !== undefined ? { trackStock: data.trackStock } : {}),
        ...(data.lowStockThreshold !== undefined
          ? { lowStockThreshold: data.lowStockThreshold }
          : {}),
      },
      include: { category: true },
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: "product.update",
        entity: "Product",
        entityId: product.id,
        meta: {
          changedFields: Object.keys(data).filter(
            (key) => data[key as keyof ProductUpdateInput] !== undefined
          ),
        },
      },
    });

    return product;
  });

  // Hapus objek R2 lama di luar transaksi (best effort)
  if (current.imageKey && current.imageKey !== updated.imageKey) {
    await deleteR2ObjectsQuietly([current.imageKey]);
  }
  if (current.thumbKey && current.thumbKey !== updated.thumbKey) {
    await deleteR2ObjectsQuietly([current.thumbKey]);
  }

  return toDTO(updated);
}

export interface DeleteProductResult {
  mode: "soft" | "hard";
}

/**
 * Soft delete bila produk pernah dipesan (agar snapshot pesanan lama tetap valid),
 * hard delete bila belum pernah dipesan.
 */
export async function deleteProduct(
  id: string,
  userId: string
): Promise<DeleteProductResult> {
  const product = await prisma.product.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { orderItems: true } } },
  });

  if (!product) {
    throw new AppError("NOT_FOUND", "Produk tidak ditemukan", 404);
  }

  const everOrdered = product._count.orderItems > 0;

  if (everOrdered) {
    await runInTransaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "product.delete",
          entity: "Product",
          entityId: id,
          meta: { mode: "soft", name: product.name },
        },
      });
    });
  } else {
    await runInTransaction(async (tx) => {
      await tx.stockMovement.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          userId,
          action: "product.delete",
          entity: "Product",
          entityId: id,
          meta: { mode: "hard", name: product.name },
        },
      });
    });

    await deleteR2ObjectsQuietly([product.imageKey, product.thumbKey]);
  }

  return { mode: everOrdered ? "soft" : "hard" };
}
