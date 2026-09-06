import Link from "next/link";
import { Card, Empty, PageTitle } from "@/components/ui";
import { formatCzk, formatDate } from "@/lib/format";
import { getSupplierStats } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const suppliers = await getSupplierStats();

  return (
    <>
      <PageTitle
        title="Dodavatelé"
        subtitle="Kolik u koho odebíráme — podklad pro vyjednávání slev a bonusů."
      />
      {suppliers.length === 0 ? (
        <Empty title="Zatím žádní dodavatelé" cta={{ href: "/nahrat", label: "Nahrát faktury" }} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Dodavatel</th>
                <th>IČO</th>
                <th className="num">Faktur</th>
                <th className="num">Položek v katalogu</th>
                <th className="num">Za 12 měsíců</th>
                <th className="num">Celkem</th>
                <th className="num">Poslední faktura</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/dodavatele/${s.id}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="text-bark-600">{s.ico ?? "—"}</td>
                  <td className="num">{s.invoices}</td>
                  <td className="num">{s.materials}</td>
                  <td className="num font-medium">{formatCzk(s.spent_12m, true)}</td>
                  <td className="num text-bark-600">{formatCzk(s.total_net, true)}</td>
                  <td className="num text-bark-500">{formatDate(s.last_invoice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
