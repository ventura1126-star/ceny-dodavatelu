"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { UploadOutcome } from "@/lib/ingest";

export default function Uploader() {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<UploadOutcome[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(
    null,
  );
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const pdfs = Array.from(list).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    setFiles((prev) => [...prev, ...pdfs]);
  }

  /**
   * Doklady se posílají po jednom, každý vlastním požadavkem.
   * Dávka v jednom požadavku přetekla limity Vercelu (4,5 MB na požadavek
   * a doba běhu funkce) a shodila celou stránku.
   */
  async function submit() {
    if (files.length === 0 || busy) return;
    setBusy(true);
    setResults([]);
    const queue = [...files];
    setFiles([]);
    if (inputRef.current) inputRef.current.value = "";

    for (let i = 0; i < queue.length; i++) {
      const file = queue[i];
      setProgress({ done: i, total: queue.length, current: file.name });
      const data = new FormData();
      data.append("file", file);
      try {
        const response = await fetch("/api/doklady/nahrat", { method: "POST", body: data });
        const outcome: UploadOutcome = response.ok
          ? await response.json()
          : {
              fileName: file.name,
              ok: false,
              message:
                response.status === 413
                  ? "Soubor je pro server příliš velký. Zkuste PDF zmenšit."
                  : response.status === 504
                    ? "Čtení dokladu trvalo příliš dlouho a server ho ukončil. U rozsáhlých dokladů pomůže přepnout ANTHROPIC_MODEL na claude-sonnet-5, který je rychlejší."
                    : `Server odpověděl chybou ${response.status}. Zkuste to prosím znovu.`,
            };
        setResults((prev) => [...prev, outcome]);
      } catch {
        setResults((prev) => [
          ...prev,
          {
            fileName: file.name,
            ok: false,
            message: "Spojení se serverem se přerušilo. Zkontrolujte připojení a zkuste to znovu.",
          },
        ]);
      }
    }

    setProgress(null);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`rounded-xl border-2 border-dashed p-10 text-center transition ${
          dragging ? "border-bark-500 bg-bark-100" : "border-bark-300 bg-white"
        }`}
      >
        <p className="font-medium text-bark-800">Přetáhněte sem PDF dokladů</p>
        <p className="mt-1 text-sm text-bark-600">Faktury i cenové nabídky, klidně několik najednou.</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-4 rounded-lg border border-bark-300 bg-white px-4 py-2 text-sm font-medium text-bark-800 transition hover:bg-bark-100"
        >
          Vybrat soubory
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 ? (
        <div className="rounded-xl border border-bark-200 bg-white p-4">
          <p className="text-sm font-medium text-bark-800">
            Připraveno ke zpracování: {files.length}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-bark-600">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-4">
                <span className="truncate">
                  {f.name}
                  {f.size > 4 * 1024 * 1024 ? (
                    <span className="ml-2 text-xs text-rose-600">
                      {(f.size / 1024 / 1024).toFixed(1)} MB — nad limit 4 MB, tenhle neprojde
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-xs text-bark-500 hover:text-rose-600"
                >
                  odebrat
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="mt-4 rounded-lg bg-bark-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-bark-800 disabled:opacity-60"
          >
            {busy ? "Čtu doklady…" : `Zpracovat ${files.length} ${files.length === 1 ? "doklad" : "dokladů"}`}
          </button>
          <p className="mt-2 text-xs text-bark-500">
            Doklady se zpracovávají po jednom, každý zhruba 10–30 sekund. Nezavírejte stránku.
          </p>
        </div>
      ) : null}

      {progress ? (
        <div className="rounded-xl border border-bark-200 bg-white p-4">
          <p className="text-sm font-medium text-bark-800">
            Zpracovávám {progress.done + 1} z {progress.total}: {progress.current}
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-bark-100">
            <div
              className="h-full bg-bark-600 transition-all"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="rounded-xl border border-bark-200 bg-white">
          <div className="border-b border-bark-200 px-4 py-3 text-sm font-semibold text-bark-800">
            Výsledek zpracování
          </div>
          <ul className="divide-y divide-bark-100">
            {results.map((r, i) => (
              <li key={`${r.fileName}-${i}`} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span
                  className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                    r.ok ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                />
                <span className="font-medium text-bark-800">{r.fileName}</span>
                <span className="text-bark-600">{r.message}</span>
                {r.invoiceId ? (
                  <Link
                    href={`/faktury/${r.invoiceId}`}
                    className="ml-auto rounded-md bg-bark-700 px-3 py-1 text-xs font-medium text-white hover:bg-bark-800"
                  >
                    Zkontrolovat
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
