import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { processDocument } from "@/lib/ingest";

/**
 * Nahrání JEDNOHO dokladu.
 *
 * Vlastní route místo server action ze dvou důvodů: čtení dokladu modelem trvá
 * i půl minuty, takže potřebuje vlastní `maxDuration`, a jeden soubor na
 * požadavek se vejde pod limit velikosti těla požadavku (na Vercelu 4,5 MB).
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Nad tenhle strop nemá smysl soubor vůbec posílat — Vercel požadavek zahodí. */
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("file");
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json(
      { fileName: "", ok: false, message: "Soubor se nepodařilo přijmout — je nejspíš příliš velký." },
      { status: 413 },
    );
  }

  if (!file) {
    return NextResponse.json(
      { fileName: "", ok: false, message: "V požadavku nebyl žádný soubor." },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({
      fileName: file.name,
      ok: false,
      message: `Soubor má ${(file.size / 1024 / 1024).toFixed(1)} MB, což je nad limit 4 MB na jeden doklad. Zkuste PDF zmenšit nebo rozdělit.`,
    });
  }

  const outcome = await processDocument(file);

  if (outcome.ok) {
    revalidatePath("/");
    revalidatePath("/faktury");
  }
  return NextResponse.json(outcome);
}
