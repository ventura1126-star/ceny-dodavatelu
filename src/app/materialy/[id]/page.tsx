import Link from "next/link";
import { notFound } from "next/navigation";
import PriceChart from "@/components/PriceChart";
import { Badge, Card, PageTitle, Stat } from "@/components/ui";
import { formatCzk, formatDate, formatNumber } from "@/lib/format";
import { getMaterial, getPriceHistory, getSupplierPrices } from "@/lib/repo";
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

  const [prices, history] = await Promise.all([
    getSupplierPrices(materialId),
    getPriceHistory(materialId),
  ]);

  const best = prices[0] ?? null;
  const worst = prices.length > 1 ? prices[prices.length - 1] : null;
  const spread =
    best && worst && best.last_price && worst.last_price && best.last_price > 0
      ? ((worst.last_price - best.last_price) / best.last_price) * 100
      : null;

  // Různé jednotky u jednoho materiálu znamenají, že ceny nejsou přímo srovnatelné.
  const unitsUsed = Array.from(new Set(prices.map((p) => p.unit).filter(Boolean)));

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
          label="Nejlepší aktuální cena"
          value={best?.last_price ? formatCzk(best.last_price) : "—"}
          hint={best ? `${best.supplier_name} · ${formatDate(best.last_date)}` : undefined}
        />
        <Stat label="Dodavatelů" value={String(prices.length)} />
        <Stat
          label="Rozpětí mezi dodavateli"
          value={spread !== null ? `${spread.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %` : "—"}
          hint={spread !== null ? "o kolik je nejdražší dražší než nejlevnější" : undefined}
        />
        <Stat
          label="Celkem odebráno"
          value={formatCzk(prices.reduce((a, p) => a + (p.total_spent ?? 0), 0), true)}
          hint="bez DPH"
        />
      </div>

      {unitsUsed.length > 1 ? (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Pozor: dodavatelé účtují tenhle materiál v různých jednotkách ({unitsUsed.join(", ")}).
          Ceny níž proto nejsou přímo srovnatelné.
        </div>
      ) : null}

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-bark-600">
        Ceny podle dodavatele
      </h2>
      <Card className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Dodavatel</th>
              <th className="num">Poslední cena</th>
              <th>MJ</th>
              <th className="num">Naposledy</th>
              <th className="num">Nejnižší</th>
              <th className="num">Nejvyšší</th>
              <th className="num">Nákupů</th>
              <th className="num">Odebráno celkem</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {prices.map((p, i) => (
              <tr key={p.supplier_id}>
                <td className="font-medium">
                  <Link href={`/dodavatele/${p.supplier_id}`} className="hover:underline">
                    {p.supplier_name}
                  </Link>
                  {i === 0 && prices.length > 1 ? (
                    <span className="ml-2">
                      <Badge tone="good">nejlevnější</Badge>
                    </span>
                  ) : null}
                </td>
                <td className="num font-semibold">{formatCzk(p.last_price)}</td>
                <td className="text-bark-600">{displayUnit(p.unit)}</td>
                <td className="num text-bark-500">{formatDate(p.last_date)}</td>
                <td className="num text-bark-600">{formatCzk(p.min_price)}</td>
                <td className="num text-bark-600">{formatCzk(p.max_price)}</td>
                <td className="num">{p.purchases}</td>
                <td className="num">
                  {formatCzk(p.total_spent, true)}
                  <div className="text-xs text-bark-500">
                    {formatNumber(p.total_quantity)} {displayUnit(p.unit)}
                  </div>
                </td>
                <td>
                  <Link
                    href={`/faktury/${p.last_invoice_id}`}
                    className="text-xs text-bark-600 underline hover:text-bark-900"
                  >
                    faktura
                  </Link>
                </td>
              </tr>
            ))}
            {prices.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-6 text-center text-sm text-bark-600">
                  Tenhle materiál zatím není na žádné potvrzené faktuře.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-bark-600">
        Vývoj ceny v čase
      </h2>
      <Card>
        <PriceChart points={history} />
      </Card>
    </>
  );
}
