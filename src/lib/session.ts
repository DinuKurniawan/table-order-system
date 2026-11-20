import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";
import { sessionCookieName, SESSION_COOKIE_BASE_NAME } from "@/lib/session-cookie";
import { Role } from "@prisma/client";

export const SESSION_DURATION_SECONDS = 12 * 60 * 60; // 12 jam

export interface SessionPayload {
  sub: string;
  role: Role;
  tokenVersion: number;
  mustChangePassword?: boolean;
}

function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(env.SESSION_SECRET);
}

/**
 * Membuat token JWT sesi
 */
export async function signSessionToken(payload: SessionPayload): Promise<string> {
  const secret = getJwtSecret();
  return new SignJWT({
    role: payload.role,
    tokenVersion: payload.tokenVersion,
    mustChangePassword: payload.mustChangePassword === true,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(secret);
}

/**
 * Membuat token JWT sesi dan menyimpannya di cookie httpOnly
 */
export async function createSession(
  payload: SessionPayload,
  response?: NextResponse
): Promise<string> {
  const token = await signSessionToken(payload);
  // SEC-14: tanpa Domain agar `__Host-` valid; Path=/ wajib.
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  };

  if (response) {
    response.cookies.set(sessionCookieName(), token, cookieOptions);
  } else {
    const cookieStore = await cookies();
    cookieStore.set(sessionCookieName(), token, cookieOptions);
  }

  return token;
}

/**
 * Memverifikasi string JWT dan mengembalikan SessionPayload jika valid
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);

    if (
      !payload.sub ||
      !payload.role ||
      typeof payload.tokenVersion !== "number"
    ) {
      return null;
    }

    return {
      sub: payload.sub,
      role: payload.role as Role,
      tokenVersion: payload.tokenVersion,
      mustChangePassword: payload.mustChangePassword === true,
    };
  } catch {
    return null;
  }
}

/**
 * Mengambil nilai raw session token dari cookie
 */
export async function getSessionToken(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(sessionCookieName())?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Mengambil dan memverifikasi payload sesi dari cookie
 */
export async function getSessionPayload(): Promise<SessionPayload | null> {
  const token = await getSessionToken();
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Menghapus cookie sesi saat logout.
 *
 * SEC-14: logout tetap stateless (tidak menaikkan tokenVersion) agar sesi di
 * perangkat lain tidak ikut terputus. Nama lama ikut dihapus untuk membersihkan
 * cookie setelah deploy yang mengganti nama cookie.
 */
export async function destroySession(response?: NextResponse): Promise<void> {
  const names = [
    sessionCookieName(),
    ...(sessionCookieName() === SESSION_COOKIE_BASE_NAME
      ? []
      : [SESSION_COOKIE_BASE_NAME]),
  ];

  if (response) {
    for (const name of names) response.cookies.delete(name);
  } else {
    try {
      const cookieStore = await cookies();
      for (const name of names) cookieStore.delete(name);
    } catch {
      // Abaikan jika di luar request scope
    }
  }
}
