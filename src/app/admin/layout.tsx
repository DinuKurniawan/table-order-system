import { requireRole } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";

export const instant = false;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole(["SUPER_ADMIN"]);

  return <AdminShell user={user}>{children}</AdminShell>;
}
