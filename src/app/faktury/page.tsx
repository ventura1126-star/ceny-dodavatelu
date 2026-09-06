import Link from "next/link";
import { Badge, Card, Empty, PageTitle } from "@/components/ui";
import { DOC_TYPE_LABELS, type DocType } from "@/lib/doctypes";
import { formatCzk, formatDate } from "@/lib/format";
import { listInvoices } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const invoices = await listInvoices();

  return (
    <>
      <PageTitle
        title="Doklady"
        subtitle="Faktury, cenové nabídky a potvrzení objednávek od dodavatelů."
        action={
          <Link
            href="/nahrat"
            className="rounded-lg bg-bark-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-bark-800"
          >
            Nahrát doklady
          </Link>
        }
      />

      {invoices.length === 0 ? (
        <Empty
          title="Zatím tu nic není"
          hint="Nahrajte první PDF a začne se plnit cenová databáze."
          cta={{ href: "/nahrat", label: "Nahrát doklady" }}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Dodavatel</th>
                <th>Druh</th>
                <th>Číslo</th>
                <th>Vystaveno</th>
                <th>Zakázka</th>
                <th className="num">Bez DPH</th>
                <th>Stav</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>
                    <Link href={`/faktury/${inv.id}`} className="font-medium hover:underline">
                      {inv.supplier_name ?? "Neznámý dodavatel"}
                    </Link>
                    <div className="text-xs text-bark-500">{inv.file_name}</div>
                  </td>
                  <td>
                    {inv.doc_type === "faktura" ? (
                      <span className="text-bark-700">Faktura</span>
                    ) : (
                      <Badge tone="neutral">
                        {DOC_TYPE_LABELS[inv.doc_type as DocType] ?? inv.doc_type}
                      </Badge>
                    )}
                  </td>
                  <td className="text-bark-700">{inv.invoice_number ?? "—"}</td>
                  <td className="text-bark-700">{formatDate(inv.issue_date)}</td>
                  <td className="text-bark-700">{inv.project ?? "—"}</td>
                  <td className="num font-medium">{formatCzk(inv.total_net)}</td>
                  <td>
                    {inv.status === "confirmed" ? (
                      <Badge tone="good">Potvrzeno</Badge>
                    ) : (
                      <Badge tone="warn">Ke kontrole</Badge>
                    )}
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
