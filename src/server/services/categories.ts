import "server-only";
import { invalidateTag } from "@/lib/next-cache";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { CategoryType, DrinkSubtype } from "@prisma/client";
import { runInTransaction } from "@/lib/tx";
import { CategoryInput, categoryInputSchema } from "@/lib/validators/product";

export interface CategoryDTO {
  id: string;
  name: string;
  type: CategoryType;
  subtype: DrinkSubtype | null;
  sortOrder: number;
  productCount: number;
}

function toDTO(category: {
  id: string;
  name: string;
  type: CategoryType;
  subtype: DrinkSubtype | null;
  sortOrder: number;
  _count?: { products: number };
}): CategoryDTO {
  return {
    id: category.id,
    name: category.name,
    type: category.type,
    subtype: category.subtype,
    sortOrder: category.sortOrder,
    productCount: category._count?.products ?? 0,
  };
}

async function assertUniqueName(
  name: string,
  type: CategoryType,
  ignoreId?: string
): Promise<void> {
  const existing = await prisma.category.findFirst({
    where: { name, type, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) },
  });

  if (existing) {
    throw new AppError(
      "CONFLICT",
      `Kategori "${name}" dengan tipe ${type} sudah ada`,
      409
    );
  }
}

export async function listCategories(): Promise<CategoryDTO[]> {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { products: { where: { deletedAt: null } } } },
    },
  });

  return categories.map(toDTO);
}

export async function createCategory(
  input: CategoryInput,
  userId: string
): Promise<CategoryDTO> {
  const data = categoryInputSchema.parse(input);
  await assertUniqueName(data.name, data.type);

  const lastCategory = await prisma.category.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const created = await prisma.category.create({
    data: {
      name: data.name,
      type: data.type,
      subtype: data.type === CategoryType.DRINK ? data.subtype : null,
      sortOrder: data.sortOrder ?? (lastCategory?.sortOrder ?? 0) + 1,
    },
    include: { _count: { select: { products: { where: { deletedAt: null } } } } },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: "category.create",
      entity: "Category",
      entityId: created.id,
      meta: { name: created.name, type: created.type, subtype: created.subtype },
    },
  });

  invalidateTag("menu");
  return toDTO(created);
}

export async function updateCategory(
  id: string,
  input: CategoryInput,
  userId: string
): Promise<CategoryDTO> {
  const data = categoryInputSchema.parse(input);

  const current = await prisma.category.findUnique({ where: { id } });
  if (!current) {
    throw new AppError("NOT_FOUND", "Kategori tidak ditemukan", 404);
  }

  await assertUniqueName(data.name, data.type, id);

  const updated = await prisma.category.update({
    where: { id },
    data: {
      name: data.name,
      type: data.type,
      subtype: data.type === CategoryType.DRINK ? data.subtype : null,
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
    },
    include: { _count: { select: { products: { where: { deletedAt: null } } } } },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: "category.update",
      entity: "Category",
      entityId: id,
      meta: { before: { name: current.name, type: current.type }, after: { name: updated.name, type: updated.type } },
    },
  });

  invalidateTag("menu");
  return toDTO(updated);
}

export async function deleteCategory(id: string, userId: string): Promise<void> {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });

  if (!category) {
    throw new AppError("NOT_FOUND", "Kategori tidak ditemukan", 404);
  }

  if (category._count.products > 0) {
    throw new AppError(
      "CONFLICT",
      "Kategori masih memiliki produk. Pindahkan atau hapus produk terlebih dahulu.",
      409
    );
  }

  await prisma.category.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      userId,
      action: "category.delete",
      entity: "Category",
      entityId: id,
      meta: { name: category.name, type: category.type },
    },
  });

  invalidateTag("menu");
}

/**
 * Menyusun ulang urutan kategori sesuai daftar id yang dikirim.
 */
export async function reorderCategories(
  ids: string[],
  userId: string
): Promise<CategoryDTO[]> {
  const categories = await prisma.category.findMany();
  const known = new Set(categories.map((category) => category.id));

  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new AppError("VALIDATION_ERROR", "Terdapat id kategori yang tidak dikenal", 400);
  }

  await runInTransaction(async (tx) => {
    for (const [index, id] of ids.entries()) {
      await tx.category.update({
        where: { id },
        data: { sortOrder: index + 1 },
      });
    }
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: "category.reorder",
      entity: "Category",
      entityId: "batch",
      meta: { ids },
    },
  });

  return listCategories();
}
