import Link from "next/link";
import { Suspense } from "react";
import SearchForm from "@/components/SearchForm";
import { Card, Empty, PageTitle } from "@/components/ui";
import { formatCzk, formatDate } from "@/lib/format";
import { CATEGORIES } from "@/lib/normalize";
import { searchMaterials } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kategorie?: string }>;
}) {
  const { q = "", kategorie } = await searchParams;
  const results = await searchMaterials(q, kategorie);

  return (
    <>
      <PageTitle
        title="Materiály a ceny"
        subtitle="Zadejte materiál a uvidíte, za kolik ho máte u jednotlivých dodavatelů."
      />
      <Suspense fallback={null}>
        <SearchForm categories={CATEGORIES} />
      </Suspense>

      {results.length === 0 ? (
        <Empty
          title={q ? `Pro „${q}“ nic nemáme` : "Katalog je zatím prázdný"}
          hint={
            q
              ? "Zkuste kratší dotaz — třeba jen rozměr nebo druh materiálu."
              : "Nahrajte faktury a katalog se naplní sám."
          }
          cta={q ? undefined : { href: "/nahrat", label: "Nahrát faktury" }}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th rowSpan={2}>Materiál</th>
                <th rowSpan={2}>Kategorie</th>
                <th className="num" rowSpan={2}>Dodavatelů</th>
                <th className="num" colSpan={2}>Fakturováno — nejlepší</th>
                <th className="num" colSpan={2}>Nabídnuto — nejlepší</th>
              </tr>
              <tr>
                <th className="num">cena</th>
                <th>u koho / kdy</th>
                <th className="num">cena</th>
                <th>u koho / kdy</th>
              </tr>
            </thead>
            <tbody>
              {results.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link href={`/materialy/${m.id}`} className="font-medium hover:underline">
                      {m.name}
                    </Link>
                  </td>
                  <td className="text-bark-600">{m.category}</td>
                  <td className="num">{m.suppliers || "—"}</td>
                  <td className="num font-medium">
                    {m.best_invoiced !== null ? `${formatCzk(m.best_invoiced)} / ${m.unit}` : "—"}
                  </td>
                  <td className="text-bark-700">
                    {m.best_invoiced_supplier ?? "—"}
                    <div className="text-xs text-bark-500">{formatDate(m.last_invoiced_date)}</div>
                  </td>
                  <td className="num font-medium text-sky-800">
                    {m.best_offered !== null ? `${formatCzk(m.best_offered)} / ${m.unit}` : "—"}
                  </td>
                  <td className="text-bark-700">
                    {m.best_offered_supplier ?? "—"}
                    <div className="text-xs text-bark-500">{formatDate(m.last_offered_date)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
