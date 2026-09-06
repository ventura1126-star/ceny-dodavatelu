/**
 * Ukázková data — `npm run db:seed`.
 *
 * Slouží k tomu, abyste si aplikaci mohli osahat dřív, než do ní nahrajete
 * první skutečné faktury. Skript odmítne běžet, pokud už v databázi nějaké
 * faktury jsou, aby vám demo nezamíchalo reálné ceny.
 */
import { ensureSchema, one, run } from "./index";
import { normalizeText, extractDimensions } from "../lib/normalize";

const SUPPLIERS = [
  { name: "Dřevo Trust a.s.", ico: "25550322" },
  { name: "Pila Novák s.r.o.", ico: "27418899" },
  { name: "Stavebniny Pardubice s.r.o.", ico: "60793201" },
];

const MATERIALS = [
  { name: "KVH hranol smrk 60x120 C24", category: "Řezivo a KVH", unit: "bm", base: 118 },
  { name: "KVH hranol smrk 80x160 C24", category: "Řezivo a KVH", unit: "bm", base: 214 },
  { name: "Řezivo smrk hranol 100x100 nehoblované", category: "Řezivo a KVH", unit: "m3", base: 8400 },
  { name: "Palubka modřín sibiřský 19x121 A/B", category: "Palubky a obklady", unit: "m2", base: 742 },
  { name: "Fasádní profil modřín rhombus 20x68", category: "Fasádní profily", unit: "bm", base: 62 },
  { name: "OSB deska 3 broušená 2500x1250x15", category: "Deskové materiály", unit: "m2", base: 268 },
  { name: "Dřevovláknitá izolace 1200x600x100", category: "Izolace", unit: "m2", base: 349 },
  { name: "Parozábrana PE fólie 200 my", category: "Fólie a parozábrany", unit: "m2", base: 21 },
  { name: "Vrut do dřeva TX 5x70 pozink", category: "Spojovací materiál", unit: "bal", base: 389 },
  { name: "Úhelník kotevní 90x90x65x2,5", category: "Kotevní technika", unit: "ks", base: 24 },
  { name: "Lazura na dřevo Bondex 5 l ořech", category: "Nátěry a impregnace", unit: "l", base: 268 },
];

/** Pseudonáhoda se stálým semínkem — demo pak vypadá pokaždé stejně. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

async function main() {
  await ensureSchema();

  const existing = await one<{ count: number }>(`SELECT COUNT(*) AS count FROM invoices`);
  if ((existing?.count ?? 0) > 0) {
    console.error(
      "V databázi už jsou faktury — demo data se nevkládají, aby nezkreslila skutečné ceny.",
    );
    process.exit(1);
  }

  const random = makeRandom(20260906);

  const supplierIds: number[] = [];
  for (const supplier of SUPPLIERS) {
    const res = await run(
      `INSERT INTO suppliers (name, name_normalized, ico) VALUES (?, ?, ?)`,
      [supplier.name, normalizeText(supplier.name), supplier.ico],
    );
    supplierIds.push(res.lastInsertRowid!);
  }

  const materialIds: number[] = [];
  for (const material of MATERIALS) {
    const res = await run(
      `INSERT INTO materials (name, name_normalized, category, unit, dimensions) VALUES (?, ?, ?, ?, ?)`,
      [
        material.name,
        normalizeText(material.name),
        material.category,
        material.unit,
        extractDimensions(material.name),
      ],
    );
    materialIds.push(res.lastInsertRowid!);
  }

  // Osm měsíců nákupů: každý dodavatel vede jinou část sortimentu a má jinou
  // cenovou hladinu, ať je na čem ukázat srovnání i vývoj v čase.
  const months = ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
  const supplierBias = [1.0, 0.94, 1.08];
  let invoiceCounter = 1;

  for (let s = 0; s < supplierIds.length; s++) {
    for (const month of months) {
      const picks = MATERIALS.map((m, i) => ({ m, i }))
        .filter(() => random() > 0.45)
        .slice(0, 5);
      if (picks.length === 0) continue;

      const day = String(3 + Math.floor(random() * 22)).padStart(2, "0");
      // Poslední měsíc nesmí utéct do budoucnosti — demo by pak mělo faktury "napřed".
      const today = new Date().toISOString().slice(0, 10);
      const issueDate = `${month}-${day}` > today ? today : `${month}-${day}`;
      const drift = 1 + (months.indexOf(month) - 3) * 0.012 + (random() - 0.5) * 0.03;

      const lines = picks.map(({ m, i }, index) => {
        const quantity = Math.round((5 + random() * 120) * 10) / 10;
        const unitPrice = Math.round(m.base * supplierBias[s] * drift * 100) / 100;
        return {
          lineNo: index + 1,
          materialId: materialIds[i],
          description: m.name,
          unit: m.unit,
          quantity,
          unitPrice,
          lineTotal: Math.round(quantity * unitPrice * 100) / 100,
        };
      });

      const totalNet = Math.round(lines.reduce((a, l) => a + l.lineTotal, 0) * 100) / 100;
      const invoiceNumber = `${month.replace("-", "")}${String(invoiceCounter++).padStart(3, "0")}`;

      const invoice = await run(
        `INSERT INTO invoices
           (supplier_id, invoice_number, issue_date, currency, total_net, total_vat, total_gross,
            status, file_name, file_hash, confirmed_at)
         VALUES (?, ?, ?, 'CZK', ?, ?, ?, 'confirmed', ?, ?, datetime('now'))`,
        [
          supplierIds[s],
          invoiceNumber,
          issueDate,
          totalNet,
          Math.round(totalNet * 0.21 * 100) / 100,
          Math.round(totalNet * 1.21 * 100) / 100,
          `demo-${invoiceNumber}.pdf`,
          `demo-hash-${invoiceNumber}`,
        ],
      );

      for (const line of lines) {
        await run(
          `INSERT INTO invoice_items
             (invoice_id, line_no, raw_description, raw_normalized, quantity, unit,
              unit_price_net, line_total_net, vat_rate, material_id, match_source, is_material)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 21, ?, 'alias', 1)`,
          [
            invoice.lastInsertRowid!,
            line.lineNo,
            line.description,
            normalizeText(line.description),
            line.quantity,
            line.unit,
            line.unitPrice,
            line.lineTotal,
            line.materialId,
          ],
        );
      }

      // Doprava — schválně jako nemateriálový řádek, ať je vidět, že se do cen nepočítá.
      await run(
        `INSERT INTO invoice_items
           (invoice_id, line_no, raw_description, raw_normalized, quantity, unit,
            unit_price_net, line_total_net, vat_rate, is_material)
         VALUES (?, ?, 'Doprava na stavbu', 'doprava na stavbu', 1, 'ks', 1200, 1200, 21, 0)`,
        [invoice.lastInsertRowid!, lines.length + 1],
      );
    }
  }

  const counts = await one<{ invoices: number; items: number }>(
    `SELECT (SELECT COUNT(*) FROM invoices) AS invoices, (SELECT COUNT(*) FROM invoice_items) AS items`,
  );
  console.log(
    `Hotovo: ${SUPPLIERS.length} dodavatelů, ${MATERIALS.length} materiálů, ` +
      `${counts?.invoices} faktur, ${counts?.items} položek.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
