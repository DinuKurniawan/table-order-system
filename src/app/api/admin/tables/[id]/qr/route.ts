import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { getTableForQr } from "@/server/services/tables";
import { renderTableQrPng, renderTableQrSvg } from "@/lib/qr";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    await requireRole(["SUPER_ADMIN"]);
    const { id } = await params;

    const url = new URL(req.url);
    const format = url.searchParams.get("format") === "svg" ? "svg" : "png";
    const download = url.searchParams.get("download") === "1";

    const table = await getTableForQr(id);
    const safeName = table.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const disposition = `${download ? "attachment" : "inline"}; filename="qr-${safeName}.${format}"`;

    if (format === "svg") {
      const svg = await renderTableQrSvg(table.token);
      return new NextResponse(svg, {
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Content-Disposition": disposition,
          "Cache-Control": "no-store",
        },
      });
    }

    const png = await renderTableQrPng(table.token);
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": disposition,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
