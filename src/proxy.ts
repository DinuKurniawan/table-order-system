import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { isAllowedOrigin } from "@/lib/request-origin";

const SESSION_COOKIE_NAME = "session_token";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

interface TokenPayload {
  sub: string;
  role: string;
  tokenVersion: number;
  mustChangePassword?: boolean;
}

/**
 * Proteksi CSRF untuk mutasi berbasis cookie.
 *
 * Origin/Referer dibandingkan dengan APP_BASE_URL + ALLOWED_ORIGINS, bukan
 * header Host yang bisa dipalsukan klien. Mutasi tanpa Origin/Referer hanya
 * diizinkan untuk endpoint cron yang dilindungi secret.
 */
export function isSameOrigin(req: NextRequest): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;

  const hasOriginOrReferer =
    Boolean(req.headers.get("origin")) || Boolean(req.headers.get("referer"));
  if (!hasOriginOrReferer) {
    return req.nextUrl.pathname.startsWith("/api/cron/");
  }

  return isAllowedOrigin(req);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/api") &&
    MUTATING_METHODS.has(req.method) &&
    !isSameOrigin(req)
  ) {
    return NextResponse.json(
      { error: "Permintaan lintas situs ditolak", code: "CSRF" },
      { status: 403 }
    );
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  let session: TokenPayload | null = null;

  if (token) {
    try {
      const secret = new TextEncoder().encode(
        process.env.SESSION_SECRET ||
          "development-secret-must-be-at-least-32-chars-long!"
      );
      const { payload } = await jwtVerify(token, secret);
      if (payload.sub && payload.role && typeof payload.tokenVersion === "number") {
        session = {
          sub: payload.sub,
          role: payload.role as string,
          tokenVersion: payload.tokenVersion,
          mustChangePassword: payload.mustChangePassword === true,
        };
      }
    } catch {
      session = null;
    }
  }

  const isLoginPage = pathname === "/login";
  const isAdminPath = pathname.startsWith("/admin");
  const isCashierPath = pathname.startsWith("/cashier");
  const isChangePasswordPath = pathname === "/change-password";

  // Jika sudah login dan mencoba mengakses /login, redirect ke dashboard yang sesuai
  if (isLoginPage && session) {
    const targetUrl = session.mustChangePassword
      ? "/change-password"
      : session.role === "SUPER_ADMIN"
        ? "/admin"
        : "/cashier";
    return NextResponse.redirect(new URL(targetUrl, req.url));
  }

  // SEC-01: sesi dengan password awal hanya boleh membuka /change-password.
  if (session?.mustChangePassword && (isAdminPath || isCashierPath)) {
    return NextResponse.redirect(new URL("/change-password", req.url));
  }

  if (isChangePasswordPath) {
    if (!session) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (!session.mustChangePassword) {
      return NextResponse.redirect(
        new URL(session.role === "SUPER_ADMIN" ? "/admin" : "/cashier", req.url)
      );
    }
  }

  // Lindungi rute /admin (hanya SUPER_ADMIN)
  if (isAdminPath) {
    if (!session) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (session.role !== "SUPER_ADMIN") {
      // Kasir mencoba masuk ke admin -> redirect ke /cashier
      return NextResponse.redirect(new URL("/cashier", req.url));
    }
  }

  // Lindungi rute /cashier (CASHIER dan SUPER_ADMIN)
  if (isCashierPath) {
    if (!session) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (session.role !== "CASHIER" && session.role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/cashier/:path*",
    "/login",
    "/change-password",
    "/api/:path*",
  ],
};
