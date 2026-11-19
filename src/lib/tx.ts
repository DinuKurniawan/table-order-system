import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Transaksi dengan outbox in-memory per transaksi (audit T-03).
 *
 * Callback `after()` HANYA dijalankan setelah `prisma.$transaction` commit
 * sukses, berurutan, dan error-nya tidak menggagalkan request. Bila transaksi
 * rollback, seluruh callback dibuang. Pemanggilan bersarang memakai transaksi
 * induk lewat AsyncLocalStorage, bukan membuka transaksi kedua.
 */
export type AfterCommit = () => void | Promise<void>;

interface TxScope {
  tx: Prisma.TransactionClient;
  after: AfterCommit[];
}

const scope = new AsyncLocalStorage<TxScope>();

export function isInTransaction(): boolean {
  return scope.getStore() !== undefined;
}

export interface TransactionOptions {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

export async function runInTransaction<T>(
  fn: (
    tx: Prisma.TransactionClient,
    after: (callback: AfterCommit) => void
  ) => Promise<T>,
  options?: TransactionOptions
): Promise<T> {
  const parent = scope.getStore();
  if (parent) {
    // Transaksi bersarang: callback menempel ke transaksi induk.
    return fn(parent.tx, (callback) => parent.after.push(callback));
  }

  const callbacks: AfterCommit[] = [];

  const result = await prisma.$transaction(
    (tx) =>
      scope.run({ tx, after: callbacks }, () =>
        fn(tx, (callback) => callbacks.push(callback))
      ),
    options
  );

  // Commit sukses: jalankan berurutan. Error emit tidak boleh menggagalkan request.
  for (const callback of callbacks) {
    try {
      await callback();
    } catch (err) {
      logger.error("after-commit callback failed", err);
    }
  }

  return result;
}
