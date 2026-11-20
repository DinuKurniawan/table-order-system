import { CHANNELS, REALTIME_EVENTS, tableStockPayload } from "@/lib/realtime-events";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { handleApiError, readJson, apiErrorResponse } from "@/lib/api";
import { logger } from "@/lib/logger";
import {
  consumeRateLimit,
  tooManyRequests,
} from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/client-ip";
import { emitToChannel } from "@/lib/pusher-server";
import { runInTransaction } from "@/lib/tx";
import { getSettings } from "@/server/services/settings";
import { reserveStock } from "@/server/services/stock";
import crypto from "crypto";

const MAX_BODY_BYTES = 64 * 1024;

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(16, "Idempotency-Key minimal 16 karakter")
  .max(120, "Idempotency-Key maksimal 120 karakter")
  .regex(/^[A-Za-z0-9_-]+$/, "Idempotency-Key mengandung karakter tidak valid");

const orderSchema = z
  .object({
    tableToken: z.string().trim().min(8, "Token meja tidak valid").max(120),
    customerName: z.string().trim().max(80, "Nama maksimal 80 karakter").optional(),
    note: z.string().trim().max(300, "Catatan maksimal 300 karakter").optional(),
    items: z
      .array(
        z.object({
          productId: z.string().trim().min(1).max(64),
          quantity: z
            .number({ error: "Jumlah wajib berupa angka" })
            .int("Jumlah harus bilangan bulat")
            .min(1, "Minimal 1")
            .max(100, "Maksimal 100 per item"),
          note: z.string().trim().max(200, "Catatan item maksimal 200 karakter").optional(),
        })
      )
      .min(1, "Pesanan minimal berisi 1 item")
      .max(50, "Maksimal 50 item per pesanan"),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.items.forEach((item, index) => {
      if (seen.has(item.productId)) {
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "productId"],
          message: "Produk duplikat dalam satu pesanan",
        });
      }
      seen.add(item.productId);
    });
  });

interface CreatedOrder {
  code: string;
  accessToken: string;
}

function orderResponse(order: CreatedOrder, status: number, maxAgeSeconds: number) {
  const response = NextResponse.json(
    { code: order.code, accessToken: order.accessToken },
    { status }
  );

  response.cookies.set(`order_${order.code}`, order.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  });

  return response;
}

export async function POST(req: Request) {
  let requestTableId: string | null = null;
  try {
    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      throw new AppError("VALIDATION_ERROR", "Body request terlalu besar", 413);
    }

    const ip = getClientIp(req);
    const ipLimit = await consumeRateLimit(`order:${ip}`, 20, 60);
    if (ipLimit.limited) return tooManyRequests(ipLimit);

    const keyCheck = idempotencyKeySchema.safeParse(
      req.headers.get("idempotency-key") ?? ""
    );
    if (!keyCheck.success) {
      return apiErrorResponse(
        "VALIDATION_ERROR",
        keyCheck.error.issues[0]?.message ?? "Idempotency-Key tidak valid",
        400
      );
    }
    const idempotencyKey = keyCheck.data;

    const body = await readJson(req);
    const validation = orderSchema.safeParse(body);
    if (!validation.success) {
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "Validasi gagal",
        400,
        validation.error.flatten().fieldErrors
      );
    }

    const { tableToken, customerName, note, items } = validation.data;

    const settings = await getSettings();
    if (!settings.isOrderingOpen) {
      throw new AppError("CONFLICT", "Pemesanan sedang ditutup", 409);
    }

    const tableLimit = await consumeRateLimit(`order:table:${tableToken}`, 10, 60);
    if (tableLimit.limited) return tooManyRequests(tableLimit);

    // 1. Validasi meja aktif
    const table = await prisma.table.findUnique({ where: { token: tableToken } });
    if (!table || !table.isActive) {
      throw new AppError("VALIDATION_ERROR", "Meja tidak aktif atau tidak ditemukan", 400);
    }
    requestTableId = table.id;

    // 2. Idempotensi: kunci yang sama mengembalikan pesanan yang sama.
    const existing = await prisma.order.findUnique({
      where: { idempotencyKey },
      select: { code: true, accessToken: true, tableId: true },
    });
    if (existing) {
      if (existing.tableId !== table.id) {
        throw new AppError("CONFLICT", "Idempotency-Key sudah dipakai", 409);
      }
      return orderResponse(existing, 200, settings.timeoutBayarMenit * 60);
    }

    // 3. Ambil produk aktif dari DB; harga & stok tidak pernah dari client.
    const productIds = items.map((item) => item.productId);
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        deletedAt: null,
        isActive: true,
      },
    });
    const productMap = new Map(products.map((product) => [product.id, product]));

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Salah satu produk tidak tersedia atau sudah tidak aktif",
          400
        );
      }
      if (product.trackStock && product.stock < item.quantity) {
        throw new AppError(
          "STOCK_INSUFFICIENT",
          `Stok tidak cukup untuk produk ${product.name}`,
          409
        );
      }
    }

    const subtotal = items.reduce((sum, item) => {
      const product = productMap.get(item.productId);
      return sum + (product?.price ?? 0) * item.quantity;
    }, 0);
    const total = subtotal;

    const now = new Date();
    const timeoutMinutes = settings.timeoutBayarMenit;
    const expiresAt = new Date(now.getTime() + timeoutMinutes * 60000);

    const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
    const accessToken = crypto.randomBytes(16).toString("hex");

    // K-01: kode hanya 4 hex sehingga bisa bentrok. Saat bentrok, ulangi
    // transaksi dengan kode baru (attempt menggeser suffix) alih-alih 500.
    const makeOrderCode = (attempt: number) => {
      const base = crypto.randomBytes(2).readUInt16BE(0);
      const suffix = ((base + attempt) % 0x10000)
        .toString(16)
        .toUpperCase()
        .padStart(4, "0");
      return `ORD-${datePart}-${suffix}`;
    };

    const isOrderCodeConflict = (err: unknown) => {
      if (
        !(err instanceof Prisma.PrismaClientKnownRequestError) ||
        err.code !== "P2002"
      ) {
        return false;
      }
      const target = err.meta?.target;
      return Array.isArray(target) && target.includes("code");
    };

    for (let attempt = 0; ; attempt++) {
      const orderCode = makeOrderCode(attempt);

      try {
        await runInTransaction(async (tx, after) => {
          const order = await tx.order.create({
            data: {
              code: orderCode,
              accessToken,
              idempotencyKey,
              tableId: table.id,
              customerName: customerName || null,
              note: note || null,
              status: "AWAITING_PAYMENT",
              expiresAt,
              version: 0,
              subtotal,
              total,
              items: {
                create: items.map((item) => ({
                  productId: item.productId,
                  quantity: item.quantity,
                  note: item.note || null,
                  nameSnapshot: productMap.get(item.productId)?.name ?? "",
                  priceSnapshot: productMap.get(item.productId)?.price ?? 0,
                })),
              },
            },
          });

          for (const item of items) {
            const product = productMap.get(item.productId);
            if (!product) {
              throw new AppError("VALIDATION_ERROR", "Produk tidak ditemukan", 400);
            }

            // Produk non-tracked tidak mereservasi stok dan tidak menulis movement (K-02).
            const reserved = await reserveStock(
              tx,
              {
                productId: item.productId,
                name: product.name,
                quantity: item.quantity,
                trackStock: product.trackStock,
              },
              orderCode
            );
            if (!reserved) continue;

            const newStock = reserved.newStock;

            after(() => {
              emitToChannel(
                CHANNELS.table(tableToken),
                REALTIME_EVENTS.stockChanged,
                tableStockPayload(item.productId, newStock)
              );
            });

            if (product.lowStockThreshold && newStock <= product.lowStockThreshold) {
              after(() => {
                emitToChannel(CHANNELS.admin, REALTIME_EVENTS.stockLow, {
                  productId: item.productId,
                  newStock,
                  orderCode,
                });
              });
            }
          }

          await tx.auditLog.create({
            data: {
              action: "order.created",
              entity: "Order",
              entityId: order.id,
              meta: {
                code: orderCode,
                tableName: table.name,
                total,
                itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
              },
            },
          });

          after(() => {
            emitToChannel(CHANNELS.cashier, REALTIME_EVENTS.orderCreated, {
              orderCode,
              orderId: order.id,
              tableToken,
              tableName: table.name,
              customerName,
            });
            emitToChannel(CHANNELS.admin, REALTIME_EVENTS.orderCreated, {
              orderCode,
              orderId: order.id,
              tableToken,
              tableName: table.name,
              customerName,
            });
          });
        });
      } catch (err) {
        if (attempt < 4 && isOrderCodeConflict(err)) continue;
        throw err;
      }

      return orderResponse(
        { code: orderCode, accessToken },
        201,
        timeoutMinutes * 60
      );
    }
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const key = req.headers.get("idempotency-key")?.trim();
      if (key) {
        const replay = await prisma.order.findUnique({
          where: { idempotencyKey: key },
          select: { code: true, accessToken: true, tableId: true },
        });
        if (replay && replay.tableId === requestTableId) {
          const settings = await getSettings();
          return orderResponse(replay, 200, settings.timeoutBayarMenit * 60);
        }
        if (replay) {
          return apiErrorResponse(
            "CONFLICT",
            "Idempotency-Key sudah dipakai",
            409
          );
        }
      }
    }

    if (!(err instanceof AppError)) {
      logger.error("Error creating order", err);
    }
    return handleApiError(err);
  }
}
