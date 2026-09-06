import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageTitle, Stat } from "@/components/ui";
import { one } from "@/db";
import { formatCzk, formatDate } from "@/lib/format";
import { getSupplierStats, getSupplierTopMaterials, listInvoices } from "@/lib/repo";
import { displayUnit } from "@/lib/units";
import type { Supplier } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supplierId = Number(id);
  const supplier = await one<Supplier>(`SELECT * FROM suppliers WHERE id = ?`, [supplierId]);
  if (!supplier) notFound();

  const [stats, materials, invoices] = await Promise.all([
    getSupplierStats(),
    getSupplierTopMaterials(supplierId),
    listInvoices(),
  ]);
  const mine = stats.find((s) => s.id === supplierId);
  const supplierInvoices = invoices.filter((i) => i.supplier_id === supplierId).slice(0, 20);

  return (
    <>
      <PageTitle
        title={supplier.name}
        subtitle={[supplier.ico ? `IČO ${supplier.ico}` : null, supplier.address]
          .filter(Boolean)
          .join(" · ")}
        action={
          <Link
            href="/dodavatele"
            className="rounded-lg border border-bark-300 bg-white px-4 py-2 text-sm font-medium text-bark-800 transition hover:bg-bark-100"
          >
            Zpět
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Faktur" value={String(mine?.invoices ?? 0)} />
        <Stat label="Za 12 měsíců" value={formatCzk(mine?.spent_12m ?? 0, true)} hint="bez DPH" />
        <Stat label="Celkem odebráno" value={formatCzk(mine?.total_net ?? 0, true)} hint="bez DPH" />
        <Stat label="Různých materiálů" value={String(mine?.materials ?? 0)} />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-bark-600">
        Nejvíc odebírané materiály
      </h2>
      <Card className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Materiál</th>
              <th>Kategorie</th>
              <th className="num">Nákupů</th>
              <th className="num">Poslední cena</th>
              <th className="num">Odebráno celkem</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => (
              <tr key={m.material_id}>
                <td>
                  <Link href={`/materialy/${m.material_id}`} className="font-medium hover:underline">
                    {m.material_name}
                  </Link>
                </td>
                <td className="text-bark-600">{m.category}</td>
                <td className="num">{m.purchases}</td>
                <td className="num">
                  {formatCzk(m.last_price)}
                  <span className="text-xs text-bark-500"> / {displayUnit(m.unit)}</span>
                </td>
                <td className="num font-medium">{formatCzk(m.total_spent, true)}</td>
              </tr>
            ))}
            {materials.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-bark-600">
                  Zatím žádné potvrzené položky.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-bark-600">
        Faktury
      </h2>
      <Card className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Číslo</th>
              <th>Vystaveno</th>
              <th>Zakázka</th>
              <th className="num">Bez DPH</th>
            </tr>
          </thead>
          <tbody>
            {supplierInvoices.map((inv) => (
              <tr key={inv.id}>
                <td>
                  <Link href={`/faktury/${inv.id}`} className="hover:underline">
                    {inv.invoice_number ?? inv.file_name ?? `#${inv.id}`}
                  </Link>
                </td>
                <td>{formatDate(inv.issue_date)}</td>
                <td className="text-bark-600">{inv.project ?? "—"}</td>
                <td className="num">{formatCzk(inv.total_net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
