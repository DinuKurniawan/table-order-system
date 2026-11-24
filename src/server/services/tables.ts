import "server-only";
import { nanoid } from "nanoid";
import { cacheable, invalidateTag } from "@/lib/next-cache";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { Prisma } from "@prisma/client";
import { tableOrderUrl } from "@/lib/qr";
import {
  TableInput,
  TableUpdateInput,
  tableInputSchema,
  tableUpdateSchema,
} from "@/lib/validators/table";

export interface TableDTO {
  id: string;
  name: string;
  area: string | null;
  token: string;
  isActive: boolean;
  orderUrl: string;
  createdAt: string;
}

function toDTO(table: {
  id: string;
  name: string;
  area: string | null;
  token: string;
  isActive: boolean;
  createdAt: Date;
}): TableDTO {
  return {
    id: table.id,
    name: table.name,
    area: table.area,
    token: table.token,
    isActive: table.isActive,
    orderUrl: tableOrderUrl(table.token),
    createdAt: table.createdAt.toISOString(),
  };
}

export async function listTables(): Promise<TableDTO[]> {
  const tables = await prisma.table.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return tables.map(toDTO);
}

/** Nama meja aktif untuk pilihan form lacak pesanan publik. */
export async function listActiveTableNames(): Promise<string[]> {
  const tables = await prisma.table.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { name: true },
  });

  return tables.map((table) => table.name);
}

/** Token meja aktif pertama, dipakai root agar langsung membuka menu. */
export const findFirstActiveTableToken = cacheable(
  async (): Promise<string | null> => {
    const table = await prisma.table.findFirst({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { token: true },
    });
    return table?.token ?? null;
  },
  ["first-active-table-token"],
  { revalidate: 60, tags: ["tables"] }
);

/**
 * Meja untuk halaman publik: hanya meja aktif dengan token yang cocok.
 * Mengembalikan null bila token tidak dikenal atau meja dinonaktifkan.
 * Cache 60 detik: perubahan status meja berlaku maksimal 1 menit.
 */
export const findActiveTableByToken = cacheable(
  async (
    token: string
  ): Promise<{ name: string; area: string | null } | null> => {
    const table = await prisma.table.findUnique({ where: { token } });
    if (!table || !table.isActive) return null;
    return { name: table.name, area: table.area };
  },
  ["active-table-by-token"],
  { revalidate: 60, tags: ["tables"] }
);

async function assertUniqueName(name: string, ignoreId?: string): Promise<void> {
  const existing = await prisma.table.findFirst({
    where: { name, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) },
    select: { id: true },
  });

  if (existing) {
    throw new AppError("CONFLICT", `Meja "${name}" sudah ada. Gunakan nama lain.`, 409);
  }
}

export async function createTable(input: TableInput, userId: string): Promise<TableDTO> {
  const data = tableInputSchema.parse(input);
  await assertUniqueName(data.name);

  const created = await prisma.table.create({
    data: {
      name: data.name,
      area: data.area?.trim() || null,
      token: nanoid(16),
      isActive: data.isActive,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: "table.create",
      entity: "Table",
      entityId: created.id,
      meta: { name: created.name, area: created.area },
    },
  });

  invalidateTag("tables");
  return toDTO(created);
}

export async function updateTable(
  id: string,
  input: TableUpdateInput,
  userId: string
): Promise<TableDTO> {
  const data = tableUpdateSchema.parse(input);

  const current = await prisma.table.findUnique({ where: { id } });
  if (!current) {
    throw new AppError("NOT_FOUND", "Meja tidak ditemukan", 404);
  }

  if (data.name) {
    await assertUniqueName(data.name, id);
  }

  const updated = await prisma.table.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.area !== undefined ? { area: data.area?.trim() || null } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: "table.update",
      entity: "Table",
      entityId: id,
      meta: {
        ...(data.name !== undefined ? { name: updated.name } : {}),
        ...(data.isActive !== undefined ? { isActive: updated.isActive } : {}),
      },
    },
  });

  invalidateTag("tables");
  return toDTO(updated);
}

export async function deleteTable(id: string, userId: string): Promise<void> {
  const table = await prisma.table.findUnique({
    where: { id },
    include: { _count: { select: { orders: true } } },
  });

  if (!table) {
    throw new AppError("NOT_FOUND", "Meja tidak ditemukan", 404);
  }

  if (table._count.orders > 0) {
    throw new AppError(
      "CONFLICT",
      "Meja sudah punya riwayat pesanan. Nonaktifkan saja agar riwayat tetap utuh.",
      409
    );
  }

  await prisma.table.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      userId,
      action: "table.delete",
      entity: "Table",
      entityId: id,
      meta: { name: table.name },
    },
  });

  invalidateTag("tables");
}

/**
 * Token baru membuat seluruh QR tercetak sebelumnya tidak berlaku.
 */
export async function regenerateTableToken(id: string, userId: string): Promise<TableDTO> {
  const current = await prisma.table.findUnique({ where: { id } });
  if (!current) {
    throw new AppError("NOT_FOUND", "Meja tidak ditemukan", 404);
  }

  const nextToken = nanoid(16);

  try {
    const updated = await prisma.table.update({
      where: { id },
      data: { token: nextToken },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: "table.regenerate_token",
        entity: "Table",
        entityId: id,
        meta: { name: updated.name },
      },
    });

    invalidateTag("tables");
    return toDTO(updated);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("CONFLICT", "Token bentrok, coba regenerasi sekali lagi", 409);
    }
    throw err;
  }
}

export async function getTableForQr(id: string): Promise<TableDTO> {
  const table = await prisma.table.findUnique({ where: { id } });
  if (!table) {
    throw new AppError("NOT_FOUND", "Meja tidak ditemukan", 404);
  }
  return toDTO(table);
}
