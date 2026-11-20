import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { isAllowedOrigin } from "@/lib/request-origin";
import { requireSessionSecret } from "@/lib/secret-policy";

const SESSION_COOKIE_NAME = "session_token";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * SEC-04: dengan Cache Components, shell halaman partial-prerender (mis.
 * /order/[code], /cashier/orders/[id]) dibuat saat build sehingga skripnya
 * tidak bisa diberi nonce per permintaan; 'strict-dynamic' akan memblokirnya.
 * Karena itu default produksi Report-Only. Set CSP_ENFORCE=true setelah
 * prerender statis/PPR dimatikan atau nonce bisa diterapkan ke shell.
 */

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * SEC-04: CSP nonce per permintaan. `script-src` tanpa 'unsafe-inline';
 * nonce diteruskan ke Next.js lewat header request agar skrip framework
 * ikut ditandai nonce (lihat docs/01-app/02-guides/content-security-policy).
 */
function buildCsp(nonce: string, reportOnly: boolean): string {
  const isDev = process.env.NODE_ENV === "development";
  const cluster =
    process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? process.env.PUSHER_CLUSTER;
  const pusher = cluster
    ? [
        `https://ws-${cluster}.pusher.com`,
        `wss://ws-${cluster}.pusher.com`,
        `https://sockjs-${cluster}.pusher.com`,
      ]
    : [];
  const r2Public = originOf(process.env.R2_PUBLIC_BASE_URL);
  const r2AccountId = process.env.R2_ACCOUNT_ID?.trim();
  const r2Account = r2AccountId
    ? originOf(r2AccountId) ??
      (r2AccountId.includes(".")
        ? `https://${r2AccountId}`
        : `https://${r2AccountId}.r2.cloudflarestorage.com`)
    : null;

  const img = [
    "'self'",
    "data:",
    "blob:",
    ...(r2Public ? [r2Public] : []),
    // Bukti bayar/lampiran privat dibuka lewat presigned URL di <img>.
    ...(r2Account ? [r2Account] : []),
  ];
  const connect = [
    "'self'",
    ...pusher,
    ...(isDev ? ["ws://localhost:*", "http://localhost:*"] : []),
  ];

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${img.join(" ")}`,
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    "media-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev || reportOnly ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

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
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const reportOnly =
    process.env.CSP_REPORT_ONLY === "true" ||
    process.env.CSP_ENFORCE !== "true";
  const csp = buildCsp(nonce, reportOnly);
  const cspHeaderName = reportOnly
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";

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
      const secret = requireSessionSecret();
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

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set(cspHeaderName, csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
