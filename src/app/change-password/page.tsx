import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ChangePasswordForm } from "./change-password-form";

export const instant = false;

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!user.mustChangePassword) {
    redirect(user.role === "SUPER_ADMIN" ? "/admin" : "/cashier");
  }

  return <ChangePasswordForm username={user.username} />;
}
