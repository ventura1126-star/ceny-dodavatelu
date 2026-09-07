import "server-only";

import { createHash } from "node:crypto";
import { one, run } from "@/db";
import { extractInvoice } from "./extract";
import { loadCatalog, matchMaterial } from "./matching";
import { looksLikeNonMaterial, normalizeText } from "./normalize";
import { normalizeUnit } from "./units";
import { upsertSupplier } from "./repo";

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
export function blank(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Dopočítá jednotkovou cenu, když ji faktura uvádí jen jako součet za řádek. */
export function resolveUnitPrice(
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
/**
 * Zpracuje JEDEN nahraný doklad.
 *
 * Schválně po jednom: Vercel má na Hobby plánu strop 4,5 MB na požadavek
 * a omezenou dobu běhu funkce, zatímco čtení jednoho dokladu trvá i půl minuty.
 * Dávka poslaná najednou by oba limity přetekla.
 */
export async function processDocument(file: File): Promise<UploadOutcome> {
  {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const hash = createHash("sha256").update(buffer).digest("hex");

      const duplicate = await one<{ id: number }>(`SELECT id FROM invoices WHERE file_hash = ?`, [
        hash,
      ]);
      if (duplicate) {
        return {
          fileName: file.name,
          ok: false,
          invoiceId: duplicate.id,
          message: "Tenhle doklad už v systému máte — soubor je totožný.",
        };
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

      return {
        fileName: file.name,
        ok: true,
        invoiceId,
        itemCount: data.items.length,
        message: `Vytěženo ${data.items.length} položek.`,
      };
    } catch (err) {
      return {
        fileName: file.name,
        ok: false,
        message: err instanceof Error ? err.message : "Neznámá chyba při zpracování.",
      };
    }
  }
}

