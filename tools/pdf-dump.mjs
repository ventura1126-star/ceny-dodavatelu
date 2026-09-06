/**
 * Nástroj pro vývoj šablon: vypíše z PDF textové položky i s jejich pozicí.
 * Použití: node tools/pdf-dump.mjs <soubor.pdf> [--lines]
 */
import fs from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const file = process.argv[2];
const asLines = process.argv.includes("--lines");

const doc = await getDocument({
  data: new Uint8Array(fs.readFileSync(file)),
  useSystemFonts: true,
}).promise;

console.log(`# ${file} — ${doc.numPages} stran`);

for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const content = await page.getTextContent();
  const items = content.items
    .filter((i) => "str" in i && i.str.trim())
    .map((i) => ({ x: Math.round(i.transform[4]), y: Math.round(i.transform[5]), s: i.str }));

  console.log(`\n===== STRANA ${p} — ${items.length} textových prvků =====`);
  if (items.length === 0) continue;

  if (asLines) {
    // Seskupí prvky se stejnou výškou do řádků — tak, jak je vidí člověk.
    const rows = new Map();
    for (const it of items) {
      const key = Math.round(it.y / 3) * 3;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(it);
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      const line = rows.get(y).sort((a, b) => a.x - b.x);
      console.log(`y=${String(y).padStart(4)} | ` + line.map((i) => `${i.s}`).join(" ⋮ "));
    }
  } else {
    for (const it of items) console.log(`x=${String(it.x).padStart(4)} y=${String(it.y).padStart(4)}  ${it.s}`);
  }
}
