/**
 * Schéma databáze jako idempotentní DDL.
 *
 * Záměrně je to čisté SQL spouštěné při startu aplikace: databáze je libSQL,
 * takže stejný soubor funguje lokálně (file:./data/ceny.db) i na Turso, a při
 * nasazení není potřeba zvlášť pouštět migrace.
 */
export const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS suppliers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    name_normalized TEXT NOT NULL UNIQUE,
    ico             TEXT,
    dic             TEXT,
    address         TEXT,
    note            TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS materials (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    name_normalized TEXT NOT NULL UNIQUE,
    category        TEXT NOT NULL DEFAULT 'Ostatní',
    unit            TEXT NOT NULL DEFAULT 'ks',
    dimensions      TEXT,
    quality         TEXT,
    note            TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS material_aliases (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id     INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    supplier_id     INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    raw_normalized  TEXT NOT NULL,
    catalog_code    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (supplier_id, raw_normalized)
  )`,

  // Tabulka se historicky jmenuje `invoices`, ale drží všechny typy dokladů —
  // faktury, cenové nabídky, potvrzení objednávek i dodací listy. Rozlišuje je
  // sloupec doc_type; nabídkové a fakturované ceny se nikde nemíchají.
  `CREATE TABLE IF NOT EXISTS invoices (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id         INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    doc_type            TEXT NOT NULL DEFAULT 'faktura',
    valid_until         TEXT,
    invoice_number      TEXT,
    variable_symbol     TEXT,
    issue_date          TEXT,
    taxable_date        TEXT,
    due_date            TEXT,
    currency            TEXT NOT NULL DEFAULT 'CZK',
    total_net           REAL,
    total_vat           REAL,
    total_gross         REAL,
    status              TEXT NOT NULL DEFAULT 'draft',
    project             TEXT,
    file_name           TEXT,
    file_hash           TEXT UNIQUE,
    extraction_model    TEXT,
    extraction_raw      TEXT,
    extraction_warnings TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    confirmed_at        TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS invoice_files (
    invoice_id  INTEGER PRIMARY KEY REFERENCES invoices(id) ON DELETE CASCADE,
    mime        TEXT NOT NULL,
    size        INTEGER NOT NULL,
    data        BLOB NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS invoice_items (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id            INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    line_no               INTEGER NOT NULL,
    raw_description       TEXT NOT NULL,
    raw_normalized        TEXT NOT NULL,
    catalog_code          TEXT,
    quantity              REAL,
    unit                  TEXT,
    unit_price_net        REAL,
    discount_pct          REAL,
    line_total_net        REAL,
    vat_rate              REAL,
    material_id           INTEGER REFERENCES materials(id) ON DELETE SET NULL,
    suggested_material_id INTEGER,
    suggested_name        TEXT,
    suggested_category    TEXT,
    suggested_unit        TEXT,
    match_confidence      REAL,
    match_source          TEXT,
    is_material           INTEGER NOT NULL DEFAULT 1,
    note                  TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS calculations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    note        TEXT,
    margin_pct  REAL NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS calculation_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    calculation_id  INTEGER NOT NULL REFERENCES calculations(id) ON DELETE CASCADE,
    material_id     INTEGER REFERENCES materials(id) ON DELETE SET NULL,
    label           TEXT NOT NULL,
    quantity        REAL NOT NULL DEFAULT 0,
    unit            TEXT,
    price_mode      TEXT NOT NULL DEFAULT 'best',
    unit_price      REAL,
    supplier_id     INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    position        INTEGER NOT NULL DEFAULT 0
  )`,

  `CREATE INDEX IF NOT EXISTS idx_items_invoice   ON invoice_items (invoice_id)`,
  `CREATE INDEX IF NOT EXISTS idx_items_material  ON invoice_items (material_id)`,
  `CREATE INDEX IF NOT EXISTS idx_items_norm      ON invoice_items (raw_normalized)`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_supp   ON invoices (supplier_id, issue_date)`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status)`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_type   ON invoices (doc_type)`,
  `CREATE INDEX IF NOT EXISTS idx_alias_lookup    ON material_aliases (supplier_id, raw_normalized)`,
  `CREATE INDEX IF NOT EXISTS idx_materials_cat   ON materials (category)`,
];

/**
 * Sloupce doplňované do databází, které vznikly dřív, než přibyly typy dokladů.
 * `CREATE TABLE IF NOT EXISTS` existující tabulku nezmění, proto tenhle seznam.
 */
export const COLUMN_MIGRATIONS: { table: string; column: string; definition: string }[] = [
  { table: "invoices", column: "doc_type", definition: "TEXT NOT NULL DEFAULT 'faktura'" },
  { table: "invoices", column: "valid_until", definition: "TEXT" },
  { table: "calculation_items", column: "price_source", definition: "TEXT" },
];
