import "server-only";
import { all, one, run } from "@/db";
import { normalizeText, extractDimensions } from "./normalize";
import { normalizeUnit } from "./units";
import type {
  Invoice,
  InvoiceItem,
  Material,
  MaterialSummary,
  Supplier,
  SupplierPrice,
} from "./types";

/* ------------------------------------------------------------------ */
/* Dodavatelé                                                          */
/* ------------------------------------------------------------------ */

export function listSuppliers(): Promise<Supplier[]> {
  return all<Supplier>(`SELECT * FROM suppliers ORDER BY name COLLATE NOCASE`);
}

/** Najde dodavatele podle IČO nebo názvu, jinak ho založí. */
export async function upsertSupplier(input: {
  name: string;
  ico?: string | null;
  dic?: string | null;
  address?: string | null;
}): Promise<number> {
  const name = input.name.trim();
  const norm = normalizeText(name);
  const ico = input.ico?.replace(/\s/g, "") || null;

  if (ico) {
    const byIco = await one<{ id: number }>(`SELECT id FROM suppliers WHERE ico = ?`, [ico]);
    if (byIco) return byIco.id;
  }
  const byName = await one<{ id: number }>(`SELECT id FROM suppliers WHERE name_normalized = ?`, [
    norm,
  ]);
  if (byName) return byName.id;

  const res = await run(
    `INSERT INTO suppliers (name, name_normalized, ico, dic, address) VALUES (?, ?, ?, ?, ?)`,
    [name, norm, ico, input.dic || null, input.address || null],
  );
  return res.lastInsertRowid!;
}

/* ------------------------------------------------------------------ */
/* Materiály                                                           */
/* ------------------------------------------------------------------ */

export function listMaterials(): Promise<Material[]> {
  return all<Material>(`SELECT * FROM materials ORDER BY category, name COLLATE NOCASE`);
}

export function getMaterial(id: number): Promise<Material | null> {
  return one<Material>(`SELECT * FROM materials WHERE id = ?`, [id]);
}

/** Založí materiál v katalogu, nebo vrátí existující se shodným normalizovaným názvem. */
export async function upsertMaterial(input: {
  name: string;
  category?: string | null;
  unit?: string | null;
}): Promise<number> {
  const name = input.name.trim();
  const norm = normalizeText(name);
  const existing = await one<{ id: number }>(`SELECT id FROM materials WHERE name_normalized = ?`, [
    norm,
  ]);
  if (existing) return existing.id;

  const res = await run(
    `INSERT INTO materials (name, name_normalized, category, unit, dimensions) VALUES (?, ?, ?, ?, ?)`,
    [
      name,
      norm,
      input.category || "Ostatní",
      normalizeUnit(input.unit) || input.unit || "ks",
      extractDimensions(name),
    ],
  );
  return res.lastInsertRowid!;
}

export async function updateMaterial(
  id: number,
  input: { name: string; category: string; unit: string; note: string | null },
) {
  await run(
    `UPDATE materials SET name = ?, name_normalized = ?, category = ?, unit = ?, dimensions = ?, note = ?
     WHERE id = ?`,
    [
      input.name.trim(),
      normalizeText(input.name),
      input.category,
      input.unit,
      extractDimensions(input.name),
      input.note,
      id,
    ],
  );
}

/** Sloučí materiál `fromId` do `intoId` — položky faktur i aliasy se přepnou. */
export async function mergeMaterials(fromId: number, intoId: number) {
  if (fromId === intoId) return;
  await run(`UPDATE invoice_items SET material_id = ? WHERE material_id = ?`, [intoId, fromId]);
  await run(`UPDATE OR IGNORE material_aliases SET material_id = ? WHERE material_id = ?`, [
    intoId,
    fromId,
  ]);
  await run(`DELETE FROM materials WHERE id = ?`, [fromId]);
}

/* ------------------------------------------------------------------ */
/* Ceny                                                                */
/* ------------------------------------------------------------------ */

/**
 * Společný poddotaz: každá potvrzená položka faktury s cenou, očíslovaná
 * od nejnovější v rámci dvojice (materiál, dodavatel).
 */
const OFFERED_SQL = "i.doc_type IN ('nabidka', 'potvrzeni')";

/**
 * Společný poddotaz: každá potvrzená položka dokladu s cenou.
 *
 * `track` dělí ceny na dvě větve, které se nikdy nesčítají — fakturováno (co
 * jste zaplatili) a nabídnuto (co vám kdo nezávazně nabídl).
 *
 * Součástí klíče je i JEDNOTKA. Stejný materiál umí jeden dodavatel účtovat za
 * m² a druhý za balení; 145 Kč/m² a 1 100 Kč/bal spolu nemají co srovnávat.
 * `rn` se proto počítá zvlášť pro každou trojici dodavatel + větev + jednotka
 * a nikde se ceny přes jednotky nemíchají.
 */
const PRICE_POINTS = `
  SELECT ii.material_id            AS material_id,
         i.supplier_id             AS supplier_id,
         COALESCE(s.name, 'Neznámý dodavatel') AS supplier_name,
         i.doc_type                AS doc_type,
         CASE WHEN ${OFFERED_SQL} THEN 'offered' ELSE 'invoiced' END AS track,
         i.valid_until             AS valid_until,
         CASE WHEN ${OFFERED_SQL} AND i.valid_until IS NOT NULL AND i.valid_until < date('now')
              THEN 1 ELSE 0 END    AS expired,
         ii.unit                   AS unit,
         COALESCE(ii.unit, '?')    AS unit_key,
         ii.unit_price_net         AS price,
         ii.quantity               AS quantity,
         ii.line_total_net         AS line_total,
         COALESCE(i.issue_date, date(i.created_at)) AS price_date,
         i.id                      AS invoice_id,
         ROW_NUMBER() OVER (
           PARTITION BY ii.material_id, i.supplier_id, COALESCE(ii.unit, '?'),
                        CASE WHEN ${OFFERED_SQL} THEN 'offered' ELSE 'invoiced' END
           ORDER BY COALESCE(i.issue_date, date(i.created_at)) DESC, ii.id DESC
         ) AS rn
  FROM invoice_items ii
  JOIN invoices i  ON i.id = ii.invoice_id
  LEFT JOIN suppliers s ON s.id = i.supplier_id
  WHERE i.status = 'confirmed'
    AND ii.material_id IS NOT NULL
    AND ii.is_material = 1
    AND ii.unit_price_net IS NOT NULL
    AND ii.unit_price_net > 0
`;

/** Přehled cen jednoho materiálu po dodavatelích, v jedné cenové větvi. */
export function getSupplierPrices(
  materialId: number,
  track: "invoiced" | "offered",
): Promise<SupplierPrice[]> {
  return all<SupplierPrice>(
    `WITH pp AS (${PRICE_POINTS})
     SELECT supplier_id,
            supplier_name,
            unit_key,
            MAX(CASE WHEN rn = 1 THEN unit END)        AS unit,
            MAX(CASE WHEN rn = 1 THEN price END)       AS last_price,
            MAX(CASE WHEN rn = 1 THEN price_date END)  AS last_date,
            MAX(CASE WHEN rn = 1 THEN invoice_id END)  AS last_invoice_id,
            MAX(CASE WHEN rn = 1 THEN doc_type END)    AS doc_type,
            MAX(CASE WHEN rn = 1 THEN valid_until END) AS valid_until,
            MAX(CASE WHEN rn = 1 THEN expired END)     AS expired,
            MIN(price)                                 AS min_price,
            MAX(price)                                 AS max_price,
            ROUND(AVG(price), 2)                       AS avg_price,
            COUNT(*)                                   AS purchases,
            ROUND(COALESCE(SUM(line_total), 0), 2)     AS total_spent,
            ROUND(COALESCE(SUM(quantity), 0), 3)       AS total_quantity
     FROM pp
     WHERE material_id = ? AND track = ?
     GROUP BY supplier_id, supplier_name, unit_key
     ORDER BY unit_key, last_price ASC`,
    [materialId, track],
  );
}

/** Všechny cenové body materiálu v čase — podklad pro graf vývoje ceny. */
export function getPriceHistory(materialId: number) {
  return all<{
    price_date: string;
    price: number;
    supplier_name: string;
    supplier_id: number;
    invoice_id: number;
    track: "invoiced" | "offered";
    quantity: number | null;
    unit: string | null;
  }>(
    `WITH pp AS (${PRICE_POINTS})
     SELECT price_date, price, supplier_name, supplier_id, invoice_id, track, quantity, unit
     FROM pp WHERE material_id = ?
     ORDER BY price_date ASC, invoice_id ASC`,
    [materialId],
  );
}

/**
 * Nejčastěji používaná jednotka daného materiálu.
 *
 * Ceny se dají porovnávat jen v rámci jedné jednotky, takže do přehledů vybíráme
 * tu, ve které je nejvíc dokladů. Existenci ostatních hlásíme přes `mixed_units`,
 * ať je poznat, že přehled ukazuje jen část.
 */
const MAIN_UNIT = `
  SELECT material_id, unit_key,
         ROW_NUMBER() OVER (
           PARTITION BY material_id ORDER BY COUNT(*) DESC, MAX(price_date) DESC, unit_key
         ) AS urn
  FROM pp
  GROUP BY material_id, unit_key
`;

/** Vyhledávání materiálů — hlavní vstup uživatele ("zadám typ materiálu"). */
export function searchMaterials(query: string, category?: string): Promise<MaterialSummary[]> {
  const q = normalizeText(query);
  const tokens = q.split(" ").filter(Boolean);
  // Každý zadaný token musí být obsažen v normalizovaném názvu — "kvh 60x120"
  // tak najde materiál bez ohledu na pořadí slov.
  const tokenClause = tokens.length
    ? "AND " + tokens.map(() => "m.name_normalized LIKE ?").join(" AND ")
    : "";
  const args: (string | number)[] = tokens.map((t) => `%${t}%`);
  const catClause = category ? "AND m.category = ?" : "";
  if (category) args.push(category);

  return all<MaterialSummary>(
    `WITH pp AS (${PRICE_POINTS}),
          latest AS (SELECT * FROM pp WHERE rn = 1),
          main AS (${MAIN_UNIT})
     SELECT m.id, m.name, m.category,
            COALESCE((SELECT unit_key FROM main WHERE main.material_id = m.id AND urn = 1), m.unit)
                                                    AS unit,
            (SELECT COUNT(DISTINCT unit_key) > 1 FROM pp p2 WHERE p2.material_id = m.id)
                                                    AS mixed_units,
            COUNT(DISTINCT pp.supplier_id)          AS suppliers,
            COUNT(pp.invoice_id)                    AS purchases,
            (SELECT MIN(l.price) FROM latest l JOIN main ON main.material_id = l.material_id AND main.unit_key = l.unit_key AND main.urn = 1
              WHERE l.material_id = m.id AND l.track = 'invoiced')            AS best_invoiced,
            (SELECT l.supplier_name FROM latest l JOIN main ON main.material_id = l.material_id AND main.unit_key = l.unit_key AND main.urn = 1
              WHERE l.material_id = m.id AND l.track = 'invoiced'
              ORDER BY l.price ASC LIMIT 1)                                   AS best_invoiced_supplier,
            (SELECT MAX(l.price_date) FROM latest l JOIN main ON main.material_id = l.material_id AND main.unit_key = l.unit_key AND main.urn = 1
              WHERE l.material_id = m.id AND l.track = 'invoiced')            AS last_invoiced_date,
            (SELECT MIN(l.price) FROM latest l JOIN main ON main.material_id = l.material_id AND main.unit_key = l.unit_key AND main.urn = 1
              WHERE l.material_id = m.id AND l.track = 'offered' AND l.expired = 0) AS best_offered,
            (SELECT l.supplier_name FROM latest l JOIN main ON main.material_id = l.material_id AND main.unit_key = l.unit_key AND main.urn = 1
              WHERE l.material_id = m.id AND l.track = 'offered' AND l.expired = 0
              ORDER BY l.price ASC LIMIT 1)                                   AS best_offered_supplier,
            (SELECT MAX(l.price_date) FROM latest l JOIN main ON main.material_id = l.material_id AND main.unit_key = l.unit_key AND main.urn = 1
              WHERE l.material_id = m.id AND l.track = 'offered')             AS last_offered_date,
            ROUND(COALESCE(SUM(pp.line_total), 0), 2) AS total_spent
     FROM materials m
     LEFT JOIN pp ON pp.material_id = m.id
     WHERE 1 = 1 ${tokenClause} ${catClause}
     GROUP BY m.id
     ORDER BY purchases DESC, m.name COLLATE NOCASE
     LIMIT 200`,
    args,
  );
}

/* ------------------------------------------------------------------ */
/* Faktury                                                             */
/* ------------------------------------------------------------------ */

export function listInvoices(status?: "draft" | "confirmed"): Promise<Invoice[]> {
  return all<Invoice>(
    `SELECT i.*, s.name AS supplier_name,
            (SELECT COUNT(*) FROM invoice_items ii WHERE ii.invoice_id = i.id) AS item_count
     FROM invoices i
     LEFT JOIN suppliers s ON s.id = i.supplier_id
     ${status ? "WHERE i.status = ?" : ""}
     ORDER BY COALESCE(i.issue_date, date(i.created_at)) DESC, i.id DESC`,
    status ? [status] : [],
  );
}

export function getInvoice(id: number): Promise<Invoice | null> {
  return one<Invoice>(
    `SELECT i.*, s.name AS supplier_name
     FROM invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id
     WHERE i.id = ?`,
    [id],
  );
}

export function getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]> {
  return all<InvoiceItem>(
    `SELECT ii.*, m.name AS material_name
     FROM invoice_items ii
     LEFT JOIN materials m ON m.id = ii.material_id
     WHERE ii.invoice_id = ?
     ORDER BY ii.line_no, ii.id`,
    [invoiceId],
  );
}

export async function deleteInvoice(id: number) {
  await run(`DELETE FROM invoices WHERE id = ?`, [id]);
}

/* ------------------------------------------------------------------ */
/* Dashboard a dodavatelské statistiky                                 */
/* ------------------------------------------------------------------ */

export async function getDashboardStats() {
  const stats = await one<{
    invoices: number;
    drafts: number;
    suppliers: number;
    materials: number;
    spent_12m: number;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM invoices WHERE status = 'confirmed')                    AS invoices,
       (SELECT COUNT(*) FROM invoices WHERE status = 'draft')                        AS drafts,
       (SELECT COUNT(*) FROM suppliers)                                              AS suppliers,
       (SELECT COUNT(*) FROM materials)                                              AS materials,
       (SELECT ROUND(COALESCE(SUM(total_net), 0), 2) FROM invoices
          WHERE status = 'confirmed'
            AND COALESCE(issue_date, date(created_at)) >= date('now', '-12 months')) AS spent_12m`,
  );
  return (
    stats ?? { invoices: 0, drafts: 0, suppliers: 0, materials: 0, spent_12m: 0 }
  );
}

/** Materiály, kde poslední nákup vyšel dráž než ten předchozí u stejného dodavatele. */
export function getPriceAlerts(limit = 12) {
  return all<{
    material_id: number;
    material_name: string;
    supplier_name: string;
    old_price: number;
    new_price: number;
    change_pct: number;
    price_date: string;
  }>(
    `WITH pp AS (${PRICE_POINTS})
     SELECT a.material_id,
            m.name AS material_name,
            a.supplier_name,
            b.price AS old_price,
            a.price AS new_price,
            ROUND((a.price - b.price) / b.price * 100, 1) AS change_pct,
            a.price_date
     FROM pp a
     JOIN pp b ON b.material_id = a.material_id
               AND b.supplier_id = a.supplier_id
               AND b.track = a.track
               AND b.unit_key = a.unit_key
               AND b.rn = 2
     JOIN materials m ON m.id = a.material_id
     WHERE a.rn = 1 AND a.track = 'invoiced' AND b.track = 'invoiced'
       AND b.price > 0 AND ABS(a.price - b.price) / b.price >= 0.03
     ORDER BY ABS(a.price - b.price) / b.price DESC
     LIMIT ?`,
    [limit],
  );
}

export function getSupplierStats() {
  return all<{
    id: number;
    name: string;
    ico: string | null;
    invoices: number;
    materials: number;
    total_net: number;
    last_invoice: string | null;
    spent_12m: number;
  }>(
    // Součty jsou schválně skalární poddotazy — join na položky faktur by
    // celkové částky vynásobil počtem řádků na faktuře.
    `SELECT s.id, s.name, s.ico,
            (SELECT COUNT(*) FROM invoices i
              WHERE i.supplier_id = s.id AND i.status = 'confirmed')            AS invoices,
            (SELECT COUNT(DISTINCT ii.material_id) FROM invoice_items ii
               JOIN invoices i ON i.id = ii.invoice_id
              WHERE i.supplier_id = s.id AND i.status = 'confirmed'
                AND ii.material_id IS NOT NULL)                                 AS materials,
            (SELECT ROUND(COALESCE(SUM(i.total_net), 0), 2) FROM invoices i
              WHERE i.supplier_id = s.id AND i.status = 'confirmed')            AS total_net,
            (SELECT MAX(COALESCE(i.issue_date, date(i.created_at))) FROM invoices i
              WHERE i.supplier_id = s.id AND i.status = 'confirmed')            AS last_invoice,
            (SELECT ROUND(COALESCE(SUM(i.total_net), 0), 2) FROM invoices i
              WHERE i.supplier_id = s.id AND i.status = 'confirmed'
                AND COALESCE(i.issue_date, date(i.created_at)) >= date('now', '-12 months'))
                                                                                AS spent_12m
     FROM suppliers s
     ORDER BY total_net DESC`,
  );
}

export function getSupplierTopMaterials(supplierId: number, limit = 25) {
  return all<{
    material_id: number;
    material_name: string;
    category: string;
    purchases: number;
    total_spent: number;
    last_price: number | null;
    unit: string | null;
  }>(
    `WITH pp AS (${PRICE_POINTS})
     SELECT pp.material_id, m.name AS material_name, m.category,
            COUNT(*) AS purchases,
            ROUND(SUM(pp.line_total), 2) AS total_spent,
            MAX(CASE WHEN pp.rn = 1 THEN pp.price END) AS last_price,
            MAX(CASE WHEN pp.rn = 1 THEN pp.unit END)  AS unit
     FROM pp JOIN materials m ON m.id = pp.material_id
     WHERE pp.supplier_id = ?
     GROUP BY pp.material_id
     ORDER BY total_spent DESC
     LIMIT ?`,
    [supplierId, limit],
  );
}

/* ------------------------------------------------------------------ */
/* Kalkulace                                                           */
/* ------------------------------------------------------------------ */

export function listCalculations() {
  return all<{ id: number; name: string; created_at: string; items: number; total: number }>(
    `SELECT c.id, c.name, c.created_at,
            (SELECT COUNT(*) FROM calculation_items ci WHERE ci.calculation_id = c.id) AS items,
            0 AS total
     FROM calculations c
     ORDER BY c.created_at DESC`,
  );
}

export function getCalculation(id: number) {
  return one<{ id: number; name: string; note: string | null; created_at: string }>(
    `SELECT id, name, note, created_at FROM calculations WHERE id = ?`,
    [id],
  );
}

/**
 * Položky kalkulace oceněné z obou cenových větví zvlášť.
 *
 * Nabídky se počítají jen dokud platí — prošlá nabídka není cena, se kterou
 * lze počítat zakázku.
 */
export function getCalculationItems(calculationId: number) {
  return all<{
    id: number;
    material_id: number | null;
    label: string;
    quantity: number;
    unit: string | null;
    best_invoiced: number | null;
    best_invoiced_supplier: string | null;
    last_invoiced_date: string | null;
    best_offered: number | null;
    best_offered_supplier: string | null;
    last_offered_date: string | null;
  }>(
    `WITH pp AS (${PRICE_POINTS}),
          latest AS (SELECT * FROM pp WHERE rn = 1),
          main AS (${MAIN_UNIT})
     SELECT ci.id, ci.material_id, ci.label, ci.quantity,
            COALESCE(
              (SELECT unit_key FROM main WHERE main.material_id = ci.material_id AND urn = 1),
              m.unit, ci.unit
            ) AS unit,
            (SELECT MIN(l.price) FROM latest l JOIN main ON main.material_id = l.material_id AND main.unit_key = l.unit_key AND main.urn = 1
              WHERE l.material_id = ci.material_id AND l.track = 'invoiced')  AS best_invoiced,
            (SELECT l.supplier_name FROM latest l JOIN main ON main.material_id = l.material_id AND main.unit_key = l.unit_key AND main.urn = 1
              WHERE l.material_id = ci.material_id AND l.track = 'invoiced'
              ORDER BY l.price ASC LIMIT 1)                                   AS best_invoiced_supplier,
            (SELECT MAX(l.price_date) FROM latest l
              WHERE l.material_id = ci.material_id AND l.track = 'invoiced')  AS last_invoiced_date,
            (SELECT MIN(l.price) FROM latest l JOIN main ON main.material_id = l.material_id AND main.unit_key = l.unit_key AND main.urn = 1
              WHERE l.material_id = ci.material_id AND l.track = 'offered'
                AND l.expired = 0)                                            AS best_offered,
            (SELECT l.supplier_name FROM latest l JOIN main ON main.material_id = l.material_id AND main.unit_key = l.unit_key AND main.urn = 1
              WHERE l.material_id = ci.material_id AND l.track = 'offered' AND l.expired = 0
              ORDER BY l.price ASC LIMIT 1)                                   AS best_offered_supplier,
            (SELECT MAX(l.price_date) FROM latest l
              WHERE l.material_id = ci.material_id AND l.track = 'offered')   AS last_offered_date
     FROM calculation_items ci
     LEFT JOIN materials m ON m.id = ci.material_id
     WHERE ci.calculation_id = ?
     ORDER BY ci.position, ci.id`,
    [calculationId],
  );
}
