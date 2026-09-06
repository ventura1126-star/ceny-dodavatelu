import Link from "next/link";
import { Badge, Card, Empty, PageTitle, Stat } from "@/components/ui";
import { formatCzk, formatDate, formatPct } from "@/lib/format";
import { getDashboardStats, getPriceAlerts, getSupplierStats, listInvoices } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, alerts, suppliers, drafts] = await Promise.all([
    getDashboardStats(),
    getPriceAlerts(8),
    getSupplierStats(),
    listInvoices("draft"),
  ]);

  const topSuppliers = suppliers.filter((s) => s.invoices > 0).slice(0, 6);

  return (
    <>
      <PageTitle
        title="Přehled"
        subtitle="Nákupní ceny materiálu vytěžené z faktur od dodavatelů."
        action={
          <Link
            href="/nahrat"
            className="rounded-lg bg-bark-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-bark-800"
          >
            Nahrát doklady
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Zpracované doklady" value={String(stats.invoices)} />
        <Stat label="Materiály v katalogu" value={String(stats.materials)} />
        <Stat label="Dodavatelé" value={String(stats.suppliers)} />
        <Stat label="Nakoupeno za 12 měsíců" value={formatCzk(stats.spent_12m, true)} hint="bez DPH" />
      </div>

      {drafts.length > 0 ? (
        <Card className="mt-6 border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            {drafts.length === 1
              ? "1 doklad čeká na kontrolu"
              : `${drafts.length} dokladů čeká na kontrolu`}
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Dokud doklad nepotvrdíte, jeho ceny se do databáze nezapočítají.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {drafts.slice(0, 6).map((d) => (
              <Link
                key={d.id}
                href={`/faktury/${d.id}`}
                className="rounded-md bg-white px-3 py-1.5 text-sm text-amber-900 ring-1 ring-amber-300 transition hover:bg-amber-100"
              >
                {d.supplier_name ?? "Neznámý dodavatel"} · {d.invoice_number ?? d.file_name}
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-bark-600">
            Změny fakturovaných cen oproti minulému nákupu
          </h2>
          {alerts.length === 0 ? (
            <Empty
              title="Zatím není co porovnávat"
              hint="Jakmile stejný materiál nakoupíte u stejného dodavatele podruhé, uvidíte tu rozdíl v ceně."
            />
          ) : (
            <Card className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Materiál</th>
                    <th>Dodavatel</th>
                    <th className="num">Dřív</th>
                    <th className="num">Teď</th>
                    <th className="num">Změna</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => (
                    <tr key={`${a.material_id}-${a.supplier_name}`}>
                      <td>
                        <Link href={`/materialy/${a.material_id}`} className="hover:underline">
                          {a.material_name}
                        </Link>
                        <div className="text-xs text-bark-500">{formatDate(a.price_date)}</div>
                      </td>
                      <td className="text-bark-600">{a.supplier_name}</td>
                      <td className="num text-bark-500">{formatCzk(a.old_price)}</td>
                      <td className="num font-medium">{formatCzk(a.new_price)}</td>
                      <td className="num">
                        <Badge tone={a.change_pct > 0 ? "bad" : "good"}>{formatPct(a.change_pct)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-bark-600">
            Odběry u dodavatelů
          </h2>
          {topSuppliers.length === 0 ? (
            <Empty title="Zatím žádní dodavatelé" cta={{ href: "/nahrat", label: "Nahrát první doklad" }} />
          ) : (
            <Card className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Dodavatel</th>
                    <th className="num">Faktur</th>
                    <th className="num">Za 12 měsíců</th>
                    <th className="num">Poslední</th>
                  </tr>
                </thead>
                <tbody>
                  {topSuppliers.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/dodavatele/${s.id}`} className="hover:underline">
                          {s.name}
                        </Link>
                      </td>
                      <td className="num">{s.invoices}</td>
                      <td className="num font-medium">{formatCzk(s.spent_12m, true)}</td>
                      <td className="num text-bark-500">{formatDate(s.last_invoice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>
      </div>
    </>
  );
}
