import { all } from "@/db";
import { normalizeText, similarity } from "./normalize";
import type { Material } from "./types";

export interface MatchResult {
  materialId: number | null;
  confidence: number;
  source: "alias" | "fuzzy" | "ai" | "none";
}

/** Prah, nad kterým považujeme fuzzy shodu za dost dobrou na předvyplnění. */
const FUZZY_THRESHOLD = 0.78;

/**
 * Najde pro položku faktury odpovídající materiál v katalogu.
 *
 * Postup je záměrně třístupňový:
 *   1. alias — text, který už jsme u tohoto dodavatele jednou potvrdili (jistota)
 *   2. fuzzy — podobnost s existujícím materiálem v katalogu (návrh ke kontrole)
 *   3. nic  — položka se při potvrzení faktury založí jako nový materiál
 */
export async function matchMaterial(
  supplierId: number | null,
  rawDescription: string,
  aiSuggestedName: string | null,
  catalogCode: string | null,
  catalog: Material[],
): Promise<MatchResult> {
  const rawNorm = normalizeText(rawDescription);

  if (supplierId) {
    const alias = await all<{ material_id: number }>(
      `SELECT material_id FROM material_aliases
       WHERE supplier_id = ? AND (raw_normalized = ? OR (catalog_code IS NOT NULL AND catalog_code = ?))
       LIMIT 1`,
      [supplierId, rawNorm, catalogCode],
    );
    if (alias[0]) return { materialId: alias[0].material_id, confidence: 1, source: "alias" };
  }

  let best: { id: number; score: number } | null = null;
  for (const material of catalog) {
    // Porovnáváme jak s původním textem faktury, tak s návrhem názvu od AI —
    // stačí, když sedí jedno z toho.
    const score = Math.max(
      similarity(rawDescription, material.name),
      aiSuggestedName ? similarity(aiSuggestedName, material.name) : 0,
    );
    if (!best || score > best.score) best = { id: material.id, score };
  }

  if (best && best.score >= FUZZY_THRESHOLD) {
    return { materialId: best.id, confidence: best.score, source: "fuzzy" };
  }

  return { materialId: null, confidence: best?.score ?? 0, source: "ai" };
}

/** Načte celý katalog materiálů (je řádově ve stovkách, klidně se vejde do paměti). */
export function loadCatalog(): Promise<Material[]> {
  return all<Material>(
    `SELECT id, name, name_normalized, category, unit, dimensions, quality, note FROM materials`,
  );
}

/** Nabídne materiály nejpodobnější zadanému textu — pro našeptávač při kontrole faktury. */
export async function suggestMaterials(query: string, limit = 8): Promise<Material[]> {
  const catalog = await loadCatalog();
  return catalog
    .map((m) => ({ m, score: similarity(query, m.name) }))
    .filter((x) => x.score > 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.m);
}
