import * as argon2 from "argon2";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  getSessionPayload,
  destroySession,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";
import { AuthError } from "@/lib/errors";
import { Role, User } from "@prisma/client";

/**
 * Hash password menggunakan algoritma argon2id
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

/**
 * Verifikasi password plain text terhadap hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export type SafeUser = Omit<User, "passwordHash">;

/**
 * Memvalidasi sesi user terhadap basis data (pemeriksaan isActive dan tokenVersion)
 */
export async function authenticateSession(
  payload: { sub: string; role: Role; tokenVersion: number } | null
): Promise<SafeUser | null> {
  if (!payload) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
  });

  // Validasi: user wajib ada, isActive = true, dan tokenVersion harus cocok persis
  if (!user || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

/**
 * Memvalidasi otorisasi role untuk user yang sudah terautentikasi
 */
export function authorizeRole(
  user: SafeUser | null,
  allowedRoles: Role[]
): SafeUser {
  if (!user) {
    throw new AuthError(
      "UNAUTHENTICATED",
      "Sesi Anda tidak valid atau telah berakhir. Silakan login kembali."
    );
  }

  if (user.mustChangePassword) {
    throw new AuthError(
      "PASSWORD_CHANGE_REQUIRED",
      "Anda wajib mengganti password sebelum mengakses fitur lain."
    );
  }

  if (!allowedRoles.includes(user.role)) {
    throw new AuthError(
      "FORBIDDEN",
      "Anda tidak memiliki hak akses untuk halaman atau tindakan ini."
    );
  }

  return user;
}

/**
 * Validasi sesi dari cookie pada NextRequest. Memakai jalur yang sama dengan
 * getCurrentUser/requireRole: authenticateSession memeriksa isActive dan
 * tokenVersion di database (audit T-04).
 */
export async function authenticateRequest(
  req: NextRequest
): Promise<SafeUser | null> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const payload = token ? await verifySessionToken(token) : null;
  return authenticateSession(payload);
}

/**
 * Mengambil data user aktif dari sesi cookie dan memvalidasi ke DB
 */
export async function getCurrentUser(): Promise<SafeUser | null> {
  const payload = await getSessionPayload();
  const user = await authenticateSession(payload);

  if (payload && !user) {
    try {
      await destroySession();
    } catch {
      // Abaikan jika dipanggil dalam konteks read-only server component
    }
  }

  return user;
}

/**
 * Validasi role di server. Wajib dipanggil pada route handler, server action, dan server component terproteksi.
 */
export async function requireRole(allowedRoles: Role[]): Promise<SafeUser> {
  const user = await getCurrentUser();
  return authorizeRole(user, allowedRoles);
}
