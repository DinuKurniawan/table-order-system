/**
 * Helper menjalankan callback setelah Prisma $transaction commit sukses.
 * 
 * Gunakan seperti ini di service layer:
 * 
 *   const result = await prisma.$transaction(async (tx) => {
 *     // ... business logic
 *     return result;
 *   });
 *   
 *   afterCommit(() => {
 *     emitToChannel("private-cashier", "order.status_changed", { orderId, status });
 *   });
 * 
 * catatan: afterCommit harus dipanggil setelah await prisma.$transaction(...),
 * bukan di dalam transaction itself. Ini memastikan emit terjadi setelah data
 * secara pasti sudah tercommit ke DB.
 */
export function afterCommit(fn: () => void): void {
  // queueMicrotask berjalan setelah microtasks current queue selesai,
  // yang efektif setelah promise/await chain selesai (termasuk Prisma transaction commit).
  queueMicrotask(fn);
}