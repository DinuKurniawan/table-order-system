import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const r2Origin = (() => {
  const base = process.env.R2_PUBLIC_BASE_URL;
  if (!base) return null;
  try {
    return new URL(base).origin;
  } catch {
    return null;
  }
})();

export const metadata: Metadata = {
  title: "Sistem Pemesanan F&B via QR Meja",
  description: "Aplikasi pemesanan makanan & minuman via QR meja realtime",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${poppins.variable} font-sans h-full antialiased`}
    >
      {/* Thumbnail menu dilayani langsung dari CDN R2; buka koneksi lebih awal. */}
      {r2Origin && <link rel="preconnect" href={r2Origin} />}
      <body className="min-h-full flex flex-col bg-app text-foreground font-sans">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
