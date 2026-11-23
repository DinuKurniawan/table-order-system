import { listVouchers } from "@/server/services/vouchers";
import { AdminVouchersPage } from "@/components/admin/vouchers-manager";

export const instant = false;

export default async function AdminVouchersRoute() {
  const initialData = await listVouchers({ page: 1, pageSize: 10 });
  return <AdminVouchersPage initialData={initialData} />;
}
