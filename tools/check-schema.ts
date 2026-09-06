/**
 * Pojistka proti limitu Anthropic API: schéma pro čtení dokladů smí obsahovat
 * nejvýš 16 parametrů s union typem. Každé `.nullable()` jeden union vytvoří.
 * Spouští se přes `npm run check:schema`.
 */
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { InvoiceSchema } from "../src/lib/extract-schema";

const LIMIT = 16;

const json = JSON.stringify(zodOutputFormat(InvoiceSchema));
const unions =
  (json.match(/"anyOf"/g) ?? []).length + (json.match(/"type":\s*\[/g) ?? []).length;

if (unions > LIMIT) {
  console.error(
    `Schéma má ${unions} parametrů s union typem, API povolí ${LIMIT}. ` +
      `Ubertehle .nullable() — u textových polí použijte prázdný řetězec.`,
  );
  process.exit(1);
}
console.log(`Schéma OK: ${unions} union typů z povolených ${LIMIT}.`);
