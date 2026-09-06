import Link from "next/link";
import { notFound } from "next/navigation";
import InvoiceReview from "@/components/InvoiceReview";
import { Badge, PageTitle } from "@/components/ui";
import { DOC_TYPE_LABELS, type DocType } from "@/lib/doctypes";
import { formatDate } from "@/lib/format";
import { CATEGORIES } from "@/lib/normalize";
import { getInvoice, getInvoiceItems, listMaterials } from "@/lib/repo";
import { CANONICAL_UNITS } from "@/lib/units";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoiceId = Number(id);
  const invoice = await getInvoice(invoiceId);
  if (!invoice) notFound();

  const [items, materials] = await Promise.all([getInvoiceItems(invoiceId), listMaterials()]);
  const catalog = materials.map((m) => ({
    id: m.id,
    name: m.name,
    category: m.category,
    unit: m.unit,
  }));

  return (
    <>
      <PageTitle
        title={invoice.supplier_name ?? "Neznámý dodavatel"}
        subtitle={[
          DOC_TYPE_LABELS[invoice.doc_type as DocType] ?? "Doklad",
          invoice.invoice_number ?? "bez čísla",
          `vystaveno ${formatDate(invoice.issue_date)}`,
          invoice.extraction_model ? `přečteno modelem ${invoice.extraction_model}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        action={
          <div className="flex items-center gap-3">
            {invoice.status === "confirmed" ? (
              <Badge tone="good">Potvrzeno</Badge>
            ) : (
              <Badge tone="warn">Ke kontrole</Badge>
            )}
            <Link
              href={`/api/faktury/${invoice.id}/pdf`}
              target="_blank"
              className="rounded-lg border border-bark-300 bg-white px-4 py-2 text-sm font-medium text-bark-800 transition hover:bg-bark-100"
            >
              Otevřít PDF
            </Link>
          </div>
        }
      />
      <InvoiceReview
        invoice={invoice}
        items={items}
        catalog={catalog}
        categories={CATEGORIES}
        units={CANONICAL_UNITS}
      />
    </>
  );
}
