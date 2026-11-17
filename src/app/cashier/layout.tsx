import { requireRole } from "@/lib/auth";
import { AuthHeader } from "@/components/auth-header";
import { SessionEnded } from "@/components/session-ended";

export const instant = false;

export default async function CashierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole(["CASHIER", "SUPER_ADMIN"]).catch(() => null);

  if (!user) {
    return <SessionEnded />;
  }

  return (
    <div className="min-h-screen bg-app flex flex-col">
      <AuthHeader
        userName={user.name}
        role={user.role}
        title="Panel Antrean Kasir"
      />
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">{children}</main>
    </div>
  );
}
