import Link from "next/link";
import { notFound } from "next/navigation";
import PriceChart from "@/components/PriceChart";
import { Badge, Card, PageTitle, Stat } from "@/components/ui";
import { DOC_TYPE_LABELS, type DocType, type PriceTrack } from "@/lib/doctypes";
import { formatCzk, formatDate, formatNumber } from "@/lib/format";
import { getMaterial, getPriceHistory, getSupplierPrices } from "@/lib/repo";
import type { SupplierPrice } from "@/lib/types";
import { displayUnit } from "@/lib/units";

export const dynamic = "force-dynamic";

export default async function MaterialDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const materialId = Number(id);
  const material = await getMaterial(materialId);
  if (!material) notFound();

  const [invoiced, offered, history] = await Promise.all([
    getSupplierPrices(materialId, "invoiced"),
    getSupplierPrices(materialId, "offered"),
    getPriceHistory(materialId),
  ]);

  // Ceny jdou porovnávat jen v rámci jedné jednotky. Souhrnné údaje nahoře proto
  // počítáme z té nejpoužívanější a na ostatní upozorníme zvlášť.
  const unitCounts = new Map<string, number>();
  for (const row of [...invoiced, ...offered]) {
    unitCounts.set(row.unit_key, (unitCounts.get(row.unit_key) ?? 0) + row.purchases);
  }
  const allUnits = [...unitCounts.keys()];
  const mainUnit = allUnits.sort((a, b) => (unitCounts.get(b) ?? 0) - (unitCounts.get(a) ?? 0))[0];

  const mainInvoiced = invoiced.filter((p) => p.unit_key === mainUnit);
  const mainOffered = offered.filter((p) => p.unit_key === mainUnit && !p.expired);
  const bestInvoiced = mainInvoiced[0] ?? null;
  const bestOffered = mainOffered[0] ?? null;

  const spread =
    mainInvoiced.length > 1 && bestInvoiced?.last_price
      ? ((mainInvoiced[mainInvoiced.length - 1].last_price! - bestInvoiced.last_price) /
          bestInvoiced.last_price) *
        100
      : null;

  return (
    <>
      <PageTitle
        title={material.name}
        subtitle={`${material.category} · účtováno za ${displayUnit(material.unit)}`}
        action={
          <Link
            href="/materialy"
            className="rounded-lg border border-bark-300 bg-white px-4 py-2 text-sm font-medium text-bark-800 transition hover:bg-bark-100"
          >
            Zpět na hledání
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Nejlépe fakturováno"
          value={bestInvoiced?.last_price ? formatCzk(bestInvoiced.last_price) : "—"}
          hint={
            bestInvoiced
              ? `${bestInvoiced.supplier_name} za ${displayUnit(bestInvoiced.unit)} · ${formatDate(bestInvoiced.last_date)}`
              : "zatím žádná faktura"
          }
        />
        <Stat
          label="Nejlepší platná nabídka"
          value={bestOffered?.last_price ? formatCzk(bestOffered.last_price) : "—"}
          hint={
            bestOffered
              ? `${bestOffered.supplier_name} za ${displayUnit(bestOffered.unit)} · ${formatDate(bestOffered.last_date)}`
              : "žádná platná nabídka"
          }
        />
        <Stat
          label="Rozpětí mezi dodavateli"
          value={
            spread !== null
              ? `${spread.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %`
              : "—"
          }
          hint={spread !== null ? `u fakturovaných cen za ${displayUnit(mainUnit)}` : undefined}
        />
        <Stat
          label="Celkem odebráno"
          value={formatCzk(invoiced.reduce((a, p) => a + (p.total_spent ?? 0), 0), true)}
          hint="bez DPH"
        />
      </div>

      {allUnits.length > 1 ? (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Tenhle materiál se nakupuje ve víc jednotkách</strong> (
          {allUnits.map((u) => displayUnit(u)).join(", ")}). Ceny v různých jednotkách spolu nejde
          porovnávat, takže jsou v tabulkách níž oddělené a souhrn nahoře počítá jen s jednotkou{" "}
          <strong>{displayUnit(mainUnit)}</strong>, ve které máte dokladů nejvíc.
        </div>
      ) : null}

      <PriceTable
        title="Fakturováno — co jste skutečně zaplatili"
        rows={invoiced}
        track="invoiced"
        empty="Tenhle materiál zatím není na žádné potvrzené faktuře."
      />

      <PriceTable
        title="Nabídnuto — nezávazné ceny z nabídek a potvrzení objednávek"
        rows={offered}
        track="offered"
        empty="Zatím tu není žádná cenová nabídka."
      />

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-bark-600">
        Vývoj ceny v čase
      </h2>
      <Card>
        <PriceChart points={history} />
      </Card>
    </>
  );
}

function PriceTable({
  title,
  rows,
  track,
  empty,
}: {
  title: string;
  rows: SupplierPrice[];
  track: PriceTrack;
  empty: string;
}) {
  // Každá jednotka dostane vlastní tabulku — porovnávat 145 Kč/m² s 1 100 Kč/bal
  // nedává smysl a společná tabulka by k tomu sváděla.
  const byUnit = new Map<string, SupplierPrice[]>();
  for (const row of rows) {
    if (!byUnit.has(row.unit_key)) byUnit.set(row.unit_key, []);
    byUnit.get(row.unit_key)!.push(row);
  }
  const groups = [...byUnit.entries()].sort((a, b) => b[1].length - a[1].length);

  if (groups.length === 0) {
    return (
      <>
        <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-bark-600">
          {title}
        </h2>
        <Card className="p-6 text-center text-sm text-bark-600">{empty}</Card>
      </>
    );
  }

  return (
    <>
      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-bark-600">
        {title}
      </h2>
      {groups.map(([unitKey, unitRows]) => (
        <UnitTable
          key={unitKey}
          unitKey={unitKey}
          rows={unitRows}
          track={track}
          showUnitHeading={groups.length > 1}
        />
      ))}
    </>
  );
}

function UnitTable({
  unitKey,
  rows,
  track,
  showUnitHeading,
}: {
  unitKey: string;
  rows: SupplierPrice[];
  track: PriceTrack;
  showUnitHeading: boolean;
}) {
  return (
    <>
      {showUnitHeading ? (
        <p className="mb-2 mt-4 text-sm font-medium text-bark-700">
          Účtováno za {displayUnit(unitKey)}
        </p>
      ) : null}
      <Card className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Dodavatel</th>
              <th className="num">Poslední cena</th>
              <th>MJ</th>
              <th className="num">Ze dne</th>
              {track === "offered" ? <th>Platí do</th> : null}
              <th className="num">Nejnižší</th>
              <th className="num">Nejvyšší</th>
              <th className="num">Dokladů</th>
              {track === "invoiced" ? <th className="num">Odebráno celkem</th> : null}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.supplier_id} className={p.expired ? "opacity-50" : ""}>
                <td className="font-medium">
                  <Link href={`/dodavatele/${p.supplier_id}`} className="hover:underline">
                    {p.supplier_name}
                  </Link>
                  {i === 0 && rows.length > 1 && !p.expired ? (
                    <span className="ml-2">
                      <Badge tone="good">nejlevnější</Badge>
                    </span>
                  ) : null}
                  {p.doc_type && p.doc_type !== "faktura" ? (
                    <div className="text-xs text-bark-500">
                      {DOC_TYPE_LABELS[p.doc_type as DocType] ?? p.doc_type}
                    </div>
                  ) : null}
                </td>
                <td className="num font-semibold">{formatCzk(p.last_price)}</td>
                <td className="text-bark-600">{displayUnit(p.unit)}</td>
                <td className="num text-bark-500">{formatDate(p.last_date)}</td>
                {track === "offered" ? (
                  <td className="text-bark-600">
                    {p.valid_until ? (
                      p.expired ? (
                        <Badge tone="bad">prošlo {formatDate(p.valid_until)}</Badge>
                      ) : (
                        formatDate(p.valid_until)
                      )
                    ) : (
                      <span className="text-xs text-bark-400">neuvedeno</span>
                    )}
                  </td>
                ) : null}
                <td className="num text-bark-600">{formatCzk(p.min_price)}</td>
                <td className="num text-bark-600">{formatCzk(p.max_price)}</td>
                <td className="num">{p.purchases}</td>
                {track === "invoiced" ? (
                  <td className="num">
                    {formatCzk(p.total_spent, true)}
                    <div className="text-xs text-bark-500">
                      {formatNumber(p.total_quantity)} {displayUnit(p.unit)}
                    </div>
                  </td>
                ) : null}
                <td>
                  <Link
                    href={`/faktury/${p.last_invoice_id}`}
                    className="text-xs text-bark-600 underline hover:text-bark-900"
                  >
                    doklad
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
