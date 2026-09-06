/** Ruční inicializace databáze: `npm run db:init` */
import { ensureSchema } from "./index";

ensureSchema()
  .then(() => {
    console.log("Databáze je připravená.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Inicializace selhala:", err);
    process.exit(1);
  });
