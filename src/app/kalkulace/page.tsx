import Link from "next/link";
import { Card, Empty, PageTitle } from "@/components/ui";
import NewCalculationForm from "@/components/NewCalculationForm";
import { formatDate } from "@/lib/format";
import { listCalculations } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function CalculationsPage() {
  const calculations = await listCalculations();

  return (
    <>
      <PageTitle
        title="Kalkulace"
        subtitle="Poskládejte materiál na zakázku a spočítejte nákladovou cenu podle nejlepších cen, které máte."
        action={<NewCalculationForm />}
      />
      {calculations.length === 0 ? (
        <Empty
          title="Zatím žádná kalkulace"
          hint="Založte první a přidejte do ní materiál z katalogu."
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Název</th>
                <th className="num">Položek</th>
                <th className="num">Založeno</th>
              </tr>
            </thead>
            <tbody>
              {calculations.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/kalkulace/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="num">{c.items}</td>
                  <td className="num text-bark-500">{formatDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
