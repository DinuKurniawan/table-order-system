import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const r2PublicOrigin = originOf(process.env.R2_PUBLIC_BASE_URL);

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]),
];

/**
 * SEC-16: respons berisi data sesi/pesanan tidak boleh disimpan cache.
 * Diterapkan terpusat di sini agar route baru di kelompok yang sama ikut
 * terlindungi tanpa perlu ingat menambah header di handler.
 */
const noStoreHeaders = [{ key: "Cache-Control", value: "private, no-store" }];

const sensitiveApiSources = [
  "/api/admin/:path*",
  "/api/cashier/:path*",
  "/api/public/orders/:path*",
  "/api/auth/:path*",
  "/api/pusher/auth",
  "/api/upload/:path*",
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  images: {
    remotePatterns: r2PublicOrigin
      ? [
          {
            protocol: "https" as const,
            hostname: new URL(r2PublicOrigin).hostname,
            pathname: "/**",
          },
        ]
      : [],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      ...sensitiveApiSources.map((source) => ({
        source,
        headers: noStoreHeaders,
      })),
      // Menu publik berubah mengikuti stok realtime; jangan di-cache.
      {
        source: "/api/public/menu",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
