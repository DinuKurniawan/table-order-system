import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { formatWIB, relativeTime } from "@/lib/utils";
import { emitToChannel } from "@/lib/pusher-server";
import { afterCommit } from "@/lib/after-commit";
import crypto from "crypto";

// Rate limit sederhana per IP (melacak melalui req.ip)
function checkRateLimit(ip: string): boolean {
  // Implementasi sederhana: izinkan untuk sekarang
  // Di production, gunakan redis atau rate limiter middleware
  return true;
}

const orderSchema = z.object({
  tableToken: z.string().min(1, "Token meja wajib diisi"),
  customerName: z.string().optional(),
  note: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.string().min(1),
      quantity: z.number().int().min(1, "Minimal 1"),
      note: z.string().optional(),
    })
  ),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validation = orderSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validasi gagal", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { tableToken, customerName, note, items } = validation.data;

    // 1. Validasi meja aktif & pemesanan tidak ditutup
    const table = await prisma.table.findUnique({
      where: { token: tableToken },
    });

    if (!table || !table.isActive) {
      return NextResponse.json(
        { error: "Meja tidak aktif atau tidak ditemukan" },
        { status: 400 }
      );
    }

    // 2. Cek bahwa semua produk ada dan dapat dihitung stok
    // Ambil produk dari DB untuk harga dan stok aktual
    const productIds = items.map((item) => item.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    // 3. Hitung subtotal & total sebelum transaction
    const subtotal = items.reduce((sum, it) => {
      const product = productMap.get(it.productId);
      return sum + (product?.price ?? 0) * it.quantity;
    }, 0);
    const total = subtotal; // untung dikurangi dari stok, total = subtotal untuk kasus sederhana

    // 3. Validasi stok atomik: UPDATE ... WHERE stock >= qty
    // Lakukan dalam satu transaction
    const now = new Date();
    const timeoutMinutes = 15; // timeout bayar
    const expiresAt = new Date(now.getTime() + timeoutMinutes * 60000);

    // Generate order code ORD-YYMMDD-XXXX
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
    const randomPart = crypto.randomBytes(2).toString("hex").toUpperCase();
    const orderCode = `ORD-${datePart}-${randomPart}`;

    // Generate access token acak 16 karakter
    const accessToken = crypto.randomBytes(8).toString("hex");

    await prisma.$transaction(async (tx) => {
      // Buat Order
      const order = await tx.order.create({
        data: {
          code: orderCode,
          accessToken,
          tableId: table.id,
          customerName,
          note,
          status: "AWAITING_PAYMENT",
          expiresAt,
          version: 0,
          subtotal,
          total,
          items: {
            create: items.map((it) => ({
              productId: it.productId,
              quantity: it.quantity,
              note: it.note,
              // Snapshot nama produk dari DB (diberantas client manipulation)
              nameSnapshot: productMap.get(it.productId)?.name ?? "",
              // Snapshot harga dari DB (diberantas client manipulation)
              priceSnapshot: productMap.get(it.productId)?.price ?? 0,
            })),
          },
        },
      });

      // Reservasi stok atomik dan buat StockMovement
      for (const item of items) {
        const product = productMap.get(item.productId);
        if (!product) throw new Error(`Produk ${item.productId} tidak ditemukan`);

        // Update stok: hanya kurangi jika stock >= qty
        const [updatedProduct] = (await tx.$queryRaw`
          UPDATE product SET stock = stock - ${item.quantity}
          WHERE id = ${item.productId} AND stock >= ${item.quantity}
        `) as [any, ...any[]];

        if (updatedProduct.affectedRows === 0) {
          throw new Error(
            `Stok tidak cukup untuk produk ${item.productId}. Sisa stok: ${product?.stock}`
          );
        }

        // Buat StockMovement ORDER_RESERVE
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            type: "ORDER_RESERVE",
            quantity: item.quantity,
            balance: product?.stock - item.quantity, // stok setelah reserve
            note: `Pesanan order ${orderCode}`,
          },
        });

        // Emit stock.changed ke channel private-table-{token}
        afterCommit(() => {
          emitToChannel(
            `private-table-${tableToken}`,
            "stock.changed",
            {
              productId: item.productId,
              newStock: product?.stock - item.quantity,
              orderCode,
            }
          );
        });

        // Emit stock.low jika stok melewati threshold
        if (product?.lowStockThreshold && product.stock - item.quantity <= product.lowStockThreshold) {
          afterCommit(() => {
            emitToChannel(
              `private-admin`,
              "stock.low",
              {
                productId: item.productId,
                newStock: product?.stock - item.quantity,
                orderCode,
              }
            );
          });
        }
      }

      // Emit order.created ke channel cashier & admin
      afterCommit(() => {
        emitToChannel("private-cashier", "order.created", {
          orderCode,
          orderId: order.id,
          tableToken,
          customerName,
        });
        emitToChannel("private-admin", "order.created", {
          orderCode,
          orderId: order.id,
          tableToken,
          customerName,
        });
      });

      // Set cookie httpOnly `order_{code}` berisi accessToken
      const response = NextResponse.json({
        code: orderCode,
        accessToken,
      });

      // Set cookie dengan httpOnly
      response.cookies.set(`order_${orderCode}`, accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        path: "/",
        maxAge: timeoutMinutes * 60,
      });

      return response;
    });

    // Jika transaction gagal (stok insufficient)
    return NextResponse.json(
      { error: "Stok tidak cukup untuk semua item pesanan" },
      { status: 400 }
    );
  } catch (err) {
    console.error("Error creating order:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan saat memesan" },
      { status: 500 }
    );
  }
}