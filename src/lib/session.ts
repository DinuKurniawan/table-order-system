import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";
import { Role } from "@prisma/client";

export const SESSION_COOKIE_NAME = "session_token";
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
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  };

  if (response) {
    response.cookies.set(SESSION_COOKIE_NAME, token, cookieOptions);
  } else {
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, cookieOptions);
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
    return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
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
 * Menghapus cookie sesi saat logout
 */
export async function destroySession(response?: NextResponse): Promise<void> {
  if (response) {
    response.cookies.delete(SESSION_COOKIE_NAME);
  } else {
    try {
      const cookieStore = await cookies();
      cookieStore.delete(SESSION_COOKIE_NAME);
    } catch {
      // Abaikan jika di luar request scope
    }
  }
}
