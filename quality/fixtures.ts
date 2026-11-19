import {
  CategoryType,
  OrderStatus,
  PaymentStatus,
  Role,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";

export function stamp(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface OrderFixture {
  userId: string;
  tableId: string;
  productId: string;
  orderId: string;
  code: string;
  cleanup: () => Promise<void>;
}

export async function createOrderFixture(options?: {
  status?: OrderStatus;
  withPendingPayment?: boolean;
  stock?: number;
}): Promise<OrderFixture> {
  const id = stamp();
  const category = await prisma.category.create({
    data: { name: `Quality ${id}`, type: CategoryType.FOOD },
  });
  const product = await prisma.product.create({
    data: {
      name: `Produk Quality ${id}`,
      price: 15_000,
      categoryId: category.id,
      stock: options?.stock ?? 20,
      trackStock: true,
    },
  });
  const table = await prisma.table.create({
    data: { name: `Meja Quality ${id}`, token: `quality-table-${id}` },
  });
  const user = await prisma.user.create({
    data: {
      name: `Kasir Quality ${id}`,
      username: `quality-${id}`,
      passwordHash: "x",
      role: Role.CASHIER,
    },
  });
  const code = `QUAL-${id}`;
  const order = await prisma.order.create({
    data: {
      code,
      accessToken: `token-${id}`,
      tableId: table.id,
      status: options?.status ?? OrderStatus.AWAITING_VERIFICATION,
      subtotal: 15_000,
      total: 15_000,
      expiresAt: new Date(Date.now() + 15 * 60_000),
      items: {
        create: {
          productId: product.id,
          nameSnapshot: product.name,
          priceSnapshot: product.price,
          quantity: 1,
        },
      },
      payments:
        options?.withPendingPayment === false
          ? undefined
          : {
              create: {
                attempt: 1,
                proofKey: `quality/${id}.avif`,
                status: PaymentStatus.PENDING,
              },
            },
    },
  });

  return {
    userId: user.id,
    tableId: table.id,
    productId: product.id,
    orderId: order.id,
    code,
    cleanup: async () => {
      const auditWhere: Prisma.AuditLogWhereInput = {
        OR: [{ entityId: order.id }, { userId: user.id }],
      };
      await prisma.auditLog.deleteMany({ where: auditWhere });
      await prisma.transaction.deleteMany({ where: { orderId: order.id } });
      await prisma.stockMovement.deleteMany({
        where: { productId: product.id },
      });
      await prisma.order.deleteMany({ where: { id: order.id } });
      await prisma.table.deleteMany({ where: { id: table.id } });
      await prisma.product.deleteMany({ where: { id: product.id } });
      await prisma.category.deleteMany({ where: { id: category.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    },
  };
}
