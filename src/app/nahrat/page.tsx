import Uploader from "@/components/Uploader";
import { Card, PageTitle } from "@/components/ui";

export default function UploadPage() {
  return (
    <>
      <PageTitle
        title="Nahrát doklady"
        subtitle="Faktury i cenové nabídky. Z každého PDF se vytěží hlavička a všechny položky — do cenové databáze se dostanou až po vaší kontrole."
      />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Uploader />
        <Card className="h-fit p-5 text-sm leading-relaxed text-bark-700">
          <h2 className="mb-2 font-semibold text-bark-900">Jak to funguje</h2>
          <ol className="list-decimal space-y-2 pl-4">
            <li>Nahrajete PDF od dodavatele — fakturu, cenovou nabídku i potvrzení objednávky.</li>
            <li>Claude pozná druh dokladu a přečte dodavatele, datum a všechny řádky s cenami.</li>
            <li>
              Ke každé položce se najde materiál v katalogu. Co už jste jednou potvrdili, naskočí
              příště samo.
            </li>
            <li>Zkontrolujete a potvrdíte — teprve tím se ceny propíší do databáze.</li>
          </ol>
          <p className="mt-4 text-xs text-bark-500">
            Nabídkové ceny se vedou odděleně od fakturovaných a nikdy se nemíchají. Stejný
            soubor nahraný podruhé se nezaloží znovu — doklady se hlídají podle otisku souboru.
          </p>
        </Card>
      </div>
    </>
  );
}
