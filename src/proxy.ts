import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE_NAME = "session_token";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

interface TokenPayload {
  sub: string;
  role: string;
  tokenVersion: number;
}

/**
 * Proteksi CSRF untuk mutasi berbasis cookie.
 *
 * Browser modern mengirim Origin pada POST/PUT/PATCH/DELETE dan Sec-Fetch-Site.
 * Keduanya harus same-origin. Request non-browser (tanpa header tersebut)
 * diizinkan karena tidak membawa cookie korban secara otomatis.
 */
function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const expectedHost =
        req.headers.get("x-forwarded-host") ??
        req.headers.get("host") ??
        req.nextUrl.host;
      if (originUrl.host !== expectedHost) return false;
    } catch {
      return false;
    }
  }

  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;

  return true;
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
        };
      }
    } catch {
      session = null;
    }
  }

  const isLoginPage = pathname === "/login";
  const isAdminPath = pathname.startsWith("/admin");
  const isCashierPath = pathname.startsWith("/cashier");

  // Jika sudah login dan mencoba mengakses /login, redirect ke dashboard yang sesuai
  if (isLoginPage && session) {
    const targetUrl = session.role === "SUPER_ADMIN" ? "/admin" : "/cashier";
    return NextResponse.redirect(new URL(targetUrl, req.url));
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
    "/api/:path*",
  ],
};
