"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { uploadInvoices, type UploadOutcome } from "@/lib/actions";

export default function Uploader() {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<UploadOutcome[]>([]);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const pdfs = Array.from(list).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    setFiles((prev) => [...prev, ...pdfs]);
  }

  function submit() {
    if (files.length === 0) return;
    const data = new FormData();
    for (const file of files) data.append("files", file);
    startTransition(async () => {
      const outcome = await uploadInvoices(data);
      setResults(outcome);
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
    });
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
        <p className="font-medium text-bark-800">Přetáhněte sem PDF faktury</p>
        <p className="mt-1 text-sm text-bark-600">Můžete nahrát i několik faktur najednou.</p>
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
                <span className="truncate">{f.name}</span>
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
            disabled={pending}
            className="mt-4 rounded-lg bg-bark-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-bark-800 disabled:opacity-60"
          >
            {pending ? "Čtu faktury…" : `Zpracovat ${files.length} ${files.length === 1 ? "fakturu" : "faktur"}`}
          </button>
          {pending ? (
            <p className="mt-2 text-xs text-bark-500">
              Vytěžení jedné faktury trvá zhruba 10–30 sekund. Nezavírejte stránku.
            </p>
          ) : null}
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
