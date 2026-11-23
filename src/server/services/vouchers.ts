import "server-only";
import { Prisma, Voucher, VoucherType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { formatRupiah } from "@/lib/utils";
import { computeVoucherDiscount } from "@/lib/voucher-discount";
import { generateVoucherCode, normalizeVoucherCode } from "@/lib/voucher-code";
import {
  VoucherCreateInput,
  VoucherListQuery,
  VoucherUpdateInput,
  voucherConfigSchema,
  voucherCreateSchema,
  voucherListQuerySchema,
  voucherUpdateSchema,
} from "@/lib/validators/voucher";

import type {
  VoucherDTO,
  VoucherListResult,
  VoucherRedemptionResult,
  VoucherStatus,
} from "@/types/voucher";

type Db = Prisma.TransactionClient | typeof prisma;

export function voucherStatus(
  voucher: Pick<
    Voucher,
    "isActive" | "startsAt" | "endsAt" | "quota" | "usedCount"
  >,
  now: Date = new Date()
): VoucherStatus {
  if (!voucher.isActive) return "NONAKTIF";
  if (voucher.endsAt.getTime() < now.getTime()) return "BERAKHIR";
  if (voucher.startsAt.getTime() > now.getTime()) return "TERJADWAL";
  if (voucher.quota !== null && voucher.usedCount >= voucher.quota) {
    return "HABIS";
  }
  return "AKTIF";
}

function toDTO(voucher: Voucher, now: Date): VoucherDTO {
  return {
    id: voucher.id,
    code: voucher.code,
    description: voucher.description,
    type: voucher.type,
    value: voucher.value,
    maxDiscount: voucher.maxDiscount,
    minSpend: voucher.minSpend,
    quota: voucher.quota,
    usedCount: voucher.usedCount,
    startsAt: voucher.startsAt.toISOString(),
    endsAt: voucher.endsAt.toISOString(),
    isActive: voucher.isActive,
    status: voucherStatus(voucher, now),
    createdAt: voucher.createdAt.toISOString(),
  };
}

function activeWhere(now: Date): Prisma.VoucherWhereInput {
  return {
    isActive: true,
    startsAt: { lte: now },
    endsAt: { gte: now },
    OR: [{ quota: null }, { usedCount: { lt: prisma.voucher.fields.quota } }],
  };
}

function statusWhere(
  status: VoucherListQuery["status"],
  now: Date
): Prisma.VoucherWhereInput {
  switch (status) {
    case "active":
      return activeWhere(now);
    case "scheduled":
      return { isActive: true, startsAt: { gt: now }, endsAt: { gte: now } };
    case "expired":
      return { isActive: true, endsAt: { lt: now } };
    case "exhausted":
      return {
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
        quota: { not: null },
        usedCount: { gte: prisma.voucher.fields.quota },
      };
    case "inactive":
      return { isActive: false };
    default:
      return {};
  }
}

function buildListWhere(
  query: VoucherListQuery,
  now: Date
): Prisma.VoucherWhereInput {
  const filters: Prisma.VoucherWhereInput[] = [statusWhere(query.status, now)];

  if (query.q) {
    filters.push({
      OR: [
        { code: { contains: query.q.toUpperCase(), mode: "insensitive" } },
        { description: { contains: query.q, mode: "insensitive" } },
      ],
    });
  }

  return filters.length === 1 ? filters[0] : { AND: filters };
}

function buildOrderBy(
  sort: VoucherListQuery["sort"]
): Prisma.VoucherOrderByWithRelationInput[] {
  switch (sort) {
    case "most_used":
      return [{ usedCount: "desc" }, { createdAt: "desc" }];
    case "ending_soon":
      return [{ endsAt: "asc" }, { createdAt: "desc" }];
    default:
      return [{ createdAt: "desc" }];
  }
}

function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function listVouchers(input: unknown): Promise<VoucherListResult> {
  const query = voucherListQuerySchema.parse(input);
  const now = new Date();
  const where = buildListWhere(query, now);
  const skip = (query.page - 1) * query.pageSize;
  const monthStart = startOfMonthUtc(now);
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [items, total, activeCount, monthAgg, expiringSoon] = await Promise.all([
    prisma.voucher.findMany({
      where,
      orderBy: buildOrderBy(query.sort),
      skip,
      take: query.pageSize,
    }),
    prisma.voucher.count({ where }),
    prisma.voucher.count({ where: activeWhere(now) }),
    prisma.voucherRedemption.aggregate({
      where: { createdAt: { gte: monthStart }, releasedAt: null },
      _count: { _all: true },
      _sum: { discountAmount: true },
    }),
    prisma.voucher.count({
      where: {
        ...activeWhere(now),
        endsAt: { gte: now, lte: weekEnd },
      },
    }),
  ]);

  return {
    items: items.map((voucher) => toDTO(voucher, now)),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
    stats: {
      activeCount,
      monthRedemptions: monthAgg._count._all,
      monthDiscount: monthAgg._sum.discountAmount ?? 0,
      expiringSoon,
    },
  };
}

export async function getVoucher(id: string): Promise<VoucherDTO> {
  const voucher = await prisma.voucher.findUnique({ where: { id } });
  if (!voucher) throw new AppError("NOT_FOUND", "Voucher tidak ditemukan", 404);
  return toDTO(voucher, new Date());
}

function isUniqueCodeError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function createVoucher(
  input: VoucherCreateInput,
  userId: string
): Promise<VoucherDTO> {
  const data = voucherCreateSchema.parse(input);
  const now = new Date();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = data.code ?? generateVoucherCode();

    try {
      const created = await prisma.voucher.create({
        data: {
          code,
          description: data.description?.trim() || null,
          type: data.type,
          value: data.value,
          maxDiscount: data.type === VoucherType.FIXED ? null : data.maxDiscount,
          minSpend: data.minSpend,
          quota: data.quota ?? null,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          isActive: data.isActive,
          createdById: userId,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId,
          action: "voucher.create",
          entity: "Voucher",
          entityId: created.id,
          meta: { code: created.code, type: created.type, value: created.value },
        },
      });

      return toDTO(created, now);
    } catch (error) {
      if (isUniqueCodeError(error)) {
        if (data.code) {
          throw new AppError(
            "CONFLICT",
            `Kode voucher "${code}" sudah dipakai. Gunakan kode lain.`,
            409
          );
        }
        continue;
      }
      throw error;
    }
  }

  throw new AppError(
    "CONFLICT",
    "Gagal membuat kode voucher acak yang unik. Coba lagi.",
    409
  );
}

function pick<T>(next: T | undefined, current: T): T {
  return next !== undefined ? next : current;
}

export async function updateVoucher(
  id: string,
  input: VoucherUpdateInput,
  userId: string
): Promise<VoucherDTO> {
  const data = voucherUpdateSchema.parse(input);
  const current = await prisma.voucher.findUnique({ where: { id } });
  if (!current) throw new AppError("NOT_FOUND", "Voucher tidak ditemukan", 404);

  if (
    current.usedCount > 0 &&
    (data.type !== undefined ||
      data.value !== undefined ||
      data.maxDiscount !== undefined ||
      data.minSpend !== undefined ||
      data.startsAt !== undefined ||
      data.code !== undefined)
  ) {
    throw new AppError(
      "CONFLICT",
      "Voucher sudah pernah dipakai. Kode dan nilai diskon tidak dapat diubah; nonaktifkan dan buat voucher baru.",
      409
    );
  }

  if (data.quota !== undefined) {
    if (current.quota === null) {
      throw new AppError(
        "CONFLICT",
        "Kuota tanpa batas tidak dapat diubah menjadi terbatas.",
        409
      );
    }
    if (data.quota === null || data.quota < current.quota) {
      throw new AppError("CONFLICT", "Kuota hanya dapat dinaikkan.", 409);
    }
  }

  if (data.endsAt && data.endsAt.getTime() < current.endsAt.getTime()) {
    throw new AppError(
      "CONFLICT",
      "Tanggal berakhir hanya dapat diperpanjang.",
      409
    );
  }

  const mergedType = pick(data.type, current.type);
  voucherConfigSchema.parse({
    description: pick(data.description, current.description),
    type: mergedType,
    value: pick(data.value, current.value),
    maxDiscount:
      mergedType === VoucherType.FIXED
        ? null
        : pick(data.maxDiscount, current.maxDiscount),
    minSpend: pick(data.minSpend, current.minSpend),
    startsAt: pick(data.startsAt, current.startsAt),
    endsAt: pick(data.endsAt, current.endsAt),
  });

  try {
    const updated = await prisma.voucher.update({
      where: { id },
      data: {
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.description !== undefined
          ? { description: data.description?.trim() || null }
          : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.value !== undefined ? { value: data.value } : {}),
        ...(mergedType === VoucherType.FIXED
          ? { maxDiscount: null }
          : data.maxDiscount !== undefined
            ? { maxDiscount: data.maxDiscount }
            : {}),
        ...(data.minSpend !== undefined ? { minSpend: data.minSpend } : {}),
        ...(data.quota !== undefined ? { quota: data.quota } : {}),
        ...(data.startsAt !== undefined ? { startsAt: data.startsAt } : {}),
        ...(data.endsAt !== undefined ? { endsAt: data.endsAt } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action:
          data.isActive === false ? "voucher.deactivate" : "voucher.update",
        entity: "Voucher",
        entityId: id,
        meta: {
          code: updated.code,
          ...(data.isActive !== undefined ? { isActive: updated.isActive } : {}),
        },
      },
    });

    return toDTO(updated, new Date());
  } catch (error) {
    if (isUniqueCodeError(error)) {
      throw new AppError(
        "CONFLICT",
        "Kode voucher sudah dipakai. Gunakan kode lain.",
        409
      );
    }
    throw error;
  }
}

export async function deleteVoucher(id: string, userId: string): Promise<void> {
  const voucher = await prisma.voucher.findUnique({
    where: { id },
    include: { _count: { select: { redemptions: true } } },
  });
  if (!voucher) throw new AppError("NOT_FOUND", "Voucher tidak ditemukan", 404);

  if (voucher.usedCount > 0 || voucher._count.redemptions > 0) {
    throw new AppError(
      "CONFLICT",
      "Voucher sudah punya riwayat pemakaian. Nonaktifkan saja agar riwayat tetap utuh.",
      409
    );
  }

  await prisma.voucher.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      userId,
      action: "voucher.delete",
      entity: "Voucher",
      entityId: id,
      meta: { code: voucher.code },
    },
  });
}

export async function listVoucherRedemptions(
  voucherId: string,
  input: { page?: number; pageSize?: number } = {}
): Promise<VoucherRedemptionResult> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 10));

  const voucher = await prisma.voucher.findUnique({
    where: { id: voucherId },
    select: { id: true },
  });
  if (!voucher) throw new AppError("NOT_FOUND", "Voucher tidak ditemukan", 404);

  const where: Prisma.VoucherRedemptionWhereInput = { voucherId };
  const [rows, total] = await Promise.all([
    prisma.voucherRedemption.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        order: {
          select: {
            code: true,
            customerName: true,
            status: true,
            table: { select: { name: true } },
          },
        },
      },
    }),
    prisma.voucherRedemption.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      orderCode: row.order.code,
      tableName: row.order.table.name,
      customerName: row.order.customerName,
      orderStatus: row.order.status,
      discountAmount: row.discountAmount,
      releasedAt: row.releasedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

function assertVoucherWindow(
  voucher: Voucher,
  subtotal: number,
  now: Date
): void {
  if (
    !voucher.isActive ||
    voucher.startsAt.getTime() > now.getTime() ||
    voucher.endsAt.getTime() < now.getTime()
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Kode voucher tidak valid atau sudah tidak berlaku",
      400
    );
  }

  if (voucher.quota !== null && voucher.usedCount >= voucher.quota) {
    throw new AppError(
      "VOUCHER_QUOTA_EXHAUSTED",
      "Voucher baru saja habis dipakai pelanggan lain",
      409
    );
  }

  if (subtotal < voucher.minSpend) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Minimal belanja ${formatRupiah(voucher.minSpend)} untuk memakai voucher ini`,
      400
    );
  }
}

async function findVoucherByCode(db: Db, code: string): Promise<Voucher> {
  const voucher = await db.voucher.findUnique({
    where: { code: normalizeVoucherCode(code) },
  });
  if (!voucher) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Kode voucher tidak valid atau sudah tidak berlaku",
      400
    );
  }
  return voucher;
}

export interface VoucherPreview {
  code: string;
  subtotal: number;
  discount: number;
  total: number;
}

/** Pratinjau tanpa memesan kuota. */
export async function previewVoucher(
  code: string,
  subtotal: number,
  now: Date = new Date()
): Promise<VoucherPreview> {
  const voucher = await findVoucherByCode(prisma, code);
  assertVoucherWindow(voucher, subtotal, now);

  const discount = computeVoucherDiscount(voucher, subtotal);
  if (discount <= 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Subtotal terlalu kecil untuk memakai voucher ini",
      400
    );
  }

  return {
    code: voucher.code,
    subtotal,
    discount,
    total: subtotal - discount,
  };
}

export interface ClaimedVoucher {
  voucherId: string;
  code: string;
  discount: number;
}

/**
 * Klaim kuota atomik. Wajib dipanggil di dalam transaksi checkout.
 * Pemenang adalah request yang berhasil menaikkan usedCount terlebih dahulu.
 */
export async function claimVoucher(
  tx: Prisma.TransactionClient,
  input: { code: string; subtotal: number; now?: Date }
): Promise<ClaimedVoucher> {
  const now = input.now ?? new Date();
  const voucher = await findVoucherByCode(tx, input.code);
  assertVoucherWindow(voucher, input.subtotal, now);

  const discount = computeVoucherDiscount(voucher, input.subtotal);
  if (discount <= 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Subtotal terlalu kecil untuk memakai voucher ini",
      400
    );
  }

  const claimed = await tx.voucher.updateMany({
    where: {
      id: voucher.id,
      isActive: true,
      startsAt: { lte: now },
      endsAt: { gte: now },
      OR: [{ quota: null }, { usedCount: { lt: tx.voucher.fields.quota } }],
    },
    data: { usedCount: { increment: 1 } },
  });

  if (claimed.count === 0) {
    const latest = await tx.voucher.findUnique({ where: { id: voucher.id } });
    if (latest && latest.quota !== null && latest.usedCount >= latest.quota) {
      throw new AppError(
        "VOUCHER_QUOTA_EXHAUSTED",
        "Voucher baru saja habis dipakai pelanggan lain",
        409
      );
    }
    throw new AppError(
      "VALIDATION_ERROR",
      "Kode voucher tidak valid atau sudah tidak berlaku",
      400
    );
  }

  return { voucherId: voucher.id, code: voucher.code, discount };
}

/** Lepas kuota saat order batal/expired. Idempoten per order. */
export async function releaseVoucherForOrder(
  tx: Prisma.TransactionClient,
  input: { orderId: string; orderCode: string }
): Promise<void> {
  const redemption = await tx.voucherRedemption.findUnique({
    where: { orderId: input.orderId },
    select: { id: true, voucherId: true, releasedAt: true },
  });
  if (!redemption || redemption.releasedAt) return;

  const released = await tx.voucherRedemption.updateMany({
    where: { id: redemption.id, releasedAt: null },
    data: { releasedAt: new Date() },
  });
  if (released.count === 0) return;

  await tx.voucher.updateMany({
    where: { id: redemption.voucherId, usedCount: { gt: 0 } },
    data: { usedCount: { decrement: 1 } },
  });

  await tx.auditLog.create({
    data: {
      action: "voucher.release",
      entity: "Order",
      entityId: input.orderId,
      meta: { orderCode: input.orderCode },
    },
  });
}

