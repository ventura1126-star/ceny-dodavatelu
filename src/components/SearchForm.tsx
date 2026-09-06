"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/** Vyhledávání materiálu — drží se v URL, aby šel výsledek poslat kolegovi odkazem. */
export default function SearchForm({ categories }: { categories: readonly string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [category, setCategory] = useState(params.get("kategorie") ?? "");

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams();
      if (q.trim()) next.set("q", q.trim());
      if (category) next.set("kategorie", category);
      router.replace(`/materialy${next.toString() ? `?${next}` : ""}`, { scroll: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [q, category, router]);

  return (
    <div className="mb-6 flex flex-wrap gap-3">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Zadejte materiál — např. kvh 60x120, palubka modřín, vruty…"
        className="min-w-[20rem] flex-1 rounded-lg border border-bark-300 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-bark-500 focus:outline-none"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="rounded-lg border border-bark-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-bark-500 focus:outline-none"
      >
        <option value="">Všechny kategorie</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}
