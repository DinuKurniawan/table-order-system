import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getFinanceOverview } from "@/server/services/finance";
import { stamp } from "./fixtures";

let userId: string | null = null;

afterEach(async () => {
  await prisma.transaction.deleteMany({
    where: { note: { startsWith: "quality-finance-" } },
  });
  if (userId) {
    await prisma.user.deleteMany({ where: { id: userId } });
    userId = null;
  }
});

describe("agregasi keuangan", () => {
  it("menjumlahkan pemasukan, pengeluaran, net, dan bucket harian", async () => {
    const id = stamp();
    const user = await prisma.user.create({
      data: {
        name: `Finance ${id}`,
        username: `finance-${id}`,
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    });
    userId = user.id;

    await prisma.transaction.createMany({
      data: [
        {
          type: "INCOME",
          category: "Penjualan",
          amount: 100_000,
          note: `quality-finance-${id}-in`,
          createdById: user.id,
          occurredAt: new Date("2020-01-02T03:00:00.000Z"),
        },
        {
          type: "EXPENSE",
          category: "Bahan Baku",
          amount: 40_000,
          note: `quality-finance-${id}-out`,
          createdById: user.id,
          occurredAt: new Date("2020-01-02T05:00:00.000Z"),
        },
      ],
    });

    const overview = await getFinanceOverview({
      preset: "custom",
      from: "2020-01-02",
      to: "2020-01-02",
    });

    expect(overview.summary).toEqual({
      income: 100_000,
      expense: 40_000,
      net: 60_000,
      count: 2,
    });
    const point = overview.series.find((row) => row.bucket === "2020-01-02");
    expect(point).toMatchObject({ income: 100_000, expense: 40_000 });
  });
});
