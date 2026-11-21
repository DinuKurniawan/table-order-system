import { listTables } from "@/server/services/tables";
import { AdminTablesPage } from "@/components/admin/tables-manager";

export const instant = false;

export default async function AdminTablesRoute() {
  // Render server: kartu meja + QR ikut HTML pertama (target LCP).
  const initialTables = await listTables();
  return <AdminTablesPage initialTables={initialTables} />;
}
