import fs from "node:fs";
import path from "node:path";

const typesPath = path.join(
  process.cwd(),
  "src/lib/integrations/supabase/types.ts",
);

const raw = fs.readFileSync(typesPath);
let content =
  raw[0] === 0xff && raw[1] === 0xfe
    ? raw.toString("utf16le")
    : raw.toString("utf8");
if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

content = content.replace(
  /      erp_credit_notes: \{[\s\S]*?foreignKeyName: "erp_credit_notes_store_id_fkey"/,
  `      erp_credit_notes: {
        Row: {
          attachment_url: string | null
          balance_remaining: number
          created_at: string
          created_by: string | null
          credit_note_date: string
          credit_note_number: string
          id: string
          inventory_committed: boolean
          notes: string | null
          reference: string | null
          source_invoice_id: string | null
          status: string
          store_id: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          attachment_url?: string | null
          balance_remaining?: number
          created_at?: string
          created_by?: string | null
          credit_note_date?: string
          credit_note_number: string
          id?: string
          inventory_committed?: boolean
          notes?: string | null
          reference?: string | null
          source_invoice_id?: string | null
          status?: string
          store_id: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          attachment_url?: string | null
          balance_remaining?: number
          created_at?: string
          created_by?: string | null
          credit_note_date?: string
          credit_note_number?: string
          id?: string
          inventory_committed?: boolean
          notes?: string | null
          reference?: string | null
          source_invoice_id?: string | null
          status?: string
          store_id?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_credit_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_credit_notes_source_invoice_id_fkey"
            columns: ["source_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_credit_notes_store_id_fkey"`,
);

content = content.replace(
  /      erp_expenses: \{[\s\S]*?foreignKeyName: "erp_expenses_created_by_fkey"/,
  `      erp_expenses: {
        Row: {
          account_id: string
          amount: number
          attachment_url: string | null
          billable_customer_id: string | null
          billed_invoice_id: string | null
          created_at: string
          created_by: string | null
          expense_date: string
          expense_number: string
          id: string
          is_billable: boolean
          notes: string | null
          paid_through_account_id: string | null
          reference: string | null
          store_id: string
          tax_amount: number
          tax_mode: string
          tax_percent: number
          total_amount: number
          updated_at: string
          user_id: string | null
          vendor_id: string | null
        }
        Insert: {
          account_id: string
          amount?: number
          attachment_url?: string | null
          billable_customer_id?: string | null
          billed_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          expense_date?: string
          expense_number: string
          id?: string
          is_billable?: boolean
          notes?: string | null
          paid_through_account_id?: string | null
          reference?: string | null
          store_id: string
          tax_amount?: number
          tax_mode?: string
          tax_percent?: number
          total_amount?: number
          updated_at?: string
          user_id?: string | null
          vendor_id?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          attachment_url?: string | null
          billable_customer_id?: string | null
          billed_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          expense_date?: string
          expense_number?: string
          id?: string
          is_billable?: boolean
          notes?: string | null
          paid_through_account_id?: string | null
          reference?: string | null
          store_id?: string
          tax_amount?: number
          tax_mode?: string
          tax_percent?: number
          total_amount?: number
          updated_at?: string
          user_id?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_expenses_billable_customer_id_fkey"
            columns: ["billable_customer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_expenses_billed_invoice_id_fkey"
            columns: ["billed_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_expenses_created_by_fkey"`,
);

const RECURRING_BLOCK = `      erp_recurring_schedules: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          frequency: string
          id: string
          is_active: boolean
          last_run_date: string | null
          name: string
          next_run_date: string
          payload: Json
          schedule_type: string
          store_id: string | null
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          frequency: string
          id?: string
          is_active?: boolean
          last_run_date?: string | null
          name: string
          next_run_date: string
          payload?: Json
          schedule_type: string
          store_id?: string | null
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_run_date?: string | null
          name?: string
          next_run_date?: string
          payload?: Json
          schedule_type?: string
          store_id?: string | null
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_recurring_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_recurring_schedules_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_recurring_schedules_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_recurring_schedules_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
`;

content = content.replace(
  "      erp_fixed_assets: {",
  `${RECURRING_BLOCK}      erp_fixed_assets: {`,
);

content = content.replace(
  `          p_opening_balance: number
          p_store_id: string
          p_updated_by?: string
        }
        Returns: undefined
      }
      user_has_store_access: {`,
  `          p_opening_balance: number
          p_store_id: string | null
          p_updated_by?: string
        }
        Returns: undefined
      }
      user_has_store_access: {`,
);

content = content.replace(
  /      erp_vendor_credits: \{[\s\S]*?vendor_id\?: string\n        \}\n        Relationships: \[/,
  `      erp_vendor_credits: {
        Row: {
          balance_remaining: number
          created_at: string
          created_by: string | null
          credit_date: string
          credit_number: string
          id: string
          inventory_committed: boolean
          notes: string | null
          reference: string | null
          source_bill_id: string | null
          status: string
          store_id: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          balance_remaining?: number
          created_at?: string
          created_by?: string | null
          credit_date?: string
          credit_number: string
          id?: string
          inventory_committed?: boolean
          notes?: string | null
          reference?: string | null
          source_bill_id?: string | null
          status?: string
          store_id: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          balance_remaining?: number
          created_at?: string
          created_by?: string | null
          credit_date?: string
          credit_number?: string
          id?: string
          inventory_committed?: boolean
          notes?: string | null
          reference?: string | null
          source_bill_id?: string | null
          status?: string
          store_id?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [`,
);

content = content.replace(
  `      invoices: {
        Row: {
          amount_paid: number
          balance_due: number`,
  `      invoices: {
        Row: {
          amount_paid: number
          attachment_url: string | null
          balance_due: number`,
);

content = content.replace(
  `        Insert: {
          amount_paid?: number
          balance_due?: number
          created_at?: string
          credits_applied?: number
          discount?: number
          due_date?: string | null
          estimate_id?: string | null
          gst_amount?: number
          gst_number?: string | null
          id?: string
          inventory_committed?: boolean
          invoice_number: string`,
  `        Insert: {
          amount_paid?: number
          attachment_url?: string | null
          balance_due?: number
          created_at?: string
          credits_applied?: number
          discount?: number
          due_date?: string | null
          estimate_id?: string | null
          gst_amount?: number
          gst_number?: string | null
          id?: string
          inventory_committed?: boolean
          invoice_number: string`,
);

content = content.replace(
  `        Update: {
          amount_paid?: number
          balance_due?: number
          created_at?: string
          credits_applied?: number
          discount?: number
          due_date?: string | null
          estimate_id?: string | null
          gst_amount?: number
          gst_number?: string | null
          id?: string
          inventory_committed?: boolean
          invoice_number?: string`,
  `        Update: {
          amount_paid?: number
          attachment_url?: string | null
          balance_due?: number
          created_at?: string
          credits_applied?: number
          discount?: number
          due_date?: string | null
          estimate_id?: string | null
          gst_amount?: number
          gst_number?: string | null
          id?: string
          inventory_committed?: boolean
          invoice_number?: string`,
);

content = content.replace(
  `            foreignKeyName: "invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      item_units: {`,
  `            foreignKeyName: "invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      item_units: {`,
);

content = content.replace(
  `          specs?: Json
          use_smart_pricing?: boolean
          variant_layout?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"`,
  `          specs?: Json
          updated_at?: string
          use_smart_pricing?: boolean
          variant_layout?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"`,
);

content = content.replaceAll(
  `          is_default: boolean
          markup_percent: number`,
  `          is_default: boolean
          logo_url: string | null
          markup_percent: number`,
);
content = content.replaceAll(
  `          is_default?: boolean
          markup_percent?: number
          name: string`,
  `          is_default?: boolean
          logo_url?: string | null
          markup_percent?: number
          name: string`,
);
content = content.replaceAll(
  `          is_default?: boolean
          markup_percent?: number
          name?: string`,
  `          is_default?: boolean
          logo_url?: string | null
          markup_percent?: number
          name?: string`,
);

content = content.replace(
  `      delete_erp_vat_payment: {`,
  `      delete_erp_credit_note: {
        Args: { p_actor?: string; p_credit_note_id: string }
        Returns: undefined
      }
      delete_erp_vat_payment: {`,
);
content = content.replace(
  `      delete_erp_vat_return: {`,
  `      delete_erp_vendor_credit: {
        Args: { p_actor?: string; p_credit_id: string }
        Returns: undefined
      }
      delete_erp_vat_return: {`,
);
content = content.replace(
  `      finalize_erp_purchase_bill: {`,
  `      finalize_erp_credit_note: {
        Args: {
          p_actor?: string
          p_credit_note_id: string
          p_restore_stock?: boolean
        }
        Returns: undefined
      }
      finalize_erp_purchase_bill: {`,
);
content = content.replace(
  `      generate_invoice_for_order: {`,
  `      finalize_erp_vendor_credit: {
        Args: {
          p_actor?: string
          p_credit_id: string
          p_reduce_stock?: boolean
        }
        Returns: undefined
      }
      generate_invoice_for_order: {`,
);
content = content.replace(
  `      place_customer_order: {`,
  `      peek_erp_document_number: {
        Args: { p_document_type: string }
        Returns: string
      }
      place_customer_order: {`,
);
content = content.replaceAll(
  `user_role: "admin" | "customer" | "vendor" | "delivery"`,
  `user_role: "admin" | "customer" | "vendor" | "delivery" | "manager"`,
);
content = content.replaceAll(
  `user_role: ["admin", "customer", "vendor", "delivery"]`,
  `user_role: ["admin", "customer", "vendor", "delivery", "manager"]`,
);

fs.writeFileSync(typesPath, content, "utf8");
console.log("Patched", typesPath, "as UTF-8");
