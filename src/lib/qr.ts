import QRCode from "qrcode";
import { env } from "@/lib/env";

const QR_OPTIONS = {
  errorCorrectionLevel: "M",
  margin: 2,
} as const;

/** URL yang di-encode QR meja: `${APP_BASE_URL}/m/${token}`. */
export function tableOrderUrl(token: string): string {
  return `${env.APP_BASE_URL.replace(/\/$/, "")}/m/${token}`;
}

/** PNG 512px, error correction M, margin 2 modul. */
export function renderTableQrPng(token: string): Promise<Buffer> {
  return QRCode.toBuffer(tableOrderUrl(token), { ...QR_OPTIONS, width: 512 });
}

/** SVG, error correction M, margin 2 modul. */
export function renderTableQrSvg(token: string): Promise<string> {
  return QRCode.toString(tableOrderUrl(token), { ...QR_OPTIONS, type: "svg" });
}
