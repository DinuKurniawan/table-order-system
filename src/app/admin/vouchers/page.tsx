import { connection } from "next/server";
import { listVouchers } from "@/server/services/vouchers";
import { AdminVouchersPage } from "@/components/admin/vouchers-manager";

export const instant = false;

export default async function AdminVouchersRoute() {
  // Kuota/periode voucher bergantung waktu request; jangan diprerender.
  await connection();
  const initialData = await listVouchers({ page: 1, pageSize: 10 });
  return <AdminVouchersPage initialData={initialData} />;
}
