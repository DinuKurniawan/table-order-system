import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { isAllowedOrigin } from "@/lib/request-origin";
import { requireSessionSecret } from "@/lib/secret-policy";
import { sessionCookieName } from "@/lib/session-cookie";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * N-02: CSP ditegakkan secara default (`Content-Security-Policy`), bukan
 * Report-Only. Nonce tidak dipakai karena shell PPR/prerender dibuat saat
 * build tanpa nonce; `script-src 'self' 'unsafe-inline'` membuat skrip
 * framework tetap jalan sementara origin skrip luar tetap diblokir.
 * `CSP_ENFORCE=false` atau `CSP_REPORT_ONLY=true` mengembalikan Report-Only.
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
 * SEC-04 + N-02: CSP yang ditegakkan. Nonce per permintaan tidak kompatibel
 * dengan shell PPR yang diprerender (skripnya tidak membawa nonce), jadi
 * `script-src` memakai 'self' + 'unsafe-inline' dan bukan 'strict-dynamic'.
 * Origin skrip/connect/img tetap dibatasi secara eksplisit.
 */
function buildCsp(reportOnly: boolean): string {
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
  const r2Storage = r2AccountId
    ? (() => {
        const origin =
          originOf(r2AccountId) ??
          `https://${
            r2AccountId.includes(".")
              ? r2AccountId
              : `${r2AccountId}.r2.cloudflarestorage.com`
          }`;
        // Presigned URL R2 memakai host per-bucket: <bucket>.<akun>.r2...
        // Wildcard dibatasi ke akun ini; *.r2.cloudflarestorage.com global tetap dilarang.
        if (!new URL(origin).hostname.endsWith(".r2.cloudflarestorage.com")) {
          return [origin]; // MinIO/path-style: host tunggal
        }
        return [origin, `https://*.${new URL(origin).hostname}`];
      })()
    : [];

  const img = [
    "'self'",
    "data:",
    "blob:",
    ...(r2Public ? [r2Public] : []),
    // Bukti bayar/lampiran privat dibuka lewat presigned URL di <img>.
    ...r2Storage,
  ];
  const connect = [
    "'self'",
    ...pusher,
    // Direct upload: browser PUT ke endpoint S3 R2 via presigned URL.
    ...r2Storage,
    ...(isDev ? ["ws://localhost:*", "http://localhost:*"] : []),
  ];

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
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
  const reportOnly =
    process.env.CSP_REPORT_ONLY === "true" ||
    process.env.CSP_ENFORCE === "false";
  const csp = buildCsp(reportOnly);
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

  const token = req.cookies.get(sessionCookieName())?.value;

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
      // Aset statis tidak perlu CSP/sesi; lewati agar proxy tidak memproses
      // setiap gambar/ikon/font.
      source:
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpe?g|gif|webp|avif|ico|txt|xml|woff2?|ttf|otf)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
