import fs from "node:fs";
import path from "node:path";

const typesPath = path.join(
  process.cwd(),
  "src/lib/integrations/supabase/types.ts",
);

let content = fs.readFileSync(typesPath, "utf8");

if (!content.includes("erp_recurring_schedules")) {
  const block = `      erp_recurring_schedules: {
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
  content = content.replace("      erp_fixed_assets: {", `${block}      erp_fixed_assets: {`);
}

if (!content.includes("source_bill_id")) {
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
}

if (!content.includes("stores: {\n        Row: {\n          address_line1")) {
  throw new Error("stores anchor missing");
}

if (!content.includes("stores: {\n        Row: {\n          address_line1: string | null\n          address_line2")) {
  // already has logo_url maybe
}

if (
  !content.match(
    /stores: \{[\s\S]*?logo_url: string \| null[\s\S]*?Relationships:/,
  )
) {
  content = content.replace(
    `      stores: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          code: string | null
          company_id: string
          country: string | null
          created_at: string
          currency: string | null
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          markup_percent: number`,
    `      stores: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          code: string | null
          company_id: string
          country: string | null
          created_at: string
          currency: string | null
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          logo_url: string | null
          markup_percent: number`,
  );

  content = content.replace(
    `      stores: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          code: string | null
          company_id: string
          country: string | null
          created_at: string
          currency: string | null
          description: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          markup_percent?: number
          name: string`,
    `      stores: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          code: string | null
          company_id: string
          country: string | null
          created_at: string
          currency: string | null
          description: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          logo_url?: string | null
          markup_percent?: number
          name: string`,
  );
}

// stores Insert block (unique anchor)
content = content.replace(
  `        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          code?: string | null
          company_id: string
          country?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          markup_percent?: number
          name: string
          phone?: string | null
          pincode?: string | null
          state?: string | null
          store_type?: string | null
          tax_template?: string | null
          trn?: string | null
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          code?: string | null
          company_id?: string
          country?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          markup_percent?: number
          name?: string
          phone?: string | null
          pincode?: string | null
          state?: string | null
          store_type?: string | null
          tax_template?: string | null
          trn?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_company_id_fkey"`,
  `        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          code?: string | null
          company_id: string
          country?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          logo_url?: string | null
          markup_percent?: number
          name: string
          phone?: string | null
          pincode?: string | null
          state?: string | null
          store_type?: string | null
          tax_template?: string | null
          trn?: string | null
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          code?: string | null
          company_id?: string
          country?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          logo_url?: string | null
          markup_percent?: number
          name?: string
          phone?: string | null
          pincode?: string | null
          state?: string | null
          store_type?: string | null
          tax_template?: string | null
          trn?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_company_id_fkey"`,
);

content = content.replace(
  `      update_erp_account: {
        Args: {
          p_account_id: string
          p_code: string
          p_description: string
          p_is_active: boolean
          p_name: string
          p_opening_balance: number
          p_store_id: string
          p_updated_by?: string
        }
        Returns: undefined
      }`,
  `      update_erp_account: {
        Args: {
          p_account_id: string
          p_code: string
          p_description: string
          p_is_active: boolean
          p_name: string
          p_opening_balance: number
          p_store_id: string | null
          p_updated_by?: string
        }
        Returns: undefined
      }`,
);

if (
  !content.includes(
    "updated_at?: string\n          use_smart_pricing?: boolean\n          variant_layout?: string\n        }\n        Relationships: [\n          {\n            foreignKeyName: \"products_brand_id_fkey\"",
  )
) {
  content = content.replace(
    "          specs?: Json\n          use_smart_pricing?: boolean\n          variant_layout?: string\n        }\n        Relationships: [\n          {\n            foreignKeyName: \"products_brand_id_fkey\"",
    "          specs?: Json\n          updated_at?: string\n          use_smart_pricing?: boolean\n          variant_layout?: string\n        }\n        Relationships: [\n          {\n            foreignKeyName: \"products_brand_id_fkey\"",
  );
}

fs.writeFileSync(typesPath, content, "utf8");
console.log("Extra patches applied");
