import "server-only";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { deleteObject, getPublicUrl } from "@/lib/r2";
import { env } from "@/lib/env";
import { runInTransaction } from "@/lib/tx";
import {
  PaymentMethodInput,
  PaymentMethodUpdateInput,
  paymentMethodInputSchema,
  paymentMethodUpdateSchema,
} from "@/lib/validators/payment-method";

export interface PaymentMethodDTO {
  id: string;
  kind: "QRIS" | "BANK";
  label: string;
  accountNo: string | null;
  accountName: string | null;
  imageKey: string | null;
  imageUrl: string | null;
  qrisPayload: string | null;
  isActive: boolean;
  sortOrder: number;
}

function toDTO(method: {
  id: string;
  kind: string;
  label: string;
  accountNo: string | null;
  accountName: string | null;
  imageKey: string | null;
  qrisPayload: string | null;
  isActive: boolean;
  sortOrder: number;
}): PaymentMethodDTO {
  return {
    id: method.id,
    kind: method.kind === "BANK" ? "BANK" : "QRIS",
    label: method.label,
    accountNo: method.accountNo,
    accountName: method.accountName,
    imageKey: method.imageKey,
    imageUrl: method.imageKey ? getPublicUrl(method.imageKey) : null,
    qrisPayload: method.qrisPayload,
    isActive: method.isActive,
    sortOrder: method.sortOrder,
  };
}

export async function listPaymentMethods(): Promise<PaymentMethodDTO[]> {
  const methods = await prisma.paymentMethod.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });

  return methods.map(toDTO);
}

async function deleteImageQuietly(key: string | null | undefined): Promise<void> {
  if (!key) return;
  try {
    await deleteObject(env.R2_BUCKET_PUBLIC, key);
  } catch (err) {
    console.warn("Gagal menghapus gambar metode bayar lama:", key, err);
  }
}

export async function createPaymentMethod(
  input: PaymentMethodInput,
  userId: string
): Promise<PaymentMethodDTO> {
  const data = paymentMethodInputSchema.parse(input);

  const last = await prisma.paymentMethod.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const created = await prisma.paymentMethod.create({
    data: {
      kind: data.kind,
      label: data.label,
      isActive: data.isActive,
      sortOrder: data.sortOrder ?? (last?.sortOrder ?? 0) + 1,
      ...(data.kind === "QRIS"
        ? {
            imageKey: data.imageKey ?? null,
            qrisPayload: data.qrisPayload ?? null,
            accountName: data.accountName ?? null,
            accountNo: null,
          }
        : {
            imageKey: null,
            qrisPayload: null,
            accountNo: data.accountNo,
            accountName: data.accountName,
          }),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: "payment_method.create",
      entity: "PaymentMethod",
      entityId: created.id,
      meta: { kind: created.kind, label: created.label },
    },
  });

  return toDTO(created);
}

export async function updatePaymentMethod(
  id: string,
  input: PaymentMethodUpdateInput,
  userId: string
): Promise<PaymentMethodDTO> {
  const data = paymentMethodUpdateSchema.parse(input);

  const current = await prisma.paymentMethod.findUnique({ where: { id } });
  if (!current) {
    throw new AppError("NOT_FOUND", "Metode pembayaran tidak ditemukan", 404);
  }

  const updated = await prisma.paymentMethod.update({
    where: { id },
    data: {
      ...(data.label !== undefined ? { label: data.label } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(data.accountNo !== undefined ? { accountNo: data.accountNo } : {}),
      ...(data.accountName !== undefined ? { accountName: data.accountName } : {}),
      ...(data.imageKey !== undefined ? { imageKey: data.imageKey } : {}),
      ...(data.qrisPayload !== undefined ? { qrisPayload: data.qrisPayload } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: "payment_method.update",
      entity: "PaymentMethod",
      entityId: id,
      meta: { label: updated.label, changedFields: Object.keys(data) },
    },
  });

  if (current.imageKey && current.imageKey !== updated.imageKey) {
    await deleteImageQuietly(current.imageKey);
  }

  return toDTO(updated);
}

export async function deletePaymentMethod(id: string, userId: string): Promise<void> {
  const method = await prisma.paymentMethod.findUnique({ where: { id } });
  if (!method) {
    throw new AppError("NOT_FOUND", "Metode pembayaran tidak ditemukan", 404);
  }

  await prisma.paymentMethod.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      userId,
      action: "payment_method.delete",
      entity: "PaymentMethod",
      entityId: id,
      meta: { kind: method.kind, label: method.label },
    },
  });

  await deleteImageQuietly(method.imageKey);
}

export async function reorderPaymentMethods(
  ids: string[],
  userId: string
): Promise<PaymentMethodDTO[]> {
  const methods = await prisma.paymentMethod.findMany({ select: { id: true } });
  const known = new Set(methods.map((method) => method.id));

  if (ids.some((id) => !known.has(id))) {
    throw new AppError("VALIDATION_ERROR", "Terdapat id metode pembayaran yang tidak dikenal", 400);
  }

  await runInTransaction(async (tx) => {
    for (const [index, id] of ids.entries()) {
      await tx.paymentMethod.update({
        where: { id },
        data: { sortOrder: index + 1 },
      });
    }
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: "payment_method.reorder",
      entity: "PaymentMethod",
      entityId: "batch",
      meta: { ids },
    },
  });

  return listPaymentMethods();
}
