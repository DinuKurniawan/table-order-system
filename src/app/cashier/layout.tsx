import { requireRole } from "@/lib/auth";
import { AuthHeader } from "@/components/auth-header";
import { CashierHeaderControls } from "@/components/cashier/cashier-header-controls";
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
        actions={<CashierHeaderControls />}
      />
      <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto print:p-0 print:max-w-none">
        {children}
      </main>
    </div>
  );
}
