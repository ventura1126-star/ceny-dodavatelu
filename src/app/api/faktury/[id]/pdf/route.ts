import { NextResponse } from "next/server";
import { one } from "@/db";

/** Vrátí originální PDF faktury, ať je při kontrole položek po ruce. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await one<{ mime: string; data: Uint8Array; file_name: string | null }>(
    `SELECT f.mime, f.data, i.file_name
     FROM invoice_files f JOIN invoices i ON i.id = f.invoice_id
     WHERE f.invoice_id = ?`,
    [Number(id)],
  );
  if (!row) return new NextResponse("Soubor nenalezen", { status: 404 });

  return new NextResponse(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime || "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(row.file_name ?? `faktura-${id}.pdf`)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
