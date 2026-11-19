import { formatRupiah } from "@/lib/utils";

/** Ambil nilai skalar dari kolom JSON AuditLog.meta. */
export function metaValue(meta: unknown, key: string): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const value = (meta as Record<string, unknown>)[key];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  return null;
}

/**
 * Deskripsi manusiawi untuk baris AuditLog. Dipakai dashboard dan halaman
 * /admin/settings/audit agar keduanya konsisten.
 */
export function describeAudit(
  action: string,
  entity: string,
  meta: unknown
): string {
  const code = metaValue(meta, "code");
  const name = metaValue(meta, "name");
  const username = metaValue(meta, "username");
  const product = name ?? metaValue(meta, "productName");
  const amountRaw = Number(metaValue(meta, "amount") ?? 0);
  const amount =
    Number.isFinite(amountRaw) && amountRaw > 0 ? ` ${formatRupiah(amountRaw)}` : "";

  if (action === "payment.upload") {
    return `Bukti pembayaran pesanan ${code ?? ""} diunggah`.trim();
  }
  if (action === "payment.approve") {
    return `Pembayaran pesanan ${code ?? ""} disetujui`.trim();
  }
  if (action === "payment.reject") {
    return `Pembayaran pesanan ${code ?? ""} ditolak`.trim();
  }
  if (action === "payment.reject.cancel") {
    return `Pembayaran pesanan ${code ?? ""} ditolak dan pesanan dibatalkan`.trim();
  }
  if (action === "order.cancel.refund") {
    return `Pesanan ${code ?? ""} dibatalkan, refund dicatat`.trim();
  }
  if (action === "order.created") {
    const table = metaValue(meta, "tableName");
    return `Pesanan ${code ?? ""} dibuat${table ? ` untuk ${table}` : ""}`.trim();
  }
  if (action === "order.status_change") {
    const from = metaValue(meta, "from");
    const to = metaValue(meta, "to");
    if (from && to) return `Status pesanan ${code ?? ""}: ${from} → ${to}`.trim();
    return `Status pesanan ${code ?? ""} diperbarui`.trim();
  }
  if (action === "order.cancel.customer") {
    return `Pesanan ${code ?? ""} dibatalkan pelanggan`.trim();
  }
  if (action === "order.expire") {
    return `Pesanan ${code ?? ""} kedaluwarsa`.trim();
  }
  if (action === "order.print") {
    return `Struk pesanan ${code ?? ""} dicetak`.trim();
  }
  if (action === "stock.adjust") {
    return product ? `Stok ${product} disesuaikan` : "Stok produk disesuaikan";
  }
  if (action.startsWith("stock.")) {
    return product ? `Stok ${product} diperbarui` : "Stok produk diperbarui";
  }
  if (action.startsWith("transaction.")) {
    const category = metaValue(meta, "category") ?? "transaksi";
    const kind =
      metaValue(meta, "type") === "EXPENSE" ? "Pengeluaran" : "Pemasukan";
    if (action === "transaction.create") {
      return `${kind} ${category}${amount} dicatat`;
    }
    if (action === "transaction.delete") {
      return `${kind} ${category}${amount} dihapus`;
    }
    return `${kind} ${category}${amount} diperbarui`;
  }
  if (action.startsWith("cashier.")) {
    const who = name ?? username ?? "kasir";
    if (action === "cashier.create") return `Kasir baru ditambahkan: ${who}`;
    if (action === "cashier.deactivate") return `Kasir ${who} dinonaktifkan`;
    if (action === "cashier.delete") return `Kasir ${who} dihapus`;
    if (action === "cashier.reset_password") {
      return `Password kasir ${who} direset`;
    }
    return `Data kasir ${who} diperbarui`;
  }
  if (action === "product.create") {
    return product ? `Produk ${product} ditambahkan` : "Produk baru ditambahkan";
  }
  if (action === "product.update") {
    return product ? `Produk ${product} diperbarui` : "Data produk diperbarui";
  }
  if (action === "product.delete") {
    return product ? `Produk ${product} dihapus` : "Produk dihapus";
  }
  if (action.startsWith("category.")) {
    return name ? `Kategori ${name} diperbarui` : "Data kategori diperbarui";
  }
  if (action.startsWith("table.")) {
    return name ? `Meja ${name} diperbarui` : "Data meja diperbarui";
  }
  if (action.startsWith("settings.")) {
    return "Pengaturan aplikasi diperbarui";
  }
  if (action.startsWith("order.")) {
    return `Status pesanan ${code ?? ""} diperbarui`.trim();
  }

  return action.replace(/[._]/g, " ") + ` (${entity})`;
}
