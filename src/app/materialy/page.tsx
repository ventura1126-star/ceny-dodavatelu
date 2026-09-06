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
                <th>Materiál</th>
                <th>Kategorie</th>
                <th className="num">Dodavatelů</th>
                <th className="num">Nejlepší cena</th>
                <th>u koho</th>
                <th className="num">Poslední cena</th>
                <th className="num">Naposledy</th>
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
                  <td className="num font-medium text-emerald-800">
                    {m.best_price !== null ? `${formatCzk(m.best_price)} / ${m.unit}` : "—"}
                  </td>
                  <td className="text-bark-700">{m.best_supplier ?? "—"}</td>
                  <td className="num">{formatCzk(m.last_price)}</td>
                  <td className="num text-bark-500">{formatDate(m.last_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
