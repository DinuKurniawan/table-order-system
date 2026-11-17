/**
 * In-memory sliding rate limiter untuk proteksi brute force login.
 * 
 * BATASAN & CATATAN ARSITEKTUR:
 * Penyimpanan in-memory ini efektif untuk lingkungan single-instance (Node.js monolith / server mandiri).
 * Pada lingkungan multi-instance, serverless lambdas, atau multi-region deployment,
 * ganti penyimpanan ini dengan Redis terpusat (contoh: Upstash Redis / Redis Cloud).
 */

interface RateLimitRecord {
  attempts: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitRecord>();

// Bersihkan data lama secara berkala setiap 5 menit
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of memoryStore.entries()) {
      if (now > record.resetAt) {
        memoryStore.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref?.();
}

export function isRateLimited(
  key: string,
  maxAttempts: number = 5
): { limited: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  const record = memoryStore.get(key);

  if (!record || now > record.resetAt) {
    return {
      limited: false,
      remaining: maxAttempts,
      retryAfterSeconds: 0,
    };
  }

  if (record.attempts >= maxAttempts) {
    const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1000);
    return {
      limited: true,
      remaining: 0,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    };
  }

  return {
    limited: false,
    remaining: maxAttempts - record.attempts,
    retryAfterSeconds: 0,
  };
}

export function recordFailedAttempt(
  key: string,
  windowMs: number = 60 * 1000
): void {
  const now = Date.now();
  const record = memoryStore.get(key);

  if (!record || now > record.resetAt) {
    memoryStore.set(key, {
      attempts: 1,
      resetAt: now + windowMs,
    });
  } else {
    record.attempts += 1;
  }
}

export function resetRateLimit(key: string): void {
  memoryStore.delete(key);
}
