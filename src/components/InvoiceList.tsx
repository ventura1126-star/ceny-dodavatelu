"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, Card } from "@/components/ui";
import { deleteInvoicesAction } from "@/lib/actions";
import { DOC_TYPE_LABELS, type DocType } from "@/lib/doctypes";
import { formatCzk, formatDate } from "@/lib/format";
import type { Invoice } from "@/lib/types";

type Filter = "all" | "draft" | "confirmed";

const FILTER_LABELS: Record<Filter, string> = {
  all: "Vše",
  draft: "Ke kontrole",
  confirmed: "Potvrzené",
};

export default function InvoiceList({ invoices }: { invoices: Invoice[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const counts: Record<Filter, number> = {
    all: invoices.length,
    draft: invoices.filter((i) => i.status !== "confirmed").length,
    confirmed: invoices.filter((i) => i.status === "confirmed").length,
  };

  const visible =
    filter === "all"
      ? invoices
      : invoices.filter((i) =>
          filter === "draft" ? i.status !== "confirmed" : i.status === "confirmed",
        );

  // Výběr se při přepnutí filtru ruší — mazat se nesmí nic, co uživatel nevidí.
  function changeFilter(next: Filter) {
    setFilter(next);
    setSelected(new Set());
    setConfirming(false);
  }

  const allSelected = visible.length > 0 && selected.size === visible.length;

  function toggle(id: number) {
    setConfirming(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setConfirming(false);
    setSelected(allSelected ? new Set() : new Set(visible.map((i) => i.id)));
  }

  // Kolik z vybraných je potvrzených — u těch smazání zasáhne i ceny v databázi.
  const confirmedCount = visible.filter(
    (i) => selected.has(i.id) && i.status === "confirmed",
  ).length;

  function remove() {
    startTransition(async () => {
      await deleteInvoicesAction([...selected]);
      setSelected(new Set());
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        {(Object.keys(FILTER_LABELS) as Filter[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => changeFilter(key)}
            aria-pressed={filter === key}
            className={
              filter === key
                ? "rounded-lg bg-bark-700 px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-lg border border-bark-300 bg-white px-3 py-1.5 text-sm font-medium text-bark-700 transition hover:bg-bark-100"
            }
          >
            {FILTER_LABELS[key]}
            <span className={filter === key ? "ml-1.5 text-bark-200" : "ml-1.5 text-bark-500"}>
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {selected.size > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-bark-300 bg-bark-100 px-4 py-3">
          <span className="text-sm font-medium text-bark-800">
            Vybráno {selected.size}{" "}
            {selected.size === 1 ? "doklad" : selected.size < 5 ? "doklady" : "dokladů"}
          </span>

          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-sm text-bark-600 underline hover:text-bark-900"
          >
            zrušit výběr
          </button>

          {confirming ? (
            <div className="ml-auto flex flex-wrap items-center gap-3">
              <span className="text-sm text-rose-800">
                Smazat i s položkami
                {confirmedCount > 0
                  ? ` a cenami z ${confirmedCount} potvrzených dokladů?`
                  : "? Nejde to vrátit."}
              </span>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-sm text-bark-600 underline hover:text-bark-900"
              >
                Zpět
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={remove}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-50"
              >
                {pending ? "Mažu…" : "Ano, smazat"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="ml-auto rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
            >
              Smazat vybrané
            </button>
          )}
        </div>
      ) : null}

      <Card className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Vybrat všechny doklady"
                  className="size-4 accent-bark-700"
                />
              </th>
              <th>Dodavatel</th>
              <th>Druh</th>
              <th>Číslo</th>
              <th>Vystaveno</th>
              <th>Zakázka</th>
              <th className="num">Bez DPH</th>
              <th>Stav</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((inv) => (
              <tr key={inv.id} className={selected.has(inv.id) ? "bg-bark-100" : undefined}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(inv.id)}
                    onChange={() => toggle(inv.id)}
                    aria-label={`Vybrat doklad ${inv.invoice_number ?? inv.file_name ?? inv.id}`}
                    className="size-4 accent-bark-700"
                  />
                </td>
                <td>
                  <Link href={`/faktury/${inv.id}`} className="font-medium hover:underline">
                    {inv.supplier_name ?? "Neznámý dodavatel"}
                  </Link>
                  <div className="text-xs text-bark-500">{inv.file_name}</div>
                </td>
                <td>
                  {inv.doc_type === "faktura" ? (
                    <span className="text-bark-700">Faktura</span>
                  ) : (
                    <Badge tone="neutral">
                      {DOC_TYPE_LABELS[inv.doc_type as DocType] ?? inv.doc_type}
                    </Badge>
                  )}
                </td>
                <td className="text-bark-700">{inv.invoice_number ?? "—"}</td>
                <td className="text-bark-700">{formatDate(inv.issue_date)}</td>
                <td className="text-bark-700">{inv.project ?? "—"}</td>
                <td className="num font-medium">{formatCzk(inv.total_net)}</td>
                <td>
                  {inv.status === "confirmed" ? (
                    <Badge tone="good">Potvrzeno</Badge>
                  ) : (
                    <Badge tone="warn">Ke kontrole</Badge>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-sm text-bark-600">
                  {filter === "draft"
                    ? "Všechny doklady máte zkontrolované."
                    : "Žádný doklad v tomhle stavu."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </>
  );
}
