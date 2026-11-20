import { apiErrorMessage } from "@/lib/api-error";

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(apiErrorMessage(json, "Permintaan gagal"));
  return json as T;
}
