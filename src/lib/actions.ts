"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { one, run } from "@/db";
import { extractInvoice } from "./extract";
import { loadCatalog, matchMaterial } from "./matching";
import { looksLikeNonMaterial, normalizeText } from "./normalize";
import { normalizeUnit } from "./units";
import { mergeMaterials, updateMaterial, upsertMaterial, upsertSupplier } from "./repo";

/* ------------------------------------------------------------------ */
/* Nahrání a vytěžení faktur                                           */
/* ------------------------------------------------------------------ */

export interface UploadOutcome {
  fileName: string;
  ok: boolean;
  invoiceId?: number;
  message: string;
  itemCount?: number;
}

/**
 * Model vrací prázdný řetězec tam, kde údaj na dokladu není — schéma nesmí mít
 * víc než 16 volitelných polí, takže se textová pole neposílají jako nullable.
 * Do databáze ale patří null, ne prázdný text.
 */
function blank(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Dopočítá jednotkovou cenu, když ji faktura uvádí jen jako součet za řádek. */
function resolveUnitPrice(
  unitPrice: number | null,
  lineTotal: number | null,
  quantity: number | null,
): number | null {
  if (unitPrice !== null && unitPrice > 0) return Math.round(unitPrice * 10000) / 10000;
  if (lineTotal !== null && quantity !== null && quantity !== 0) {
    return Math.round((lineTotal / quantity) * 10000) / 10000;
  }
  return null;
}

/**
 * Zpracuje nahraná PDF: vytěží je přes Claude, uloží jako rozpracované faktury
 * a u každé položky navrhne materiál z katalogu. Nic se do cenové databáze
 * nedostane dřív, než fakturu uživatel potvrdí.
 */
export async function uploadInvoices(formData: FormData): Promise<UploadOutcome[]> {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const outcomes: UploadOutcome[] = [];

  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const hash = createHash("sha256").update(buffer).digest("hex");

      const duplicate = await one<{ id: number }>(`SELECT id FROM invoices WHERE file_hash = ?`, [
        hash,
      ]);
      if (duplicate) {
        outcomes.push({
          fileName: file.name,
          ok: false,
          invoiceId: duplicate.id,
          message: "Tuhle fakturu už v systému máte — soubor je totožný.",
        });
        continue;
      }

      const { data, model } = await extractInvoice(buffer, file.name);
      const supplierId = data.supplier_name
        ? await upsertSupplier({
            name: data.supplier_name,
            ico: blank(data.supplier_ico),
            dic: blank(data.supplier_dic),
            address: blank(data.supplier_address),
          })
        : null;

      const invoice = await run(
        `INSERT INTO invoices
           (supplier_id, doc_type, valid_until, invoice_number, variable_symbol, issue_date,
            taxable_date, due_date, currency, total_net, total_vat, total_gross, status,
            file_name, file_hash, extraction_model, extraction_raw, extraction_warnings)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
        [
          supplierId,
          data.doc_type,
          blank(data.valid_until),
          blank(data.invoice_number),
          blank(data.variable_symbol),
          blank(data.issue_date),
          blank(data.taxable_date),
          blank(data.due_date),
          data.currency || "CZK",
          data.total_net,
          data.total_vat,
          data.total_gross,
          file.name,
          hash,
          model,
          JSON.stringify(data),
          JSON.stringify(data.warnings ?? []),
        ],
      );
      const invoiceId = invoice.lastInsertRowid!;

      await run(`INSERT INTO invoice_files (invoice_id, mime, size, data) VALUES (?, ?, ?, ?)`, [
        invoiceId,
        file.type || "application/pdf",
        buffer.byteLength,
        buffer,
      ]);

      const catalog = await loadCatalog();
      for (const item of data.items) {
        const isMaterial = item.is_material && !looksLikeNonMaterial(item.description);
        const match = isMaterial
          ? await matchMaterial(
              supplierId,
              item.description,
              item.material_name,
              blank(item.catalog_code),
              catalog,
            )
          : { materialId: null, confidence: 0, source: "none" as const };

        await run(
          `INSERT INTO invoice_items
             (invoice_id, line_no, raw_description, raw_normalized, catalog_code, quantity, unit,
              unit_price_net, discount_pct, line_total_net, vat_rate, material_id,
              suggested_material_id, suggested_name, suggested_category, suggested_unit,
              match_confidence, match_source, is_material)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            invoiceId,
            item.line_no,
            item.description,
            normalizeText(item.description),
            blank(item.catalog_code),
            item.quantity,
            normalizeUnit(item.unit) ?? blank(item.unit),
            resolveUnitPrice(item.unit_price_net, item.line_total_net, item.quantity),
            item.discount_pct,
            item.line_total_net,
            item.vat_rate,
            // Alias je jistota — ten se propíše rovnou. Fuzzy shoda je jen návrh.
            match.source === "alias" ? match.materialId : null,
            match.materialId,
            item.material_name,
            item.category,
            item.canonical_unit,
            match.confidence,
            match.source,
            isMaterial ? 1 : 0,
          ],
        );
      }

      outcomes.push({
        fileName: file.name,
        ok: true,
        invoiceId,
        itemCount: data.items.length,
        message: `Vytěženo ${data.items.length} položek.`,
      });
    } catch (err) {
      outcomes.push({
        fileName: file.name,
        ok: false,
        message: err instanceof Error ? err.message : "Neznámá chyba při zpracování.",
      });
    }
  }

  revalidatePath("/faktury");
  revalidatePath("/");
  return outcomes;
}

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
