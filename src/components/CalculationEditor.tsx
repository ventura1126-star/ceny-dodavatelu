"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import MaterialPicker, { type CatalogEntry } from "@/components/MaterialPicker";
import {
  addCalculationItem,
  removeCalculationItem,
  updateCalculationItem,
} from "@/lib/actions";
import { formatCzk, formatNumber } from "@/lib/format";
import { displayUnit } from "@/lib/units";

export interface CalcRow {
  id: number;
  material_id: number | null;
  label: string;
  quantity: number;
  unit: string | null;
  best_invoiced: number | null;
  best_invoiced_supplier: string | null;
  last_invoiced_date: string | null;
  best_offered: number | null;
  best_offered_supplier: string | null;
  last_offered_date: string | null;
}

type PriceMode = "auto" | "invoiced" | "offered";

const MODE_LABELS: Record<PriceMode, string> = {
  auto: "automaticky (platná nabídka, jinak faktura)",
  invoiced: "jen fakturované ceny",
  offered: "jen nabídkové ceny",
};

/**
 * Která cena se použije pro položku.
 *
 * Ve výchozím režimu vyhrává platná nabídka, pokud je novější než poslední
 * faktura — za tu materiál skutečně koupíte. Když nabídka není nebo je starší,
 * počítá se fakturovanou cenou.
 */
function pickPrice(row: CalcRow, mode: PriceMode) {
  const invoiced = { price: row.best_invoiced, supplier: row.best_invoiced_supplier, source: "faktura" as const };
  const offered = { price: row.best_offered, supplier: row.best_offered_supplier, source: "nabídka" as const };

  if (mode === "invoiced") return invoiced;
  if (mode === "offered") return offered;

  if (offered.price === null) return invoiced;
  if (invoiced.price === null) return offered;
  const offerNewer =
    (row.last_offered_date ?? "") >= (row.last_invoiced_date ?? "");
  return offerNewer ? offered : invoiced;
}

export default function CalculationEditor({
  calculationId,
  rows,
  catalog,
}: {
  calculationId: number;
  rows: CalcRow[];
  catalog: CatalogEntry[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pickId, setPickId] = useState<number | null>(null);
  const [pickName, setPickName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [mode, setMode] = useState<PriceMode>("auto");

  const priceOf = (row: CalcRow) => pickPrice(row, mode).price;
  const total = rows.reduce((acc, r) => acc + (priceOf(r) ?? 0) * r.quantity, 0);
  const missing = rows.filter((r) => priceOf(r) === null).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-bark-200 bg-white p-4">
        <div className="min-w-[18rem] flex-1">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-bark-500">
            Materiál z katalogu
          </span>
          <MaterialPicker
            catalog={catalog}
            materialId={pickId}
            draftName={pickName}
            confidence={null}
            source={null}
            onPick={(id, name) => {
              setPickId(id);
              setPickName(name);
            }}
            onDraftName={setPickName}
          />
        </div>
        <div className="w-32">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-bark-500">
            Množství
          </span>
          <input
            value={quantity}
            inputMode="decimal"
            onChange={(e) => setQuantity(e.target.value)}
            className="input text-right"
          />
        </div>
        <button
          type="button"
          disabled={pending || !pickId}
          onClick={() =>
            startTransition(async () => {
              if (!pickId) return;
              await addCalculationItem(
                calculationId,
                pickId,
                Number(quantity.replace(",", ".")) || 0,
              );
              setPickId(null);
              setPickName("");
              setQuantity("1");
              router.refresh();
            })
          }
          className="rounded-lg bg-bark-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-bark-800 disabled:opacity-60"
        >
          Přidat
        </button>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-bark-600">Počítat cenou:</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as PriceMode)}
            className="rounded-lg border border-bark-300 bg-white px-2 py-1.5 text-sm"
          >
            {(Object.keys(MODE_LABELS) as PriceMode[]).map((m) => (
              <option key={m} value={m}>
                {MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-bark-200 bg-white">
        <table className="table-base">
          <thead>
            <tr>
              <th>Materiál</th>
              <th className="num w-32">Množství</th>
              <th className="w-16">MJ</th>
              <th className="num w-32">Cena/MJ</th>
              <th className="w-56">Zdroj ceny</th>
              <th className="num w-32">Celkem</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.material_id ? (
                    <Link href={`/materialy/${row.material_id}`} className="hover:underline">
                      {row.label}
                    </Link>
                  ) : (
                    row.label
                  )}
                </td>
                <td>
                  <QuantityInput
                    initial={row.quantity}
                    onCommit={(value) =>
                      startTransition(async () => {
                        await updateCalculationItem(row.id, value);
                        router.refresh();
                      })
                    }
                  />
                </td>
                <td className="text-bark-600">{displayUnit(row.unit)}</td>
                <td className="num">
                  {priceOf(row) === null ? (
                    <span className="text-xs text-amber-700">bez ceny</span>
                  ) : (
                    formatCzk(priceOf(row))
                  )}
                </td>
                <td className="text-bark-600">
                  {priceOf(row) === null ? (
                    "—"
                  ) : (
                    <>
                      {pickPrice(row, mode).supplier ?? "—"}
                      <span className="ml-1 text-xs text-bark-500">
                        ({pickPrice(row, mode).source})
                      </span>
                    </>
                  )}
                </td>
                <td className="num font-medium">
                  {priceOf(row) === null ? "—" : formatCzk((priceOf(row) ?? 0) * row.quantity)}
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(async () => {
                        await removeCalculationItem(row.id, calculationId);
                        router.refresh();
                      })
                    }
                    className="text-xs text-bark-500 hover:text-rose-600"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-sm text-bark-600">
                  Zatím prázdné — přidejte první materiál.
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="bg-bark-100 text-base font-semibold">
              <td colSpan={5} className="text-right">
                Nákladová cena materiálu bez DPH
              </td>
              <td className="num">{formatCzk(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {missing > 0 ? (
        <p className="text-sm text-amber-800">
          {missing} položek nemá cenu — buď je ještě nemáme na žádném potvrzeném dokladu, nebo
          v nich zvolený režim ceny nic nenajde (třeba jen nabídky, které už neplatí). Do součtu
          se nezapočítaly.
        </p>
      ) : null}
      <p className="text-xs text-bark-500">
        Celkem {formatNumber(rows.length)} položek. Ceny vycházejí z posledních potvrzených dokladů.
      </p>
    </div>
  );
}

function QuantityInput({
  initial,
  onCommit,
}: {
  initial: number;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(String(initial));
  return (
    <input
      value={text}
      inputMode="decimal"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const parsed = Number(text.replace(",", "."));
        if (!Number.isNaN(parsed) && parsed !== initial) onCommit(parsed);
      }}
      className="input text-right"
    />
  );
}
