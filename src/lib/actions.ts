"use server";

import { revalidatePath } from "next/cache";
import { one, run } from "@/db";
import { normalizeText } from "./normalize";
import { normalizeUnit } from "./units";
import { mergeMaterials, updateMaterial, upsertMaterial, upsertSupplier } from "./repo";
import { resolveUnitPrice } from "./ingest";

/* ------------------------------------------------------------------ */
/* Kontrola a potvrzení faktury                                        */
/* ------------------------------------------------------------------ */

export interface ItemDecision {
  id: number;
  isMaterial: boolean;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
  /** Existující materiál z katalogu, nebo null když se má založit nový. */
  materialId: number | null;
  /** Název pro nově zakládaný materiál (použije se jen když materialId je null). */
  newName: string | null;
  newCategory: string | null;
  newUnit: string | null;
}

export interface InvoiceHeaderInput {
  supplierName: string;
  docType: string;
  validUntil: string | null;
  invoiceNumber: string | null;
  issueDate: string | null;
  project: string | null;
  totalNet: number | null;
}

/**
 * Uloží uživatelem zkontrolovanou fakturu. Při `confirm` se položky propíší do
 * cenové databáze a zároveň se zapamatují aliasy, aby příště stejné texty
 * od stejného dodavatele naskočily samy.
 */
export async function saveInvoice(
  invoiceId: number,
  header: InvoiceHeaderInput,
  items: ItemDecision[],
  confirm: boolean,
) {
  const supplierId = header.supplierName.trim()
    ? await upsertSupplier({ name: header.supplierName })
    : null;

  await run(
    `UPDATE invoices SET supplier_id = ?, doc_type = ?, valid_until = ?, invoice_number = ?,
            issue_date = ?, project = ?, total_net = ?, status = ?, confirmed_at = ?
     WHERE id = ?`,
    [
      supplierId,
      header.docType,
      header.validUntil,
      header.invoiceNumber,
      header.issueDate,
      header.project,
      header.totalNet,
      confirm ? "confirmed" : "draft",
      confirm ? new Date().toISOString() : null,
      invoiceId,
    ],
  );

  for (const item of items) {
    let materialId = item.materialId;

    if (item.isMaterial && !materialId && item.newName?.trim()) {
      materialId = await upsertMaterial({
        name: item.newName,
        category: item.newCategory,
        unit: item.newUnit,
      });
    }
    if (!item.isMaterial) materialId = null;

    await run(
      `UPDATE invoice_items
         SET is_material = ?, quantity = ?, unit = ?, unit_price_net = ?, line_total_net = ?,
             material_id = ?, match_source = CASE WHEN ? IS NULL THEN match_source ELSE 'manual' END
       WHERE id = ? AND invoice_id = ?`,
      [
        item.isMaterial ? 1 : 0,
        item.quantity,
        item.unit,
        resolveUnitPrice(item.unitPrice, item.lineTotal, item.quantity),
        item.lineTotal,
        materialId,
        materialId,
        item.id,
        invoiceId,
      ],
    );

    // Zapamatuj si spárování, ať příště nemusí uživatel rozhodovat znovu.
    if (confirm && materialId && supplierId) {
      const row = await one<{ raw_normalized: string; catalog_code: string | null }>(
        `SELECT raw_normalized, catalog_code FROM invoice_items WHERE id = ?`,
        [item.id],
      );
      if (row) {
        await run(
          `INSERT INTO material_aliases (material_id, supplier_id, raw_normalized, catalog_code)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (supplier_id, raw_normalized)
           DO UPDATE SET material_id = excluded.material_id`,
          [materialId, supplierId, row.raw_normalized, row.catalog_code],
        );
      }
    }
  }

  revalidatePath("/");
  revalidatePath("/faktury");
  revalidatePath(`/faktury/${invoiceId}`);
  revalidatePath("/materialy");
  revalidatePath("/dodavatele");
}

export async function deleteInvoiceAction(invoiceId: number) {
  await run(`DELETE FROM invoices WHERE id = ?`, [invoiceId]);
  revalidatePath("/faktury");
  revalidatePath("/");
}

/**
 * Smaže víc dokladů najednou.
 *
 * Položky odejdou s dokladem (ON DELETE CASCADE), takže z cenové databáze zmizí
 * i ceny, které z nich pocházely. Materiály v katalogu ani naučené aliasy se
 * nemažou — ty zůstávají a hodí se při dalším nahrání.
 */
export async function deleteInvoicesAction(ids: number[]): Promise<number> {
  const clean = ids.filter((id) => Number.isInteger(id) && id > 0);
  if (clean.length === 0) return 0;

  const placeholders = clean.map(() => "?").join(", ");
  await run(`DELETE FROM invoices WHERE id IN (${placeholders})`, clean);
  revalidatePath("/faktury");
  revalidatePath("/materialy");
  revalidatePath("/");
  return clean.length;
}

export async function reopenInvoice(invoiceId: number) {
  await run(`UPDATE invoices SET status = 'draft', confirmed_at = NULL WHERE id = ?`, [invoiceId]);
  revalidatePath(`/faktury/${invoiceId}`);
  revalidatePath("/faktury");
}

/* ------------------------------------------------------------------ */
/* Katalog materiálů                                                   */
/* ------------------------------------------------------------------ */

export async function updateMaterialAction(
  id: number,
  input: { name: string; category: string; unit: string; note: string | null },
) {
  await updateMaterial(id, input);
  revalidatePath(`/materialy/${id}`);
  revalidatePath("/materialy");
}

export async function mergeMaterialsAction(fromId: number, intoId: number) {
  await mergeMaterials(fromId, intoId);
  revalidatePath("/materialy");
}

/* ------------------------------------------------------------------ */
/* Kalkulace                                                           */
/* ------------------------------------------------------------------ */

export async function createCalculation(name: string) {
  const res = await run(`INSERT INTO calculations (name) VALUES (?)`, [name.trim() || "Nová kalkulace"]);
  revalidatePath("/kalkulace");
  return res.lastInsertRowid!;
}

export async function addCalculationItem(
  calculationId: number,
  materialId: number,
  quantity: number,
) {
  const material = await one<{ name: string; unit: string }>(
    `SELECT name, unit FROM materials WHERE id = ?`,
    [materialId],
  );
  await run(
    `INSERT INTO calculation_items (calculation_id, material_id, label, quantity, unit, position)
     VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM calculation_items WHERE calculation_id = ?))`,
    [calculationId, materialId, material?.name ?? "Položka", quantity, material?.unit ?? null, calculationId],
  );
  revalidatePath(`/kalkulace/${calculationId}`);
}

export async function updateCalculationItem(id: number, quantity: number) {
  await run(`UPDATE calculation_items SET quantity = ? WHERE id = ?`, [quantity, id]);
  const row = await one<{ calculation_id: number }>(
    `SELECT calculation_id FROM calculation_items WHERE id = ?`,
    [id],
  );
  if (row) revalidatePath(`/kalkulace/${row.calculation_id}`);
}

export async function removeCalculationItem(id: number, calculationId: number) {
  await run(`DELETE FROM calculation_items WHERE id = ?`, [id]);
  revalidatePath(`/kalkulace/${calculationId}`);
}

export async function deleteCalculation(id: number) {
  await run(`DELETE FROM calculations WHERE id = ?`, [id]);
  revalidatePath("/kalkulace");
}
