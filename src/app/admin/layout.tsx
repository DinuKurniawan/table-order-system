import { requireRole } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { SessionEnded } from "@/components/session-ended";

export const instant = false;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole(["SUPER_ADMIN"]).catch(() => null);

  if (!user) {
    return <SessionEnded />;
  }

  return <AdminShell user={user}>{children}</AdminShell>;
}
