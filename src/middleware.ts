import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE_NAME = "session_token";

interface TokenPayload {
  sub: string;
  role: string;
  tokenVersion: number;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  let session: TokenPayload | null = null;

  if (token) {
    try {
      const secret = new TextEncoder().encode(
        process.env.SESSION_SECRET || "development-secret-must-be-at-least-32-chars-long!"
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
  ],
};
