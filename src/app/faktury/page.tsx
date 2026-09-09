import Link from "next/link";
import InvoiceList from "@/components/InvoiceList";
import { Empty, PageTitle } from "@/components/ui";
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
        <InvoiceList invoices={invoices} />
      )}
    </>
  );
}
