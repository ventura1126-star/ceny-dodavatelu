"use client";

import { useMemo, useRef, useState } from "react";
import { normalizeText, similarity } from "@/lib/normalize";

export interface CatalogEntry {
  id: number;
  name: string;
  category: string;
  unit: string;
}

/**
 * Výběr materiálu z katalogu s možností založit nový.
 * Katalog je celý na klientovi, takže našeptávání je okamžité.
 */
export default function MaterialPicker({
  catalog,
  materialId,
  draftName,
  confidence,
  source,
  onPick,
  onDraftName,
}: {
  catalog: CatalogEntry[];
  materialId: number | null;
  draftName: string;
  confidence: number | null;
  source: string | null;
  onPick: (id: number | null, name: string) => void;
  onDraftName: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chosen = materialId ? catalog.find((c) => c.id === materialId) : null;
  const text = query || draftName;

  // Normalizované názvy si předpočítáme jednou, ne při každém stisku klávesy.
  const normalizedNames = useMemo(
    () => new Map(catalog.map((c) => [c.id, normalizeText(c.name)])),
    [catalog],
  );

  const matches = useMemo(() => {
    if (!text.trim()) return catalog.slice(0, 8);
    const tokens = normalizeText(text).split(" ").filter(Boolean);
    return catalog
      .map((c) => {
        const name = normalizedNames.get(c.id) ?? "";
        const substring = tokens.every((t) => name.includes(t)) ? 0.5 : 0;
        return { c, score: substring + similarity(text, c.name) };
      })
      .filter((x) => x.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.c);
  }, [text, catalog, normalizedNames]);

  const exact = catalog.some((c) => normalizeText(c.name) === normalizeText(text));

  return (
    <div className="relative min-w-[16rem]">
      {chosen ? (
        <div className="flex items-center gap-2">
          <span className="truncate rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900 ring-1 ring-emerald-200">
            {chosen.name}
          </span>
          <button
            type="button"
            onClick={() => {
              onPick(null, chosen.name);
              setQuery(chosen.name);
              setOpen(true);
            }}
            className="text-xs text-bark-500 underline hover:text-bark-800"
          >
            změnit
          </button>
          {source === "alias" ? (
            <span className="text-[10px] uppercase tracking-wide text-emerald-700">známé</span>
          ) : null}
        </div>
      ) : (
        <>
          <input
            value={text}
            placeholder="Název materiálu do katalogu"
            onChange={(e) => {
              setQuery(e.target.value);
              onDraftName(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              blurTimer.current = setTimeout(() => setOpen(false), 150);
            }}
            className="w-full rounded-md border border-bark-300 bg-white px-2 py-1 text-sm focus:border-bark-500 focus:outline-none"
          />
          {confidence !== null && confidence > 0.4 && source === "fuzzy" ? (
            <span className="mt-0.5 block text-[10px] text-amber-700">
              návrh podle podobnosti ({Math.round(confidence * 100)} %)
            </span>
          ) : null}
          {open ? (
            <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-bark-300 bg-white shadow-lg">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onMouseDown={() => {
                      if (blurTimer.current) clearTimeout(blurTimer.current);
                      onPick(m.id, m.name);
                      setQuery("");
                      setOpen(false);
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-bark-100"
                  >
                    <span className="font-medium">{m.name}</span>
                    <span className="ml-2 text-xs text-bark-500">
                      {m.category} · {m.unit}
                    </span>
                  </button>
                </li>
              ))}
              {!exact && text.trim() ? (
                <li className="border-t border-bark-200">
                  <div className="px-3 py-1.5 text-xs text-bark-600">
                    Nic nesedí? Po potvrzení faktury se založí nový materiál
                    <span className="font-medium"> „{text.trim()}“</span>.
                  </div>
                </li>
              ) : null}
              {matches.length === 0 && !text.trim() ? (
                <li className="px-3 py-2 text-xs text-bark-500">Katalog je zatím prázdný.</li>
              ) : null}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}
