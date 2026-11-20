import { notFound, redirect } from "next/navigation";
import { findFirstActiveTableToken } from "@/server/services/tables";

export default async function Home() {
  const token = await findFirstActiveTableToken();
  if (!token) notFound();
  redirect(`/m/${token}`);
}
