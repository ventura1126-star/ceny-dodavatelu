import * as z from "zod/v4";
import { DOC_TYPES } from "./doctypes";
import { CATEGORIES } from "./normalize";
import { CANONICAL_UNITS } from "./units";

/**
 * Tvar dat, který od modelu čekáme při čtení dokladu.
 *
 * Soubor je schválně bez `server-only` a bez závislosti na Anthropic SDK, aby
 * šel schéma zkontrolovat i mimo běh aplikace — viz `npm run check:schema`.
 *
 * Pozor na limit: Anthropic API povolí nejvýš 16 parametrů s union typem
 * v celém schématu včetně vnořených položek, a `.nullable()` union vytváří.
 * Textová pole proto vracejí prázdný řetězec místo null; na null se převádějí
 * až při ukládání (funkce `blank` v actions.ts).
 */
export const ItemSchema = z.object({
  line_no: z.number().int().describe("Pořadí položky na faktuře, od 1."),
  description: z
    .string()
    .describe("Přesný název položky tak, jak je vytištěný na faktuře, včetně rozměrů a jakosti."),
  catalog_code: z
    .string()
    .describe("Katalogové / objednací číslo dodavatele. Prázdný řetězec, když u položky není."),
  quantity: z.number().nullable().describe("Fakturované množství."),
  unit: z
    .string()
    .describe(
      "Měrná jednotka, ke které se vztahuje jednotková cena (ks, m, m2, m3, bm, kg, bal...). Prázdný řetězec, když ji nelze určit.",
    ),
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
    .describe(
      "Rozměr v milimetrech ve tvaru 60x120 nebo 19x121x4000. Prázdný řetězec, když z názvu nevyplývá.",
    ),
  category: z.enum(CATEGORIES as unknown as [string, ...string[]]).describe("Kategorie materiálu."),
  canonical_unit: z
    .enum(CANONICAL_UNITS as unknown as [string, ...string[]])
    .describe("Měrná jednotka převedená na kanonický tvar."),
});

export const InvoiceSchema = z.object({
  doc_type: z
    .enum(DOC_TYPES as unknown as [string, ...string[]])
    .describe(
      "Druh dokladu: faktura (daňový doklad), nabidka (cenová nabídka), potvrzeni (potvrzení objednávky), dodaci_list.",
    ),
  valid_until: z
    .string()
    .describe("Do kdy platí nabídková cena (YYYY-MM-DD). Prázdný řetězec u faktur a dodacích listů."),
  supplier_name: z.string().describe("Obchodní jméno dodavatele (vystavitele faktury), ne odběratele."),
  supplier_ico: z.string().describe("IČO dodavatele, prázdný řetězec když není uvedeno."),
  supplier_dic: z.string().describe("DIČ dodavatele, prázdný řetězec když není uvedeno."),
  supplier_address: z.string().describe("Adresa dodavatele, prázdný řetězec když není uvedena."),
  invoice_number: z.string().describe("Číslo dokladu. Prázdný řetězec, když žádné nemá."),
  variable_symbol: z.string().describe("Variabilní symbol, prázdný řetězec když není uveden."),
  issue_date: z.string().describe("Datum vystavení ve tvaru YYYY-MM-DD, jinak prázdný řetězec."),
  taxable_date: z.string().describe("DUZP ve tvaru YYYY-MM-DD, jinak prázdný řetězec."),
  due_date: z.string().describe("Datum splatnosti ve tvaru YYYY-MM-DD, jinak prázdný řetězec."),
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

// Anthropic API omezuje počet parametrů s union typem (tedy .nullable()) na 16
// v celém schématu, včetně vnořených položek. Textová pole proto místo null
// vracejí prázdný řetězec — na null se převádějí až při ukládání.

export type ExtractedInvoice = z.infer<typeof InvoiceSchema>;
export type ExtractedItem = z.infer<typeof ItemSchema>;
