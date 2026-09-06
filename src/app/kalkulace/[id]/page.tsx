import Link from "next/link";
import { notFound } from "next/navigation";
import CalculationEditor from "@/components/CalculationEditor";
import { PageTitle } from "@/components/ui";
import { getCalculation, getCalculationItems, listMaterials } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function CalculationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const calculationId = Number(id);
  const calculation = await getCalculation(calculationId);
  if (!calculation) notFound();

  const [rows, materials] = await Promise.all([
    getCalculationItems(calculationId),
    listMaterials(),
  ]);

  return (
    <>
      <PageTitle
        title={calculation.name}
        subtitle="Nákladová cena materiálu podle vašich skutečných nákupních cen."
        action={
          <Link
            href="/kalkulace"
            className="rounded-lg border border-bark-300 bg-white px-4 py-2 text-sm font-medium text-bark-800 transition hover:bg-bark-100"
          >
            Zpět
          </Link>
        }
      />
      <CalculationEditor
        calculationId={calculationId}
        rows={rows}
        catalog={materials.map((m) => ({
          id: m.id,
          name: m.name,
          category: m.category,
          unit: m.unit,
        }))}
      />
    </>
  );
}
