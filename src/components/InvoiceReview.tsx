"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import MaterialPicker, { type CatalogEntry } from "@/components/MaterialPicker";
import { deleteInvoiceAction, reopenInvoice, saveInvoice, type ItemDecision } from "@/lib/actions";
import { DOC_TYPES, DOC_TYPE_LABELS, type DocType } from "@/lib/doctypes";
import { formatCzk } from "@/lib/format";
import type { Invoice, InvoiceItem } from "@/lib/types";

interface Row extends ItemDecision {
  description: string;
  catalogCode: string | null;
  confidence: number | null;
  source: string | null;
}

export default function InvoiceReview({
  invoice,
  items,
  catalog,
  categories,
  units,
}: {
  invoice: Invoice;
  items: InvoiceItem[];
  catalog: CatalogEntry[];
  categories: readonly string[];
  units: readonly string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);

  const [supplierName, setSupplierName] = useState(invoice.supplier_name ?? "");
  const [docType, setDocType] = useState<DocType>((invoice.doc_type as DocType) ?? "faktura");
  const [validUntil, setValidUntil] = useState(invoice.valid_until ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(invoice.invoice_number ?? "");
  const [issueDate, setIssueDate] = useState(invoice.issue_date ?? "");
  const [project, setProject] = useState(invoice.project ?? "");
  const [totalNet, setTotalNet] = useState(invoice.total_net?.toString() ?? "");

  const [rows, setRows] = useState<Row[]>(() =>
    items.map((item) => ({
      id: item.id,
      description: item.raw_description,
      catalogCode: item.catalog_code,
      isMaterial: item.is_material === 1,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unit_price_net,
      lineTotal: item.line_total_net,
      materialId: item.material_id ?? item.suggested_material_id,
      newName: item.suggested_name ?? item.raw_description,
      newCategory: item.suggested_category ?? "Ostatní",
      newUnit: item.suggested_unit ?? item.unit ?? "ks",
      confidence: item.match_confidence,
      source: item.match_source,
    })),
  );

  function patch(id: number, changes: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)));
  }

  const sum = useMemo(
    () => rows.reduce((acc, r) => acc + (r.lineTotal ?? 0), 0),
    [rows],
  );
  const declaredTotal = Number(totalNet.replace(",", ".")) || 0;
  const mismatch = declaredTotal > 0 && Math.abs(sum - declaredTotal) > 1;
  const unresolved = rows.filter((r) => r.isMaterial && !r.materialId && !r.newName?.trim()).length;

  function submit(confirm: boolean) {
    startTransition(async () => {
      await saveInvoice(
        invoice.id,
        {
          supplierName,
          docType,
          validUntil: validUntil || null,
          invoiceNumber: invoiceNumber || null,
          issueDate: issueDate || null,
          project: project || null,
          totalNet: totalNet ? Number(totalNet.replace(",", ".")) : null,
        },
        rows.map(({ description: _d, catalogCode: _c, confidence: _f, source: _s, ...rest }) => rest),
        confirm,
      );
      setSaved(confirm ? "Faktura potvrzena a zapsána do cenové databáze." : "Uloženo.");
      router.refresh();
    });
  }

  const warnings: string[] = invoice.extraction_warnings
    ? (JSON.parse(invoice.extraction_warnings) as string[])
    : [];

  return (
    <div className="space-y-6">
      {warnings.length > 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Na co si dát u téhle faktury pozor</p>
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 rounded-xl border border-bark-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6">
        <Field label="Druh dokladu">
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocType)}
            className="input"
          >
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {DOC_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dodavatel">
          <input
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Číslo faktury">
          <input
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Datum vystavení">
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className="input"
          />
        </Field>
        <Field label={docType === "faktura" || docType === "dodaci_list" ? "Zakázka (nepovinné)" : "Nabídka platí do"}>
          {docType === "faktura" || docType === "dodaci_list" ? (
            <input value={project} onChange={(e) => setProject(e.target.value)} className="input" />
          ) : (
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="input"
            />
          )}
        </Field>
        <Field label="Celkem bez DPH">
          <input
            value={totalNet}
            onChange={(e) => setTotalNet(e.target.value)}
            className="input text-right"
          />
        </Field>
      </div>

      <div className="overflow-x-auto rounded-xl border border-bark-200 bg-white">
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-14">
                <span title="Zahrnout do cenové databáze">Do cen</span>
                <button
                  type="button"
                  onClick={() => {
                    const target = !rows.every((r) => r.isMaterial);
                    setRows((prev) => prev.map((r) => ({ ...r, isMaterial: target })));
                  }}
                  className="mt-0.5 block text-[10px] font-normal text-bark-500 underline hover:text-bark-800"
                >
                  vše
                </button>
              </th>
              <th className="min-w-[18rem]">Položka na faktuře</th>
              <th className="num w-24">Množství</th>
              <th className="w-20">MJ</th>
              <th className="num w-28">Cena/MJ</th>
              <th className="num w-28">Celkem</th>
              <th className="min-w-[20rem]">Materiál v katalogu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.isMaterial ? "" : "opacity-55"}>
                <td>
                  <input
                    type="checkbox"
                    checked={row.isMaterial}
                    onChange={(e) => patch(row.id, { isMaterial: e.target.checked })}
                    className="h-4 w-4 accent-bark-700"
                    title="Zahrnout do cenové databáze (materiál, nářadí i ochranné pomůcky)"
                  />
                </td>
                <td>
                  <div className="text-bark-900">{row.description}</div>
                  {row.catalogCode ? (
                    <div className="text-xs text-bark-500">kód {row.catalogCode}</div>
                  ) : null}
                </td>
                <td>
                  <NumberInput
                    value={row.quantity}
                    onChange={(v) => patch(row.id, { quantity: v })}
                  />
                </td>
                <td>
                  <select
                    value={row.unit ?? ""}
                    onChange={(e) => patch(row.id, { unit: e.target.value || null })}
                    className="input"
                  >
                    <option value="">—</option>
                    {units.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                    {row.unit && !units.includes(row.unit) ? (
                      <option value={row.unit}>{row.unit}</option>
                    ) : null}
                  </select>
                </td>
                <td>
                  <NumberInput
                    value={row.unitPrice}
                    onChange={(v) => patch(row.id, { unitPrice: v })}
                  />
                </td>
                <td>
                  <NumberInput
                    value={row.lineTotal}
                    onChange={(v) => patch(row.id, { lineTotal: v })}
                  />
                </td>
                <td>
                  {row.isMaterial ? (
                    <div className="space-y-1">
                      <MaterialPicker
                        catalog={catalog}
                        materialId={row.materialId}
                        draftName={row.newName ?? ""}
                        confidence={row.confidence}
                        source={row.source}
                        onPick={(id, name) =>
                          patch(row.id, { materialId: id, newName: id ? null : name })
                        }
                        onDraftName={(name) => patch(row.id, { newName: name })}
                      />
                      {!row.materialId ? (
                        <select
                          value={row.newCategory ?? "Ostatní"}
                          onChange={(e) => patch(row.id, { newCategory: e.target.value })}
                          className="input"
                        >
                          {categories.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-xs text-bark-500">
                      nezapočítává se do cen — doprava, obaly, poplatky
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-bark-100 font-medium">
              <td colSpan={5} className="text-right">
                Součet řádků
              </td>
              <td className="num">{formatCzk(sum)}</td>
              <td>
                {mismatch ? (
                  <span className="text-xs text-rose-700">
                    Nesedí s hlavičkou ({formatCzk(declaredTotal)}) — zkontrolujte řádky.
                  </span>
                ) : null}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => submit(true)}
          className="rounded-lg bg-bark-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-bark-800 disabled:opacity-60"
        >
          {invoice.status === "confirmed" ? "Uložit změny" : "Potvrdit a zapsat ceny"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => submit(false)}
          className="rounded-lg border border-bark-300 bg-white px-4 py-2 text-sm font-medium text-bark-800 transition hover:bg-bark-100 disabled:opacity-60"
        >
          Uložit rozpracované
        </button>
        {invoice.status === "confirmed" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => {
              await reopenInvoice(invoice.id);
              router.refresh();
            })}
            className="text-sm text-bark-600 underline hover:text-bark-900"
          >
            Vrátit ke kontrole
          </button>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("Opravdu smazat tuhle fakturu i s položkami?")) return;
            startTransition(async () => {
              await deleteInvoiceAction(invoice.id);
              router.push("/faktury");
            });
          }}
          className="ml-auto text-sm text-rose-600 underline hover:text-rose-800"
        >
          Smazat fakturu
        </button>
      </div>

      {docType === "nabidka" || docType === "potvrzeni" ? (
        <p className="rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900">
          Tenhle doklad se uloží jako <strong>nezávazná cena</strong>. V přehledech se zobrazí
          odděleně od fakturovaných cen a do „co jsme skutečně zaplatili" se nezapočítá.
        </p>
      ) : null}

      {unresolved > 0 ? (
        <p className="text-sm text-amber-800">
          {unresolved} položek nemá přiřazený materiál — doplňte název, jinak se do cen nedostanou.
        </p>
      ) : null}
      {saved ? <p className="text-sm font-medium text-emerald-700">{saved}</p> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-bark-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  return (
    <input
      value={text}
      inputMode="decimal"
      onChange={(e) => {
        setText(e.target.value);
        const parsed = Number(e.target.value.replace(",", "."));
        onChange(e.target.value.trim() === "" || Number.isNaN(parsed) ? null : parsed);
      }}
      className="input text-right"
    />
  );
}
