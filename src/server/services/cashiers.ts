import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { PaymentStatus } from "@prisma/client";
import { emitToChannel } from "@/lib/pusher-server";
import { runInTransaction } from "@/lib/tx";
import { Role } from "@prisma/client";
import {
  CashierCreateInput,
  CashierResetPasswordInput,
  CashierUpdateInput,
  cashierCreateSchema,
  cashierResetPasswordSchema,
  cashierUpdateSchema,
} from "@/lib/validators/cashier";

export interface CashierDTO {
  id: string;
  name: string;
  username: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  approvedCount: number;
  rejectedCount: number;
}

export interface DeleteCashierResult {
  mode: "soft" | "hard";
}

const cashierSelect = {
  id: true,
  name: true,
  username: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

type CashierRow = {
  id: string;
  name: string;
  username: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
};

interface VerificationTally {
  approved: number;
  rejected: number;
}

function toDTO(row: CashierRow, tally: VerificationTally = { approved: 0, rejected: 0 }): CashierDTO {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    approvedCount: tally.approved,
    rejectedCount: tally.rejected,
  };
}

/**
 * Hitungan setuju/tolak diambil dari Payment.verifiedById, bukan kolom denormalisasi.
 */
async function countVerifications(): Promise<Map<string, VerificationTally>> {
  const rows = await prisma.payment.groupBy({
    by: ["verifiedById", "status"],
    where: {
      verifiedById: { not: null },
      status: { in: [PaymentStatus.APPROVED, PaymentStatus.REJECTED] },
    },
    _count: { _all: true },
  });

  const tally = new Map<string, VerificationTally>();
  for (const row of rows) {
    if (!row.verifiedById) continue;
    const entry = tally.get(row.verifiedById) ?? { approved: 0, rejected: 0 };
    if (row.status === PaymentStatus.APPROVED) entry.approved = row._count._all;
    else entry.rejected = row._count._all;
    tally.set(row.verifiedById, entry);
  }

  return tally;
}

export async function listCashiers(): Promise<CashierDTO[]> {
  const [cashiers, tally] = await Promise.all([
    prisma.user.findMany({
      where: { role: Role.CASHIER },
      select: cashierSelect,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    countVerifications(),
  ]);

  return cashiers.map((row) => toDTO(row, tally.get(row.id)));
}

async function findCashier(id: string): Promise<CashierRow> {
  const cashier = await prisma.user.findFirst({
    where: { id, role: Role.CASHIER },
    select: cashierSelect,
  });

  if (!cashier) {
    throw new AppError("NOT_FOUND", "Kasir tidak ditemukan", 404);
  }

  return cashier;
}

export async function createCashier(
  input: CashierCreateInput,
  actorId: string
): Promise<CashierDTO> {
  const data = cashierCreateSchema.parse(input);
  const username = data.username.toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });

  if (existing) {
    throw new AppError("CONFLICT", `Username "${username}" sudah dipakai. Pilih username lain.`, 409);
  }

  const passwordHash = await hashPassword(data.password);

  const created = await runInTransaction(async (tx) => {
    const cashier = await tx.user.create({
      data: {
        name: data.name,
        username,
        passwordHash,
        role: Role.CASHIER,
        isActive: true,
      },
      select: cashierSelect,
    });

    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: "cashier.create",
        entity: "User",
        entityId: cashier.id,
        meta: { username: cashier.username, name: cashier.name },
      },
    });

    return cashier;
  });

  return toDTO(created);
}

export async function updateCashier(
  id: string,
  input: CashierUpdateInput,
  actorId: string
): Promise<CashierDTO> {
  const data = cashierUpdateSchema.parse(input);
  const current = await findCashier(id);

  const deactivated = data.isActive === false && current.isActive;

  const updated = await runInTransaction(async (tx, after) => {
    const cashier = await tx.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        // Nonaktif memutus sesi aktif: token lama tidak lagi cocok dengan DB.
        ...(deactivated ? { tokenVersion: { increment: 1 } } : {}),
      },
      select: cashierSelect,
    });

    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: deactivated ? "cashier.deactivate" : "cashier.update",
        entity: "User",
        entityId: id,
        meta: {
          username: cashier.username,
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
      },
    });

    if (deactivated) {
      after(() => {
        const payload = { userId: cashier.id, username: cashier.username };
        emitToChannel(`private-user-${cashier.id}`, "user.deactivated", payload);
        emitToChannel("private-admin", "user.deactivated", payload);
      });
    }

    return cashier;
  });

  return toDTO(updated);
}

export async function resetCashierPassword(
  id: string,
  input: CashierResetPasswordInput,
  actorId: string
): Promise<void> {
  const data = cashierResetPasswordSchema.parse(input);
  const current = await findCashier(id);
  const passwordHash = await hashPassword(data.password);

  await runInTransaction(async (tx, after) => {
    await tx.user.update({
      where: { id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: "cashier.reset_password",
        entity: "User",
        entityId: id,
        // Password plain text tidak pernah disimpan di audit.
        meta: { username: current.username },
      },
    });

    after(() => {
      const payload = { userId: id, username: current.username };
      emitToChannel(`private-user-${id}`, "user.deactivated", payload);
      emitToChannel("private-admin", "user.deactivated", payload);
    });
  });
}

/**
 * Soft delete (nonaktifkan) bila kasir punya riwayat verifikasi pembayaran,
 * hard delete bila belum pernah memverifikasi apa pun.
 */
export async function deleteCashier(
  id: string,
  actorId: string
): Promise<DeleteCashierResult> {
  const cashier = await prisma.user.findFirst({
    where: { id, role: Role.CASHIER },
    select: { ...cashierSelect, _count: { select: { verifications: true } } },
  });

  if (!cashier) {
    throw new AppError("NOT_FOUND", "Kasir tidak ditemukan", 404);
  }

  const hasHistory = cashier._count.verifications > 0;

  if (hasHistory) {
    await runInTransaction(async (tx, after) => {
      await tx.user.update({
        where: { id },
        data: { isActive: false, tokenVersion: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "cashier.delete",
          entity: "User",
          entityId: id,
          meta: { mode: "soft", username: cashier.username },
        },
      });

      after(() => {
        const payload = { userId: id, username: cashier.username };
        emitToChannel(`private-user-${id}`, "user.deactivated", payload);
        emitToChannel("private-admin", "user.deactivated", payload);
      });
    });

    return { mode: "soft" };
  }

  await runInTransaction(async (tx, after) => {
    await tx.user.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: "cashier.delete",
        entity: "User",
        entityId: id,
        meta: { mode: "hard", username: cashier.username },
      },
    });

    after(() => {
      const payload = { userId: id, username: cashier.username };
      emitToChannel(`private-user-${id}`, "user.deactivated", payload);
      emitToChannel("private-admin", "user.deactivated", payload);
    });
  });

  return { mode: "hard" };
}
