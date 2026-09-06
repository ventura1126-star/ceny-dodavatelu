/** Měrné jednotky, které se reálně objevují na fakturách českých dodavatelů stavebnin. */
export const CANONICAL_UNITS = [
  "ks",
  "bm",
  "m2",
  "m3",
  "kg",
  "t",
  "l",
  "bal",
  "sada",
  "hod",
] as const;

export type CanonicalUnit = (typeof CANONICAL_UNITS)[number];

const UNIT_MAP: Record<string, CanonicalUnit> = {
  ks: "ks", kus: "ks", kusu: "ks", kusů: "ks", pcs: "ks", "ks.": "ks",
  m: "bm", bm: "bm", mb: "bm", bmt: "bm", mtr: "bm", metr: "bm", "běžný metr": "bm", "bezny metr": "bm",
  m2: "m2", "m²": "m2", qm: "m2", "m^2": "m2", m2r: "m2",
  m3: "m3", "m³": "m3", "m^3": "m3", cbm: "m3", plm: "m3", prms: "m3",
  kg: "kg", kilogram: "kg",
  t: "t", tuna: "t", tun: "t", to: "t",
  l: "l", lt: "l", ltr: "l", litr: "l",
  bal: "bal", "bal.": "bal", baleni: "bal", balení: "bal", pack: "bal", karton: "bal", role: "bal", rol: "bal",
  sada: "sada", set: "sada", kpl: "sada", "kpl.": "sada", komplet: "sada",
  hod: "hod", hodina: "hod", "hod.": "hod", nh: "hod",
};

/** Převede jednotku z faktury na kanonický tvar. Vrací null, pokud jednotku nepoznáme. */
export function normalizeUnit(raw: string | null | undefined): CanonicalUnit | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return UNIT_MAP[key] ?? UNIT_MAP[key.replace(/[.\s]/g, "")] ?? null;
}

/** Jednotka pro zobrazení — pokud ji neznáme, ukážeme původní text z faktury. */
export function displayUnit(raw: string | null | undefined): string {
  const c = normalizeUnit(raw);
  if (c === "m2") return "m²";
  if (c === "m3") return "m³";
  return c ?? (raw?.trim() || "—");
}
