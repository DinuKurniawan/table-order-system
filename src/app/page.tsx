import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { findFirstActiveTableToken } from "@/server/services/tables";

// Redirect butuh data DB per request; tanpa connection() halaman ikut
// diprerender saat build dan 404 lama tersimpan sebagai shell statis.
export const instant = false;

export default async function Home() {
  await connection();
  const token = await findFirstActiveTableToken();
  if (!token) notFound();
  redirect(`/m/${token}`);
}
