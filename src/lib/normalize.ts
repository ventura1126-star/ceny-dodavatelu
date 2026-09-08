/**
 * Normalizace textu položek z faktur.
 *
 * Cílem je, aby "KVH hranol SM 60x120x4000 mm C24" od jednoho dodavatele
 * a "Hranol KVH  60 × 120 – 4,0 m, smrk C24" od druhého skončily co nejblíž
 * u sebe a šly spolehlivě spárovat na jeden materiál v katalogu.
 */

/** Odstraní diakritiku ("modřín" → "modrin"). */
export function stripDiacritics(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Kanonický tvar textu položky pro porovnávání a hledání. */
export function normalizeText(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = stripDiacritics(raw.toLowerCase());
  s = s.replace(/[×✕✖]/g, "x");
  s = s.replace(/[""„“'']/g, " ");
  // Sjednotí desetinnou čárku na tečku uvnitř čísel (4,0 m → 4.0 m).
  s = s.replace(/(\d),(\d)/g, "$1.$2");
  // Sjednotí rozměrové zápisy: "60 x 120" → "60x120".
  s = s.replace(/(\d(?:\.\d+)?)\s*[x*\/]\s*(?=\d)/g, "$1x");
  s = s.replace(/[^a-z0-9x.,\-+/ ]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** Vytáhne z textu rozměry typu 60x120 nebo 19x121x4000. */
export function extractDimensions(raw: string | null | undefined): string | null {
  const s = normalizeText(raw);
  const match = s.match(/\b(\d{1,4}(?:\.\d+)?(?:x\d{1,5}(?:\.\d+)?){1,2})\b/);
  return match ? match[1] : null;
}

const STOPWORDS = new Set([
  "mm", "cm", "m", "ks", "bal", "kus", "kusu", "dle", "pro", "a", "s", "z", "na", "do",
  "cca", "typ", "cislo", "c", "kod", "art", "artikl", "nabidka", "objednavka",
]);

/** Rozpad na porovnatelné tokeny (bez výplňových slov). */
export function tokenize(raw: string | null | undefined): string[] {
  return normalizeText(raw)
    .split(/[\s,\-+/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function bigrams(token: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < token.length - 1; i++) out.push(token.slice(i, i + 2));
  return out;
}

/** Podobnost dvou textů v rozsahu 0–1 (Diceův koeficient nad tokeny i bigramy). */
export function similarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return 0;

  const setB = new Set(tb);
  const shared = ta.filter((t) => setB.has(t)).length;
  const tokenScore = (2 * shared) / (ta.length + tb.length);

  const ga = ta.flatMap(bigrams);
  const gb = new Set(tb.flatMap(bigrams));
  const sharedG = ga.filter((g) => gb.has(g)).length;
  const gramScore = ga.length === 0 || gb.size === 0 ? 0 : (2 * sharedG) / (ga.length + gb.size);

  let score = 0.65 * tokenScore + 0.35 * gramScore;

  // Shodné rozměry jsou u řeziva a profilů nejsilnější signál.
  const da = extractDimensions(a);
  const db = extractDimensions(b);
  if (da && db) score += da === db ? 0.2 : -0.25;

  return Math.max(0, Math.min(1, score));
}

/** Kategorie odpovídající tomu, co firma reálně nakupuje — materiál i vybavení. */
export const CATEGORIES = [
  "Řezivo a KVH",
  "Palubky a obklady",
  "Fasádní profily",
  "Deskové materiály",
  "Izolace",
  "Fólie a parozábrany",
  "Střešní krytina",
  "Klempířské prvky",
  "Spojovací materiál",
  "Kotevní technika",
  "Nátěry a impregnace",
  "Okna a dveře",
  "Suchá výstavba",
  "Podlahy",
  "Zámečnické prvky",
  "Nářadí a příslušenství",
  "Ochranné pomůcky",
  "Chemie a lepidla",
  "Provozní materiál",
  "Doprava a služby",
  "Ostatní",
] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * Řádky, které nejsou nakoupené zboží a nemají zkreslovat cenovou databázi.
 *
 * Pozor na hranici: nářadí, ochranné pomůcky i provozní materiál (rukavice,
 * holínky, vědro, řezné kotouče, pytle na odpad) do cen PATŘÍ — kupujete je
 * a jejich cena se u dodavatelů liší stejně jako u řeziva. Sem patří jen to,
 * co si domů neodvezete: doprava, manipulace, obaly, poplatky a zaokrouhlení.
 */
const NON_MATERIAL_PATTERNS = [
  /doprav/, /prepravn/, /manipulac/, /palet/, /vratn/, /zaokrouhlen/, /balne/,
  /poplatek/, /recyklacn/, /nakladk/, /vykladk/, /jerab/, /storno/, /zaloh/,
  /skladan/, /slozen/, /dovoz/, /expedic/, /pujcovn/, /najem/,
];

export function looksLikeNonGoods(raw: string): boolean {
  const s = normalizeText(raw);
  return NON_MATERIAL_PATTERNS.some((re) => re.test(s));
}
