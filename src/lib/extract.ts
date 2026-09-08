import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { InvoiceSchema, type ExtractedInvoice } from "./extract-schema";

export type { ExtractedInvoice, ExtractedItem } from "./extract-schema";

/** Model lze přepsat proměnnou ANTHROPIC_MODEL (např. na levnější claude-sonnet-5). */
const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5";
const EFFORT = (process.env.ANTHROPIC_EFFORT?.trim() || "medium") as
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";


const SYSTEM_PROMPT = `Jsi asistent pro zpracování přijatých dokladů české stavební firmy, která staví roubenky, rekreační chaty a dřevěné fasády. Firma nakupuje stavební materiál, ale taky nářadí, ochranné pomůcky, chemii a provozní materiál — sleduje si nákupní ceny všeho.

Z přiloženého PDF vytěž hlavičku dokladu a VŠECHNY fakturované řádky. Pravidla:

1. Dodavatel je ten, kdo fakturu VYSTAVIL. Odběratelem je Mistři dřeva s.r.o. — toho nikdy neuváděj jako dodavatele.
2. Vytěž každý řádek. is_material = true patří VŠEMU nakoupenému zboží, ne jen
   stavebnímu materiálu — tedy i rukavicím, holínkám, přilbám, řezným kotoučům,
   vrtákům, frézám, pistolím na PU pěnu, lepidlům, vědrům a pytlům na odpad.
   is_material = false dej jen řádkům, které nejsou zboží: doprava, přepravné,
   manipulace, skládání, palety, vratné obaly, balné, poplatky, zaokrouhlení, zálohy.
3. Ceny uváděj vždy BEZ DPH a PO slevě. Když je na faktuře jednotková cena před slevou a zvlášť sleva, spočítej výslednou jednotkovou cenu.
4. Čísla piš jako čísla, ne text: desetinná tečka, bez mezer, bez měny. "1 234,50" → 1234.5.
5. Data převeď do tvaru YYYY-MM-DD.
6. material_name je tvůj sjednocený název pro katalog. Piš ho konzistentně ve stejné struktuře: druh + dřevina/materiál + rozměr + jakost. Vynech skladové kódy, počty v balení a marketingové přívlastky.
7. Rozměry piš v milimetrech bez mezer, oddělené písmenem x: 60x120, 19x121x4000.
8. Když si nejsi jistý, nech textové pole prázdné ("") a číselné null, a napiš důvod do warnings. Nikdy si údaj nevymýšlej.
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
  if (/failed to parse structured output/i.test(message)) {
    return "Model vrátil data v nečekaném tvaru a nepodařilo se je zpracovat. Zkuste doklad nahrát znovu — obvykle napodruhé projde. Když se to opakuje, dejte mi vědět, o který doklad jde.";
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
