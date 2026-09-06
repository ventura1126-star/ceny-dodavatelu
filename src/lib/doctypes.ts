/** Typy dokladů, které se do aplikace nahrávají. */
export const DOC_TYPES = ["faktura", "nabidka", "potvrzeni", "dodaci_list"] as const;

export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  faktura: "Faktura",
  nabidka: "Cenová nabídka",
  potvrzeni: "Potvrzení objednávky",
  dodaci_list: "Dodací list",
};

/**
 * Doklady se dělí na dvě cenové větve, které se nikde nesčítají:
 *   fakturováno — co jste skutečně zaplatili (faktura, dodací list)
 *   nabídnuto   — co vám kdo nabídl, nezávazně (nabídka, potvrzení objednávky)
 */
export const INVOICED_TYPES: DocType[] = ["faktura", "dodaci_list"];
export const OFFERED_TYPES: DocType[] = ["nabidka", "potvrzeni"];

export type PriceTrack = "invoiced" | "offered";

export function trackOf(docType: string): PriceTrack {
  return OFFERED_TYPES.includes(docType as DocType) ? "offered" : "invoiced";
}

export const TRACK_LABELS: Record<PriceTrack, string> = {
  invoiced: "Fakturováno",
  offered: "Nabídnuto",
};

/** SQL fragment pro filtr větve — používá se v dotazech na ceny. */
export function trackSql(track: PriceTrack): string {
  const types = track === "offered" ? OFFERED_TYPES : INVOICED_TYPES;
  return types.map((t) => `'${t}'`).join(", ");
}
