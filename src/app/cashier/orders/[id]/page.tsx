import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { getCashierOrder } from "@/server/services/cashier-orders";
import { CashierOrderDetail } from "@/components/cashier/cashier-order-detail";

export default async function CashierOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["CASHIER", "SUPER_ADMIN"]);
  const { id } = await params;

  let order;
  try {
    order = await getCashierOrder(id);
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }

  return <CashierOrderDetail initial={order} />;
}
