import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { DOC_TYPES } from "./doctypes";
import { CATEGORIES } from "./normalize";
import { CANONICAL_UNITS } from "./units";

/** Model lze přepsat proměnnou ANTHROPIC_MODEL (např. na levnější claude-sonnet-5). */
const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5";
const EFFORT = (process.env.ANTHROPIC_EFFORT?.trim() || "medium") as
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

const ItemSchema = z.object({
  line_no: z.number().int().describe("Pořadí položky na faktuře, od 1."),
  description: z
    .string()
    .describe("Přesný název položky tak, jak je vytištěný na faktuře, včetně rozměrů a jakosti."),
  catalog_code: z
    .string()
    .nullable()
    .describe("Katalogové / objednací číslo dodavatele, pokud je u položky uvedeno."),
  quantity: z.number().nullable().describe("Fakturované množství."),
  unit: z.string().nullable().describe("Měrná jednotka tak, jak je na faktuře (ks, m, m2, m3, bm, kg, bal...)."),
  unit_price_net: z
    .number()
    .nullable()
    .describe(
      "Cena za jednu měrnou jednotku BEZ DPH a PO odečtení slevy. Pokud je na faktuře jen cena před slevou, dopočítej ji jako celkem_bez_dph / množství.",
    ),
  discount_pct: z.number().nullable().describe("Sleva v procentech, pokud je u položky uvedena."),
  line_total_net: z.number().nullable().describe("Celková cena za řádek bez DPH po slevě."),
  vat_rate: z.number().nullable().describe("Sazba DPH v procentech (21, 12, 0)."),
  is_material: z
    .boolean()
    .describe(
      "true pro skutečný materiál. false pro dopravu, přepravné, manipulaci, palety, vratné obaly, balné, recyklační poplatky, zaokrouhlení a zálohy.",
    ),
  material_name: z
    .string()
    .describe(
      "Zkrácený, sjednocený název materiálu vhodný do katalogu — druh, materiál/dřevina, rozměr, jakost. Např. 'KVH hranol smrk 60x120 C24' nebo 'Palubka modřín 19x121 A/B'.",
    ),
  dimensions: z
    .string()
    .nullable()
    .describe("Rozměr v milimetrech ve tvaru 60x120 nebo 19x121x4000, pokud z názvu vyplývá."),
  category: z.enum(CATEGORIES as unknown as [string, ...string[]]).describe("Kategorie materiálu."),
  canonical_unit: z
    .enum(CANONICAL_UNITS as unknown as [string, ...string[]])
    .describe("Měrná jednotka převedená na kanonický tvar."),
});

const InvoiceSchema = z.object({
  doc_type: z
    .enum(DOC_TYPES as unknown as [string, ...string[]])
    .describe(
      "Druh dokladu: faktura (daňový doklad), nabidka (cenová nabídka), potvrzeni (potvrzení objednávky), dodaci_list.",
    ),
  valid_until: z
    .string()
    .nullable()
    .describe("Do kdy platí nabídková cena (YYYY-MM-DD). Jen u nabídek, jinak null."),
  supplier_name: z.string().describe("Obchodní jméno dodavatele (vystavitele faktury), ne odběratele."),
  supplier_ico: z.string().nullable(),
  supplier_dic: z.string().nullable(),
  supplier_address: z.string().nullable(),
  invoice_number: z.string().nullable().describe("Číslo faktury / daňového dokladu."),
  variable_symbol: z.string().nullable(),
  issue_date: z.string().nullable().describe("Datum vystavení ve tvaru YYYY-MM-DD."),
  taxable_date: z.string().nullable().describe("Datum uskutečnění zdanitelného plnění (DUZP), YYYY-MM-DD."),
  due_date: z.string().nullable().describe("Datum splatnosti, YYYY-MM-DD."),
  currency: z.string().describe("Měna, obvykle CZK."),
  total_net: z.number().nullable().describe("Celkem bez DPH."),
  total_vat: z.number().nullable().describe("Celkem DPH."),
  total_gross: z.number().nullable().describe("Celkem k úhradě včetně DPH."),
  items: z.array(ItemSchema),
  warnings: z
    .array(z.string())
    .describe(
      "Česky formulovaná upozornění na místa, kde sis nebyl jistý — nečitelný údaj, nesouhlasící součet, chybějící cena.",
    ),
});

export type ExtractedInvoice = z.infer<typeof InvoiceSchema>;
export type ExtractedItem = z.infer<typeof ItemSchema>;

const SYSTEM_PROMPT = `Jsi asistent pro zpracování přijatých faktur české stavební firmy, která staví roubenky, rekreační chaty a dřevěné fasády.

Z přiloženého PDF vytěž hlavičku faktury a VŠECHNY fakturované řádky. Pravidla:

1. Dodavatel je ten, kdo fakturu VYSTAVIL. Odběratelem je Mistři dřeva s.r.o. — toho nikdy neuváděj jako dodavatele.
2. Vytěž každý řádek, i ty, které nejsou materiál (doprava, palety, zaokrouhlení) — jen je označ is_material = false.
3. Ceny uváděj vždy BEZ DPH a PO slevě. Když je na faktuře jednotková cena před slevou a zvlášť sleva, spočítej výslednou jednotkovou cenu.
4. Čísla piš jako čísla, ne text: desetinná tečka, bez mezer, bez měny. "1 234,50" → 1234.5.
5. Data převeď do tvaru YYYY-MM-DD.
6. material_name je tvůj sjednocený název pro katalog. Piš ho konzistentně ve stejné struktuře: druh + dřevina/materiál + rozměr + jakost. Vynech skladové kódy, počty v balení a marketingové přívlastky.
7. Rozměry piš v milimetrech bez mezer, oddělené písmenem x: 60x120, 19x121x4000.
8. Když si nejsi jistý, radši dej null a napiš důvod do warnings. Nikdy si údaj nevymýšlej.
9. Když doklad obsahuje víc dokumentů, zpracuj ten hlavní.
10. Urči druh dokladu podle jeho záhlaví, ne podle obsahu:
    - "Faktura", "Daňový doklad", "Faktura - daňový doklad" → faktura
    - "Cenová nabídka", "Nabídka", "Kalkulace", "Předběžný rozpočet" → nabidka
    - "Potvrzení objednávky", "Potvrzení zakázky" → potvrzeni
    - "Dodací list" → dodaci_list
    U nabídek a potvrzení objednávky bývá věta, že ceny jsou nezávazné nebo platí
    do určitého data — to datum vrať v valid_until.
11. Dodavatelé často účtují v jiné jednotce, než ve které prodávají: například
    "30 bal" a zároveň "630 m" s cenou za metr. Vždy vrať tu jednotku a množství,
    ke kterým se vztahuje jednotková cena — tedy 630 a "m", ne 30 a "bal".`;

export interface ExtractResult {
  data: ExtractedInvoice;
  model: string;
  usage: { input: number; output: number };
}

/** Přečte PDF faktury přes Claude API a vrátí strukturovaná data. */
export async function extractInvoice(pdf: Buffer, fileName: string): Promise<ExtractResult> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error(
      "Chybí ANTHROPIC_API_KEY. Doplňte klíč z console.anthropic.com do nastavení aplikace.",
    );
  }

  const client = new Anthropic();

  const request = {
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user" as const,
        content: [
          {
            type: "document" as const,
            source: {
              type: "base64" as const,
              media_type: "application/pdf" as const,
              data: pdf.toString("base64"),
            },
          },
          {
            type: "text" as const,
            text: `Zpracuj tento doklad (soubor ${fileName}) a vrať strukturovaná data.`,
          },
        ],
      },
    ],
  };

  let message;
  try {
    message = await client.messages.parse({
      ...request,
      output_config: { effort: EFFORT, format: zodOutputFormat(InvoiceSchema) },
    });
  } catch (err) {
    // Starší a menší modely parametr effort neznají. Není za co bojovat —
    // zopakujeme dotaz bez něj, ať volba modelu nerozbije celou aplikaci.
    if (!/does not support the effort parameter/i.test(errorMessage(err))) {
      throw new Error(explainApiError(err));
    }
    try {
      message = await client.messages.parse({
        ...request,
        output_config: { format: zodOutputFormat(InvoiceSchema) },
      });
    } catch (retryErr) {
      throw new Error(explainApiError(retryErr));
    }
  }

  const data = message.parsed_output;
  if (!data) {
    throw new Error(
      "Model nevrátil použitelná data. Zkuste doklad nahrát znovu, nebo položky doplňte ručně.",
    );
  }

  return {
    data,
    model: MODEL,
    usage: {
      input: message.usage.input_tokens,
      output: message.usage.output_tokens,
    },
  };
}

/**
 * Přeloží chyby z Anthropic API na větu, ze které je poznat, co udělat.
 * Syrová anglická odpověď s JSONem je v aplikaci pro účetní k ničemu.
 */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function explainApiError(err: unknown): string {
  const message = errorMessage(err);
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status: unknown }).status)
      : 0;

  if (/credit balance is too low/i.test(message)) {
    return "Na účtu Anthropic došel kredit. Dobijte ho na console.anthropic.com v sekci Plans & Billing — pak stačí doklad nahrát znovu.";
  }
  if (/not_found_error|model.*not (be )?found|invalid model|unknown model/i.test(message)) {
    return `Model "${MODEL}" neexistuje. Zkontrolujte proměnnou ANTHROPIC_MODEL — platné hodnoty jsou claude-opus-5, claude-sonnet-5 nebo claude-haiku-4-5.`;
  }
  if (status === 401 || /authentication|invalid x-api-key/i.test(message)) {
    return "Klíč ANTHROPIC_API_KEY je neplatný nebo chybí. Zkontrolujte ho v nastavení aplikace.";
  }
  if (status === 429 || /rate limit/i.test(message)) {
    return "Anthropic API je zahlcené. Zkuste to za chvíli, nebo nahrávejte doklady po menších dávkách.";
  }
  if (/could not process image|unsupported|invalid.*pdf|corrupt/i.test(message)) {
    return "Soubor se nepodařilo přečíst — buď to není platné PDF, nebo je poškozené. Zkuste ho znovu vyexportovat.";
  }
  if (status >= 500) {
    return "Anthropic API má dočasný výpadek. Zkuste to prosím za pár minut znovu.";
  }
  if (/timeout|ETIMEDOUT|ECONNRESET|fetch failed/i.test(message)) {
    return "Spojení s Anthropic API se nepodařilo navázat. Zkontrolujte připojení a zkuste to znovu.";
  }
  return `Čtení dokladu selhalo: ${message}`;
}
