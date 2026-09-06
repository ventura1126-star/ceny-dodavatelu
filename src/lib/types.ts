export interface Supplier {
  id: number;
  name: string;
  ico: string | null;
  dic: string | null;
  address: string | null;
  note: string | null;
  created_at: string;
}

export interface Material {
  id: number;
  name: string;
  name_normalized: string;
  category: string;
  unit: string;
  dimensions: string | null;
  quality: string | null;
  note: string | null;
}

export interface Invoice {
  id: number;
  supplier_id: number | null;
  supplier_name: string | null;
  invoice_number: string | null;
  variable_symbol: string | null;
  issue_date: string | null;
  taxable_date: string | null;
  due_date: string | null;
  currency: string;
  total_net: number | null;
  total_vat: number | null;
  total_gross: number | null;
  status: "draft" | "confirmed";
  project: string | null;
  file_name: string | null;
  extraction_warnings: string | null;
  created_at: string;
  confirmed_at: string | null;
}

export interface InvoiceItem {
  id: number;
  invoice_id: number;
  line_no: number;
  raw_description: string;
  raw_normalized: string;
  catalog_code: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price_net: number | null;
  discount_pct: number | null;
  line_total_net: number | null;
  vat_rate: number | null;
  material_id: number | null;
  material_name: string | null;
  suggested_material_id: number | null;
  suggested_name: string | null;
  suggested_category: string | null;
  suggested_unit: string | null;
  match_confidence: number | null;
  match_source: string | null;
  is_material: number;
  note: string | null;
}

/** Řádek přehledu „kdo nám tenhle materiál prodává a za kolik". */
export interface SupplierPrice {
  supplier_id: number;
  supplier_name: string;
  unit: string | null;
  last_price: number | null;
  last_date: string | null;
  last_invoice_id: number;
  min_price: number;
  max_price: number;
  avg_price: number;
  purchases: number;
  total_spent: number;
  total_quantity: number;
}

export interface MaterialSummary {
  id: number;
  name: string;
  category: string;
  unit: string;
  suppliers: number;
  purchases: number;
  last_price: number | null;
  last_date: string | null;
  best_price: number | null;
  best_supplier: string | null;
  total_spent: number;
}
