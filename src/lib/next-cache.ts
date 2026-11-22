import { revalidateTag, unstable_cache } from "next/cache";

/**
 * `unstable_cache` dan `revalidateTag` melempar invariant bila dipanggil di
 * luar request Next (mis. `node:test`). Di luar request tidak ada cache yang
 * bisa dibaca atau diinvalidasi, jadi memanggil fungsi aslinya tanpa cache
 * adalah perilaku yang benar.
 */
const MISSING_STORE =
  /incrementalCache missing|static generation store missing/;

function outsideRequestContext(error: unknown): boolean {
  return error instanceof Error && MISSING_STORE.test(error.message);
}

/** `unstable_cache` dengan fallback tanpa cache di luar request Next. */
export function cacheable<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  keyParts: string[],
  options: { revalidate?: number | false; tags?: string[] }
): (...args: Args) => Promise<Result> {
  const cached = unstable_cache(
    fn as unknown as (...args: unknown[]) => Promise<unknown>,
    keyParts,
    options
  );

  return async (...args: Args) => {
    try {
      return (await cached(...args)) as Result;
    } catch (error) {
      if (!outsideRequestContext(error)) throw error;
      return fn(...args);
    }
  };
}

/** `revalidateTag` yang tidak melempar bila dipanggil di luar request Next. */
export function invalidateTag(tag: string): void {
  try {
    revalidateTag(tag, { expire: 0 });
  } catch (error) {
    if (!outsideRequestContext(error)) throw error;
  }
}
