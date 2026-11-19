import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  advanceOrderStatus,
  approvePayment,
  rejectPayment,
} from "@/server/services/cashier-orders";
import { createOrderFixture, type OrderFixture } from "./fixtures";

const fixtures: OrderFixture[] = [];

afterEach(async () => {
  while (fixtures.length) {
    await fixtures.pop()?.cleanup();
  }
});

describe("state machine pesanan", () => {
  it("menyetujui pembayaran dua kali secara bersamaan hanya sekali", async () => {
    const fixture = await createOrderFixture();
    fixtures.push(fixture);

    const results = await Promise.allSettled([
      approvePayment(fixture.orderId, fixture.userId),
      approvePayment(fixture.orderId, fixture.userId),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: "CONFLICT",
    });

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: fixture.orderId },
      include: { payments: true },
    });
    expect(order.status).toBe("ACCEPTED");
    expect(order.version).toBe(1);
    expect(order.payments.filter((p) => p.status === "APPROVED")).toHaveLength(1);
    expect(
      await prisma.transaction.count({ where: { orderId: fixture.orderId } })
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { entityId: fixture.orderId, action: "payment.approve" },
      })
    ).toBe(1);
  });

  it("menolak pembayaran idempoten dan hanya mengembalikan stok sekali", async () => {
    const fixture = await createOrderFixture({ stock: 5 });
    fixtures.push(fixture);
    await prisma.$executeRaw`UPDATE "Product" SET stock = stock - 1 WHERE id = ${fixture.productId}`;

    const first = await rejectPayment(
      fixture.orderId,
      fixture.userId,
      "Bukti buram"
    );
    expect(first.status).toBe("PAYMENT_REJECTED");

    await expect(
      rejectPayment(fixture.orderId, fixture.userId, "Bukti buram")
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const stock = await prisma.product.findUniqueOrThrow({
      where: { id: fixture.productId },
    });
    expect(stock.stock).toBe(4);
  });

  it("menolak transisi status yang tidak berurutan", async () => {
    const fixture = await createOrderFixture({ status: "ACCEPTED" });
    fixtures.push(fixture);

    await expect(
      advanceOrderStatus(fixture.orderId, fixture.userId, "COMPLETED")
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      advanceOrderStatus(fixture.orderId, fixture.userId, "CANCELLED")
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const preparing = await advanceOrderStatus(
      fixture.orderId,
      fixture.userId,
      "PREPARING"
    );
    expect(preparing.status).toBe("PREPARING");
    const ready = await advanceOrderStatus(
      fixture.orderId,
      fixture.userId,
      "READY"
    );
    expect(ready.status).toBe("READY");
    const completed = await advanceOrderStatus(
      fixture.orderId,
      fixture.userId,
      "COMPLETED"
    );
    expect(completed.status).toBe("COMPLETED");
    expect(completed.version).toBe(3);
  });
});
