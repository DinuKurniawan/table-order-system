import { notFound, redirect } from "next/navigation";
import { findFirstActiveTableToken } from "@/server/services/tables";

// Redirect butuh data DB per request; izinkan route memblokir (bukan static shell).
export const instant = false;

export default async function Home() {
  const token = await findFirstActiveTableToken();
  if (!token) notFound();
  redirect(`/m/${token}`);
}
