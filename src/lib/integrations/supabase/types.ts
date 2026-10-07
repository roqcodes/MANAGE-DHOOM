export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_types: {
        Row: {
          account_category: string
          created_at: string
          description: string
          id: string
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          account_category: string
          created_at?: string
          description?: string
          id?: string
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          account_category?: string
          created_at?: string
          description?: string
          id?: string
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      accounts: {
        Row: {
          account_type_id: string
          code: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          is_locked: boolean
          is_system: boolean
          name: string
          opening_balance: number
          store_id: string | null
          updated_at: string
        }
        Insert: {
          account_type_id: string
          code: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          name: string
          opening_balance?: number
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          account_type_id?: string
          code?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          name?: string
          opening_balance?: number
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_account_type_id_fkey"
            columns: ["account_type_id"]
            isOneToOne: false
            referencedRelation: "account_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      addresses: {
        Row: {
          address_line: string | null
          city: string | null
          created_at: string
          id: string
          is_default: boolean
          label: string
          latitude: number | null
          line1: string
          line2: string | null
          longitude: number | null
          phone: string
          pincode: string | null
          state: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address_line?: string | null
          city?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          latitude?: number | null
          line1?: string
          line2?: string | null
          longitude?: number | null
          phone?: string
          pincode?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address_line?: string | null
          city?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          latitude?: number | null
          line1?: string
          line2?: string | null
          longitude?: number | null
          phone?: string
          pincode?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "addresses_user_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          allow_negative_store_stock: boolean
          capture_payments: boolean
          country_code: string
          country_name: string
          currency_code: string
          currency_symbol: string
          default_company_id: string | null
          default_store_id: string | null
          id: number
          locale: string
          show_mrp: boolean
          updated_at: string | null
        }
        Insert: {
          allow_negative_store_stock?: boolean
          capture_payments?: boolean
          country_code?: string
          country_name?: string
          currency_code?: string
          currency_symbol?: string
          default_company_id?: string | null
          default_store_id?: string | null
          id?: number
          locale?: string
          show_mrp?: boolean
          updated_at?: string | null
        }
        Update: {
          allow_negative_store_stock?: boolean
          capture_payments?: boolean
          country_code?: string
          country_name?: string
          currency_code?: string
          currency_symbol?: string
          default_company_id?: string | null
          default_store_id?: string | null
          id?: number
          locale?: string
          show_mrp?: boolean
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_default_company_id_fkey"
            columns: ["default_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_settings_default_store_id_fkey"
            columns: ["default_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string | null
          created_at: string
          description: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
          new_data: Json | null
          old_data: Json | null
          store_id: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          new_data?: Json | null
          old_data?: Json | null
          store_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          new_data?: Json | null
          old_data?: Json | null
          store_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          logo_url: string | null
          name: string
          slug: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          logo_url?: string | null
          name: string
          slug?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          logo_url?: string | null
          name?: string
          slug?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          cart_id: string | null
          created_at: string
          id: string
          quantity: number | null
          variant_id: string | null
        }
        Insert: {
          cart_id?: string | null
          created_at?: string
          id?: string
          quantity?: number | null
          variant_id?: string | null
        }
        Update: {
          cart_id?: string | null
          created_at?: string
          id?: string
          quantity?: number | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variant_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_reach: {
        Row: {
          first_carted_at: string
          product_id: string | null
          quantity: number
          user_id: string
          value_amount: number
          variant_id: string
        }
        Insert: {
          first_carted_at?: string
          product_id?: string | null
          quantity?: number
          user_id: string
          value_amount?: number
          variant_id: string
        }
        Update: {
          first_carted_at?: string
          product_id?: string | null
          quantity?: number
          user_id?: string
          value_amount?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_reach_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_reach_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carts_user_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string | null
          parent_id: string | null
          slug: string | null
          sort_order: number
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string | null
          parent_id?: string | null
          slug?: string | null
          sort_order?: number
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string | null
          parent_id?: string | null
          slug?: string | null
          sort_order?: number
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          legal_name: string | null
          name: string
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          legal_name?: string | null
          name: string
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          legal_name?: string | null
          name?: string
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customer_credit_limits: {
        Row: {
          created_at: string | null
          credit_limit: number
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          credit_limit?: number
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          credit_limit?: number
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      erp_account_transactions: {
        Row: {
          account_id: string
          counter_account_id: string | null
          created_at: string
          created_by: string | null
          credit_amount: number
          debit_amount: number
          details: string
          id: string
          journal_entry_id: string | null
          payment_type: string | null
          reference: string | null
          running_balance: number | null
          store_id: string | null
          transaction_date: string
          transaction_number: string
          transaction_type: string
          updated_at: string
        }
        Insert: {
          account_id: string
          counter_account_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_amount?: number
          debit_amount?: number
          details?: string
          id?: string
          journal_entry_id?: string | null
          payment_type?: string | null
          reference?: string | null
          running_balance?: number | null
          store_id?: string | null
          transaction_date?: string
          transaction_number: string
          transaction_type: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          counter_account_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_amount?: number
          debit_amount?: number
          details?: string
          id?: string
          journal_entry_id?: string | null
          payment_type?: string | null
          reference?: string | null
          running_balance?: number | null
          store_id?: string | null
          transaction_date?: string
          transaction_number?: string
          transaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_account_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_account_transactions_counter_account_id_fkey"
            columns: ["counter_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_account_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_account_transactions_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_account_transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_credit_note_applications: {
        Row: {
          amount: number
          credit_note_id: string
          id: string
          invoice_id: string
        }
        Insert: {
          amount: number
          credit_note_id: string
          id?: string
          invoice_id: string
        }
        Update: {
          amount?: number
          credit_note_id?: string
          id?: string
          invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_credit_note_applications_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "erp_credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_credit_note_applications_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_credit_note_lines: {
        Row: {
          credit_note_id: string
          id: string
          line_total: number
          product_id: string | null
          product_name: string
          quantity: number
          tax_amount: number
          tax_rate_percent: number
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          credit_note_id: string
          id?: string
          line_total?: number
          product_id?: string | null
          product_name: string
          quantity?: number
          tax_amount?: number
          tax_rate_percent?: number
          unit_price?: number
          variant_id?: string | null
        }
        Update: {
          credit_note_id?: string
          id?: string
          line_total?: number
          product_id?: string | null
          product_name?: string
          quantity?: number
          tax_amount?: number
          tax_rate_percent?: number
          unit_price?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_credit_note_lines_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "erp_credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_credit_note_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_credit_notes: {
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
            foreignKeyName: "erp_credit_notes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_credit_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_customer_payments: {
        Row: {
          account_id: string | null
          created_at: string
          created_by: string | null
          customer_count: number
          id: string
          invoices_count: number
          is_bulk: boolean
          notes: string | null
          payment_date: string
          payment_mode: string
          payment_number: string
          reference: string | null
          store_id: string
          total_amount: number
          unallocated_amount: number
          user_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_count?: number
          id?: string
          invoices_count?: number
          is_bulk?: boolean
          notes?: string | null
          payment_date?: string
          payment_mode: string
          payment_number: string
          reference?: string | null
          store_id: string
          total_amount: number
          unallocated_amount?: number
          user_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_count?: number
          id?: string
          invoices_count?: number
          is_bulk?: boolean
          notes?: string | null
          payment_date?: string
          payment_mode?: string
          payment_number?: string
          reference?: string | null
          store_id?: string
          total_amount?: number
          unallocated_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_customer_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_customer_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_customer_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_customer_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_document_sequences: {
        Row: {
          document_type: string
          next_number: number
          padding: number
          prefix: string
          updated_at: string
        }
        Insert: {
          document_type: string
          next_number?: number
          padding?: number
          prefix?: string
          updated_at?: string
        }
        Update: {
          document_type?: string
          next_number?: number
          padding?: number
          prefix?: string
          updated_at?: string
        }
        Relationships: []
      }
      erp_estimate_lines: {
        Row: {
          description: string | null
          estimate_id: string
          id: string
          line_total: number
          product_id: string | null
          product_name: string
          quantity: number
          tax_amount: number
          tax_rate_percent: number
          unit_id: string | null
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          description?: string | null
          estimate_id: string
          id?: string
          line_total?: number
          product_id?: string | null
          product_name: string
          quantity?: number
          tax_amount?: number
          tax_rate_percent?: number
          unit_id?: string | null
          unit_price?: number
          variant_id?: string | null
        }
        Update: {
          description?: string | null
          estimate_id?: string
          id?: string
          line_total?: number
          product_id?: string | null
          product_name?: string
          quantity?: number
          tax_amount?: number
          tax_rate_percent?: number
          unit_id?: string | null
          unit_price?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_estimate_lines_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "erp_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_estimate_lines_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "item_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_estimate_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_estimates: {
        Row: {
          converted_invoice_id: string | null
          created_at: string
          created_by: string | null
          discount: number
          estimate_date: string
          estimate_number: string
          id: string
          notes: string | null
          reference: string | null
          sales_person_id: string | null
          status: string
          store_id: string
          subtotal: number
          tax_amount: number
          tax_inclusive: boolean
          total_amount: number
          updated_at: string
          user_id: string
          valid_until: string | null
        }
        Insert: {
          converted_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          discount?: number
          estimate_date?: string
          estimate_number: string
          id?: string
          notes?: string | null
          reference?: string | null
          sales_person_id?: string | null
          status?: string
          store_id: string
          subtotal?: number
          tax_amount?: number
          tax_inclusive?: boolean
          total_amount?: number
          updated_at?: string
          user_id: string
          valid_until?: string | null
        }
        Update: {
          converted_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          discount?: number
          estimate_date?: string
          estimate_number?: string
          id?: string
          notes?: string | null
          reference?: string | null
          sales_person_id?: string | null
          status?: string
          store_id?: string
          subtotal?: number
          tax_amount?: number
          tax_inclusive?: boolean
          total_amount?: number
          updated_at?: string
          user_id?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_estimates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_estimates_sales_person_id_fkey"
            columns: ["sales_person_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_estimates_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_estimates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_employee_ledger: {
        Row: {
          balance_after: number
          created_at: string
          description: string
          employee_id: string
          entry_date: string
          entry_type: string
          id: string
          payment_debit: number
          salary_credit: number
          source_entity_id: string | null
          source_entity_type: string | null
          store_id: string
        }
        Insert: {
          balance_after?: number
          created_at?: string
          description?: string
          employee_id: string
          entry_date?: string
          entry_type: string
          id?: string
          payment_debit?: number
          salary_credit?: number
          source_entity_id?: string | null
          source_entity_type?: string | null
          store_id: string
        }
        Update: {
          balance_after?: number
          created_at?: string
          description?: string
          employee_id?: string
          entry_date?: string
          entry_type?: string
          id?: string
          payment_debit?: number
          salary_credit?: number
          source_entity_id?: string | null
          source_entity_type?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_employee_ledger_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "erp_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_employee_ledger_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_employee_opening_balance_batches: {
        Row: {
          batch_number: string
          created_at: string
          created_by: string | null
          entry_date: string
          id: string
          notes: string | null
          store_id: string
          total_amount: number
        }
        Insert: {
          batch_number: string
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          notes?: string | null
          store_id: string
          total_amount?: number
        }
        Update: {
          batch_number?: string
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          notes?: string | null
          store_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_employee_opening_balance_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_employee_opening_balance_batches_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_employee_opening_balance_lines: {
        Row: {
          batch_id: string
          employee_id: string
          id: string
          joining_date: string | null
          opening_balance: number
        }
        Insert: {
          batch_id: string
          employee_id: string
          id?: string
          joining_date?: string | null
          opening_balance?: number
        }
        Update: {
          batch_id?: string
          employee_id?: string
          id?: string
          joining_date?: string | null
          opening_balance?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_employee_opening_balance_lines_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "erp_employee_opening_balance_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_employee_opening_balance_lines_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "erp_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_employees: {
        Row: {
          advance_balance: number
          allowance: number
          basic_salary: number
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          discontinuation_date: string | null
          employee_code: string | null
          employee_number: string
          full_name: string
          id: string
          id_expiry_date: string | null
          id_number: string | null
          is_active: boolean
          joining_date: string
          mobile: string
          net_salary: number
          notes: string | null
          salary_balance: number
          store_id: string
          updated_at: string
        }
        Insert: {
          advance_balance?: number
          allowance?: number
          basic_salary?: number
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          discontinuation_date?: string | null
          employee_code?: string | null
          employee_number: string
          full_name: string
          id?: string
          id_expiry_date?: string | null
          id_number?: string | null
          is_active?: boolean
          joining_date?: string
          mobile?: string
          net_salary?: number
          notes?: string | null
          salary_balance?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          advance_balance?: number
          allowance?: number
          basic_salary?: number
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          discontinuation_date?: string | null
          employee_code?: string | null
          employee_number?: string
          full_name?: string
          id?: string
          id_expiry_date?: string | null
          id_number?: string | null
          is_active?: boolean
          joining_date?: string
          mobile?: string
          net_salary?: number
          notes?: string | null
          salary_balance?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_employees_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_employees_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_pay_slips: {
        Row: {
          allowance: number
          basic_salary: number
          created_at: string
          created_by: string | null
          days_count: number
          employee_id: string
          from_date: string
          id: string
          journal_entry_id: string | null
          ledger_entry_id: string | null
          net_salary: number
          payslip_number: string
          period_label: string
          period_month: number
          period_year: number
          store_id: string
          to_date: string
        }
        Insert: {
          allowance?: number
          basic_salary?: number
          created_at?: string
          created_by?: string | null
          days_count?: number
          employee_id: string
          from_date: string
          id?: string
          journal_entry_id?: string | null
          ledger_entry_id?: string | null
          net_salary?: number
          payslip_number: string
          period_label?: string
          period_month: number
          period_year: number
          store_id: string
          to_date: string
        }
        Update: {
          allowance?: number
          basic_salary?: number
          created_at?: string
          created_by?: string | null
          days_count?: number
          employee_id?: string
          from_date?: string
          id?: string
          journal_entry_id?: string | null
          ledger_entry_id?: string | null
          net_salary?: number
          payslip_number?: string
          period_label?: string
          period_month?: number
          period_year?: number
          store_id?: string
          to_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_pay_slips_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_pay_slips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "erp_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_pay_slips_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_pay_slips_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "erp_employee_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_pay_slips_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_salary_bulk_payments: {
        Row: {
          bulk_number: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          paid_through_account_id: string | null
          payment_date: string
          payment_mode: string
          reference: string | null
          store_id: string
          total_amount: number
        }
        Insert: {
          bulk_number: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_through_account_id?: string | null
          payment_date?: string
          payment_mode?: string
          reference?: string | null
          store_id: string
          total_amount?: number
        }
        Update: {
          bulk_number?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_through_account_id?: string | null
          payment_date?: string
          payment_mode?: string
          reference?: string | null
          store_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_salary_bulk_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_salary_bulk_payments_paid_through_account_id_fkey"
            columns: ["paid_through_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_salary_bulk_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_salary_payments: {
        Row: {
          advance_balance_after: number
          advance_payment_amount: number
          advance_recovery_amount: number
          bulk_payment_id: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          notes: string | null
          paid_through_account_id: string | null
          payment_date: string
          payment_mode: string
          payment_number: string
          salary_payment_amount: number
          store_id: string
          total_paid_amount: number
        }
        Insert: {
          advance_balance_after?: number
          advance_payment_amount?: number
          advance_recovery_amount?: number
          bulk_payment_id?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          notes?: string | null
          paid_through_account_id?: string | null
          payment_date?: string
          payment_mode?: string
          payment_number: string
          salary_payment_amount?: number
          store_id: string
          total_paid_amount?: number
        }
        Update: {
          advance_balance_after?: number
          advance_payment_amount?: number
          advance_recovery_amount?: number
          bulk_payment_id?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          notes?: string | null
          paid_through_account_id?: string | null
          payment_date?: string
          payment_mode?: string
          payment_number?: string
          salary_payment_amount?: number
          store_id?: string
          total_paid_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_salary_payments_bulk_payment_id_fkey"
            columns: ["bulk_payment_id"]
            isOneToOne: false
            referencedRelation: "erp_salary_bulk_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_salary_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_salary_payments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "erp_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_salary_payments_paid_through_account_id_fkey"
            columns: ["paid_through_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_salary_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_expenses: {
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
            foreignKeyName: "erp_expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_expenses_paid_through_account_id_fkey"
            columns: ["paid_through_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_expenses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_expenses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_expenses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_recurring_schedules: {
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
      erp_fixed_assets: {
        Row: {
          asset_number: string
          brand: string | null
          created_at: string
          created_by: string | null
          details: string | null
          id: string
          journal_entry_id: string | null
          maintenance_info: string | null
          name: string
          paid_through_account_id: string | null
          purchase_amount: number
          purchase_date: string
          reference: string | null
          serial_number: string | null
          store_id: string | null
          tax_amount: number
          tax_mode: string
          updated_at: string
          vendor_id: string | null
          warranty_details: string | null
          warranty_expiry: string | null
        }
        Insert: {
          asset_number: string
          brand?: string | null
          created_at?: string
          created_by?: string | null
          details?: string | null
          id?: string
          journal_entry_id?: string | null
          maintenance_info?: string | null
          name: string
          paid_through_account_id?: string | null
          purchase_amount: number
          purchase_date?: string
          reference?: string | null
          serial_number?: string | null
          store_id?: string | null
          tax_amount?: number
          tax_mode?: string
          updated_at?: string
          vendor_id?: string | null
          warranty_details?: string | null
          warranty_expiry?: string | null
        }
        Update: {
          asset_number?: string
          brand?: string | null
          created_at?: string
          created_by?: string | null
          details?: string | null
          id?: string
          journal_entry_id?: string | null
          maintenance_info?: string | null
          name?: string
          paid_through_account_id?: string | null
          purchase_amount?: number
          purchase_date?: string
          reference?: string | null
          serial_number?: string | null
          store_id?: string | null
          tax_amount?: number
          tax_mode?: string
          updated_at?: string
          vendor_id?: string | null
          warranty_details?: string | null
          warranty_expiry?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_fixed_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_fixed_assets_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_fixed_assets_paid_through_account_id_fkey"
            columns: ["paid_through_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_fixed_assets_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_fixed_assets_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_landed_cost_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          rate: number
          tax_rate_percent: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          rate?: number
          tax_rate_percent?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          rate?: number
          tax_rate_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      erp_payment_allocations: {
        Row: {
          amount: number
          id: string
          invoice_id: string
          payment_id: string
        }
        Insert: {
          amount: number
          id?: string
          invoice_id: string
          payment_id: string
        }
        Update: {
          amount?: number
          id?: string
          invoice_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "erp_customer_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_posting_rules: {
        Row: {
          description: string
          event_type: string
          is_enabled: boolean
          is_winner_exact: boolean
          mapping_config: Json
          mapping_notes: string
          updated_at: string
        }
        Insert: {
          description?: string
          event_type: string
          is_enabled?: boolean
          is_winner_exact?: boolean
          mapping_config?: Json
          mapping_notes?: string
          updated_at?: string
        }
        Update: {
          description?: string
          event_type?: string
          is_enabled?: boolean
          is_winner_exact?: boolean
          mapping_config?: Json
          mapping_notes?: string
          updated_at?: string
        }
        Relationships: []
      }
      erp_purchase_bill_landed_costs: {
        Row: {
          id: string
          landed_cost_item_id: string | null
          line_total: number
          name: string
          purchase_bill_id: string
          quantity: number
          rate: number
          tax_amount: number
          tax_rate_percent: number
        }
        Insert: {
          id?: string
          landed_cost_item_id?: string | null
          line_total?: number
          name: string
          purchase_bill_id: string
          quantity?: number
          rate?: number
          tax_amount?: number
          tax_rate_percent?: number
        }
        Update: {
          id?: string
          landed_cost_item_id?: string | null
          line_total?: number
          name?: string
          purchase_bill_id?: string
          quantity?: number
          rate?: number
          tax_amount?: number
          tax_rate_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_purchase_bill_landed_costs_landed_cost_item_id_fkey"
            columns: ["landed_cost_item_id"]
            isOneToOne: false
            referencedRelation: "erp_landed_cost_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_purchase_bill_landed_costs_purchase_bill_id_fkey"
            columns: ["purchase_bill_id"]
            isOneToOne: false
            referencedRelation: "erp_purchase_bills"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_purchase_bill_lines: {
        Row: {
          accepted_qty: number
          barcode: string | null
          expiry_date: string | null
          id: string
          landed_cost_allocated: number
          line_total: number
          original_quantity: number | null
          product_name: string
          purchase_bill_id: string
          purchase_price: number
          quantity: number
          received_qty: number
          rejected_qty: number
          tax_amount: number
          tax_rate_percent: number
          unit_id: string | null
          unit_loaded_cost: number | null
          variant_id: string | null
          product_id: string | null
        }
        Insert: {
          barcode?: string | null
          expiry_date?: string | null
          id?: string
          landed_cost_allocated?: number
          line_total?: number
          product_name: string
          purchase_bill_id: string
          purchase_price?: number
          quantity?: number
          tax_amount?: number
          tax_rate_percent?: number
          unit_id?: string | null
          unit_loaded_cost?: number | null
          variant_id?: string | null
          product_id?: string | null
        }
        Update: {
          barcode?: string | null
          expiry_date?: string | null
          id?: string
          landed_cost_allocated?: number
          line_total?: number
          product_name?: string
          purchase_bill_id?: string
          purchase_price?: number
          quantity?: number
          tax_amount?: number
          tax_rate_percent?: number
          unit_id?: string | null
          unit_loaded_cost?: number | null
          variant_id?: string | null
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_purchase_bill_lines_purchase_bill_id_fkey"
            columns: ["purchase_bill_id"]
            isOneToOne: false
            referencedRelation: "erp_purchase_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_purchase_bill_lines_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "item_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_purchase_bill_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_purchase_bills: {
        Row: {
          accounting_posted: boolean
          amount_paid: number
          balance_due: number
          batch_code: string | null
          batch_number: string | null
          batch_reference: string | null
          created_at: string
          created_by: string | null
          credits_applied: number
          discount: number
          due_date: string | null
          expected_delivery_date: string | null
          grn_reference: string | null
          id: string
          inventory_committed: boolean
          landed_cost_total: number
          legacy_stock_via_bill: boolean
          notes: string | null
          physical_receipt_on_bill: boolean
          po_id: string | null
          purchase_bill_number: string
          purchase_date: string
          reference: string | null
          sales_person_id: string | null
          status: string
          store_id: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          vendor_bill_number: string | null
          vendor_id: string
        }
        Insert: {
          amount_paid?: number
          balance_due?: number
          batch_code?: string | null
          batch_number?: string | null
          batch_reference?: string | null
          created_at?: string
          created_by?: string | null
          credits_applied?: number
          discount?: number
          due_date?: string | null
          expected_delivery_date?: string | null
          grn_reference?: string | null
          id?: string
          inventory_committed?: boolean
          landed_cost_total?: number
          legacy_stock_via_bill?: boolean
          notes?: string | null
          physical_receipt_on_bill?: boolean
          po_id?: string | null
          purchase_bill_number: string
          purchase_date?: string
          reference?: string | null
          sales_person_id?: string | null
          status?: string
          store_id: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_bill_number?: string | null
          vendor_id: string
        }
        Update: {
          amount_paid?: number
          balance_due?: number
          batch_code?: string | null
          batch_number?: string | null
          batch_reference?: string | null
          created_at?: string
          created_by?: string | null
          credits_applied?: number
          discount?: number
          due_date?: string | null
          expected_delivery_date?: string | null
          grn_reference?: string | null
          id?: string
          inventory_committed?: boolean
          landed_cost_total?: number
          legacy_stock_via_bill?: boolean
          notes?: string | null
          physical_receipt_on_bill?: boolean
          po_id?: string | null
          purchase_bill_number?: string
          purchase_date?: string
          reference?: string | null
          sales_person_id?: string | null
          status?: string
          store_id?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_bill_number?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_purchase_bills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_purchase_bills_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_purchase_bills_sales_person_id_fkey"
            columns: ["sales_person_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_purchase_bills_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_purchase_bills_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_purchase_receive_lines: {
        Row: {
          accepted_qty: number
          barcode: string | null
          batch_code: string | null
          batch_number: string | null
          batch_reference: string | null
          bill_line_id: string | null
          expiry_date: string | null
          id: string
          landed_cost_allocated: number
          loaded_unit_cost: number | null
          ordered_qty: number
          billed_qty: number
          po_line_id: string | null
          product_name: string
          purchase_price: number
          purchase_receive_id: string
          received_qty: number
          rejected_qty: number
          tax_rate_percent: number
          variant_id: string | null
        }
        Insert: {
          accepted_qty?: number
          barcode?: string | null
          batch_code?: string | null
          batch_number?: string | null
          batch_reference?: string | null
          bill_line_id?: string | null
          expiry_date?: string | null
          id?: string
          landed_cost_allocated?: number
          loaded_unit_cost?: number | null
          ordered_qty?: number
          billed_qty?: number
          po_line_id?: string | null
          product_name: string
          purchase_price?: number
          purchase_receive_id: string
          received_qty?: number
          rejected_qty?: number
          tax_rate_percent?: number
          variant_id?: string | null
        }
        Update: {
          accepted_qty?: number
          barcode?: string | null
          batch_code?: string | null
          batch_number?: string | null
          batch_reference?: string | null
          bill_line_id?: string | null
          expiry_date?: string | null
          id?: string
          landed_cost_allocated?: number
          loaded_unit_cost?: number | null
          ordered_qty?: number
          billed_qty?: number
          po_line_id?: string | null
          product_name?: string
          purchase_price?: number
          purchase_receive_id?: string
          received_qty?: number
          rejected_qty?: number
          tax_rate_percent?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_purchase_receive_lines_purchase_receive_id_fkey"
            columns: ["purchase_receive_id"]
            isOneToOne: false
            referencedRelation: "erp_purchase_receives"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_purchase_receives: {
        Row: {
          created_at: string
          created_by: string | null
          expected_delivery_date: string | null
          id: string
          inventory_committed: boolean
          notes: string | null
          po_id: string | null
          purchase_bill_id: string | null
          document_kind: string
          receive_date: string
          receive_number: string
          reconcile_bill: boolean
          reference: string | null
          reversal_of_id: string | null
          reversal_reason: string | null
          reversed_by_receive_id: string | null
          allow_over_authorization: boolean
          status: string
          store_id: string
          updated_at: string
          updated_by: string | null
          vendor_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expected_delivery_date?: string | null
          id?: string
          inventory_committed?: boolean
          notes?: string | null
          po_id?: string | null
          purchase_bill_id?: string | null
          receive_date?: string
          receive_number: string
          reconcile_bill?: boolean
          reference?: string | null
          status?: string
          store_id: string
          updated_at?: string
          updated_by?: string | null
          vendor_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expected_delivery_date?: string | null
          id?: string
          inventory_committed?: boolean
          notes?: string | null
          po_id?: string | null
          purchase_bill_id?: string | null
          receive_date?: string
          receive_number?: string
          reconcile_bill?: boolean
          reference?: string | null
          status?: string
          store_id?: string
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_purchase_receives_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_purchase_receives_purchase_bill_id_fkey"
            columns: ["purchase_bill_id"]
            isOneToOne: false
            referencedRelation: "erp_purchase_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_purchase_receives_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_purchase_receives_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_stock_adjustment_lines: {
        Row: {
          adjustment_id: string
          direction: string
          id: string
          line_total: number
          purchase_cost: number
          quantity: number
          variant_id: string
        }
        Insert: {
          adjustment_id: string
          direction: string
          id?: string
          line_total?: number
          purchase_cost?: number
          quantity: number
          variant_id: string
        }
        Update: {
          adjustment_id?: string
          direction?: string
          id?: string
          line_total?: number
          purchase_cost?: number
          quantity?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_stock_adjustment_lines_adjustment_id_fkey"
            columns: ["adjustment_id"]
            isOneToOne: false
            referencedRelation: "erp_stock_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_stock_adjustment_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_stock_adjustments: {
        Row: {
          adjustment_date: string
          adjustment_number: string
          created_at: string
          created_by: string | null
          id: string
          inventory_committed: boolean
          note: string | null
          status: string
          store_id: string
          total_add_cost: number
          total_remove_cost: number
          updated_at: string
        }
        Insert: {
          adjustment_date?: string
          adjustment_number: string
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_committed?: boolean
          note?: string | null
          status?: string
          store_id: string
          total_add_cost?: number
          total_remove_cost?: number
          updated_at?: string
        }
        Update: {
          adjustment_date?: string
          adjustment_number?: string
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_committed?: boolean
          note?: string | null
          status?: string
          store_id?: string
          total_add_cost?: number
          total_remove_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_stock_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_stock_adjustments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_store_transfer_lines: {
        Row: {
          id: string
          line_total: number
          markup_amount: number
          markup_percent: number
          markup_type: string | null
          purchase_price: number
          quantity: number
          sales_price: number
          transfer_id: string
          transfer_price: number
          variant_id: string
        }
        Insert: {
          id?: string
          line_total?: number
          markup_amount?: number
          markup_percent?: number
          markup_type?: string | null
          purchase_price?: number
          quantity: number
          sales_price?: number
          transfer_id: string
          transfer_price?: number
          variant_id: string
        }
        Update: {
          id?: string
          line_total?: number
          markup_amount?: number
          markup_percent?: number
          markup_type?: string | null
          purchase_price?: number
          quantity?: number
          sales_price?: number
          transfer_id?: string
          transfer_price?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_store_transfer_lines_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "erp_store_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_store_transfer_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_store_transfers: {
        Row: {
          created_at: string
          created_by: string | null
          from_store_id: string
          id: string
          inventory_committed: boolean
          note: string | null
          request_id: string | null
          status: string
          to_store_id: string
          transfer_date: string
          transfer_number: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_store_id: string
          id?: string
          inventory_committed?: boolean
          note?: string | null
          request_id?: string | null
          status?: string
          to_store_id: string
          transfer_date?: string
          transfer_number: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_store_id?: string
          id?: string
          inventory_committed?: boolean
          note?: string | null
          request_id?: string | null
          status?: string
          to_store_id?: string
          transfer_date?: string
          transfer_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_store_transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_store_transfers_from_store_id_fkey"
            columns: ["from_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_store_transfers_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "erp_transfer_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_store_transfers_to_store_id_fkey"
            columns: ["to_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_supplier_payment_allocations: {
        Row: {
          amount: number
          id: string
          payment_id: string
          purchase_bill_id: string
        }
        Insert: {
          amount: number
          id?: string
          payment_id: string
          purchase_bill_id: string
        }
        Update: {
          amount?: number
          id?: string
          payment_id?: string
          purchase_bill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_supplier_payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "erp_supplier_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_supplier_payment_allocations_purchase_bill_id_fkey"
            columns: ["purchase_bill_id"]
            isOneToOne: false
            referencedRelation: "erp_purchase_bills"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_supplier_payments: {
        Row: {
          account_id: string | null
          bills_count: number
          created_at: string
          created_by: string | null
          id: string
          is_bulk: boolean
          notes: string | null
          payment_date: string
          payment_mode: string
          payment_number: string
          reference: string | null
          store_id: string
          total_amount: number
          unallocated_amount: number
          vendor_id: string
        }
        Insert: {
          account_id?: string | null
          bills_count?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_bulk?: boolean
          notes?: string | null
          payment_date?: string
          payment_mode: string
          payment_number: string
          reference?: string | null
          store_id: string
          total_amount?: number
          unallocated_amount?: number
          vendor_id: string
        }
        Update: {
          account_id?: string | null
          bills_count?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_bulk?: boolean
          notes?: string | null
          payment_date?: string
          payment_mode?: string
          payment_number?: string
          reference?: string | null
          store_id?: string
          total_amount?: number
          unallocated_amount?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_supplier_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_supplier_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_supplier_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_supplier_payments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_transfer_payments: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          created_by: string | null
          from_store_id: string
          id: string
          notes: string | null
          payment_date: string
          payment_mode: string
          payment_number: string
          reference: string | null
          to_store_id: string
          transfer_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          created_at?: string
          created_by?: string | null
          from_store_id: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_mode: string
          payment_number: string
          reference?: string | null
          to_store_id: string
          transfer_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          created_by?: string | null
          from_store_id?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_mode?: string
          payment_number?: string
          reference?: string | null
          to_store_id?: string
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_transfer_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_transfer_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_transfer_payments_from_store_id_fkey"
            columns: ["from_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_transfer_payments_to_store_id_fkey"
            columns: ["to_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_transfer_payments_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "erp_store_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_transfer_request_lines: {
        Row: {
          average_purchase_cost: number
          id: string
          note: string | null
          quantity: number
          request_id: string
          sales_price: number
          source_available: number
          transfer_price: number
          variant_id: string
        }
        Insert: {
          average_purchase_cost?: number
          id?: string
          note?: string | null
          quantity: number
          request_id: string
          sales_price?: number
          source_available?: number
          transfer_price?: number
          variant_id: string
        }
        Update: {
          average_purchase_cost?: number
          id?: string
          note?: string | null
          quantity?: number
          request_id?: string
          sales_price?: number
          source_available?: number
          transfer_price?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_transfer_request_lines_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "erp_transfer_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_transfer_request_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_transfer_requests: {
        Row: {
          created_at: string
          created_by: string | null
          from_store_id: string
          id: string
          note: string | null
          request_date: string
          request_number: string
          status: string
          to_store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_store_id: string
          id?: string
          note?: string | null
          request_date?: string
          request_number: string
          status?: string
          to_store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_store_id?: string
          id?: string
          note?: string | null
          request_date?: string
          request_number?: string
          status?: string
          to_store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_transfer_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_transfer_requests_from_store_id_fkey"
            columns: ["from_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_transfer_requests_to_store_id_fkey"
            columns: ["to_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_vat_payments: {
        Row: {
          account_transaction_id: string | null
          amount: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          paid_from_account_id: string
          payment_date: string
          payment_number: string
          payment_type: string
          reference: string | null
          store_id: string | null
          updated_at: string
          vat_return_id: string
        }
        Insert: {
          account_transaction_id?: string | null
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_from_account_id: string
          payment_date?: string
          payment_number: string
          payment_type?: string
          reference?: string | null
          store_id?: string | null
          updated_at?: string
          vat_return_id: string
        }
        Update: {
          account_transaction_id?: string | null
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_from_account_id?: string
          payment_date?: string
          payment_number?: string
          payment_type?: string
          reference?: string | null
          store_id?: string | null
          updated_at?: string
          vat_return_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_vat_payments_account_transaction_id_fkey"
            columns: ["account_transaction_id"]
            isOneToOne: false
            referencedRelation: "erp_account_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_vat_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_vat_payments_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_vat_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_vat_payments_vat_return_id_fkey"
            columns: ["vat_return_id"]
            isOneToOne: false
            referencedRelation: "erp_vat_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_vat_returns: {
        Row: {
          balance_due: number
          created_at: string
          created_by: string | null
          filed_date: string | null
          id: string
          input_tax: number
          journal_entry_id: string | null
          notes: string | null
          output_tax: number
          period_end: string
          period_label: string
          period_start: string
          return_number: string
          status: string
          store_id: string | null
          total_tax_payable: number
          updated_at: string
        }
        Insert: {
          balance_due?: number
          created_at?: string
          created_by?: string | null
          filed_date?: string | null
          id?: string
          input_tax?: number
          journal_entry_id?: string | null
          notes?: string | null
          output_tax?: number
          period_end: string
          period_label?: string
          period_start: string
          return_number: string
          status?: string
          store_id?: string | null
          total_tax_payable?: number
          updated_at?: string
        }
        Update: {
          balance_due?: number
          created_at?: string
          created_by?: string | null
          filed_date?: string | null
          id?: string
          input_tax?: number
          journal_entry_id?: string | null
          notes?: string | null
          output_tax?: number
          period_end?: string
          period_label?: string
          period_start?: string
          return_number?: string
          status?: string
          store_id?: string | null
          total_tax_payable?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_vat_returns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_vat_returns_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_vat_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_vendor_credit_applications: {
        Row: {
          amount: number
          id: string
          purchase_bill_id: string
          vendor_credit_id: string
        }
        Insert: {
          amount: number
          id?: string
          purchase_bill_id: string
          vendor_credit_id: string
        }
        Update: {
          amount?: number
          id?: string
          purchase_bill_id?: string
          vendor_credit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_vendor_credit_applications_purchase_bill_id_fkey"
            columns: ["purchase_bill_id"]
            isOneToOne: false
            referencedRelation: "erp_purchase_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_vendor_credit_applications_vendor_credit_id_fkey"
            columns: ["vendor_credit_id"]
            isOneToOne: false
            referencedRelation: "erp_vendor_credits"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_vendor_credit_lines: {
        Row: {
          id: string
          line_total: number
          product_name: string
          quantity: number
          tax_amount: number
          tax_rate_percent: number
          unit_price: number
          variant_id: string | null
          product_id: string | null
          vendor_credit_id: string
        }
        Insert: {
          id?: string
          line_total?: number
          product_name: string
          quantity?: number
          tax_amount?: number
          tax_rate_percent?: number
          unit_price?: number
          variant_id?: string | null
          product_id?: string | null
          vendor_credit_id: string
        }
        Update: {
          id?: string
          line_total?: number
          product_name?: string
          quantity?: number
          tax_amount?: number
          tax_rate_percent?: number
          unit_price?: number
          variant_id?: string | null
          product_id?: string | null
          vendor_credit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_vendor_credit_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_vendor_credit_lines_vendor_credit_id_fkey"
            columns: ["vendor_credit_id"]
            isOneToOne: false
            referencedRelation: "erp_vendor_credits"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_vendor_credits: {
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
        Relationships: [
          {
            foreignKeyName: "erp_vendor_credits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_vendor_credits_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_vendor_credits_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          last_reorder_quantity: number | null
          reorder_point: number
          reorder_quantity: number
          reserved_stock: number
          stock: number
          store_id: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          last_reorder_quantity?: number | null
          reorder_point?: number
          reorder_quantity?: number
          reserved_stock?: number
          stock?: number
          store_id: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          last_reorder_quantity?: number | null
          reorder_point?: number
          reorder_quantity?: number
          reserved_stock?: number
          stock?: number
          store_id?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_variant_fkey"
            columns: ["variant_id"]
            isOneToOne: true
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          base_price: number
          description: string | null
          gst_amount: number
          gst_rate: number
          id: string
          invoice_id: string
          product_id: string | null
          product_name: string
          quantity: number
          taxable_amount: number
          total_amount: number
          unit_id: string | null
          unit_price: number
          variant_id: string | null
          vendor_id: string | null
        }
        Insert: {
          base_price?: number
          description?: string | null
          gst_amount?: number
          gst_rate?: number
          id?: string
          invoice_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          taxable_amount?: number
          total_amount?: number
          unit_id?: string | null
          unit_price?: number
          variant_id?: string | null
          vendor_id?: string | null
        }
        Update: {
          base_price?: number
          description?: string | null
          gst_amount?: number
          gst_rate?: number
          id?: string
          invoice_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          taxable_amount?: number
          total_amount?: number
          unit_id?: string | null
          unit_price?: number
          variant_id?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "item_units"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          balance_due: number
          created_at: string
          credits_applied: number
          discount: number
          due_date: string | null
          estimate_id: string | null
          gst_amount: number
          gst_number: string | null
          id: string
          invoice_id: string | null
          inventory_committed: boolean
          invoice_number: string
          issued_at: string | null
          notes: string | null
          order_id: string | null
          pdf_url: string | null
          reference: string | null
          sales_person_id: string | null
          source: string
          status: string
          store_id: string | null
          subtotal: number
          tax_inclusive: boolean
          total_amount: number
          user_id: string
        }
        Insert: {
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
          invoice_id?: string | null
          inventory_committed?: boolean
          invoice_number: string
          issued_at?: string | null
          notes?: string | null
          order_id?: string | null
          pdf_url?: string | null
          reference?: string | null
          sales_person_id?: string | null
          source?: string
          status?: string
          store_id?: string | null
          subtotal?: number
          tax_inclusive?: boolean
          total_amount?: number
          user_id: string
        }
        Update: {
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
          invoice_id?: string | null
          inventory_committed?: boolean
          invoice_number?: string
          issued_at?: string | null
          notes?: string | null
          order_id?: string | null
          pdf_url?: string | null
          reference?: string | null
          sales_person_id?: string | null
          source?: string
          status?: string
          store_id?: string | null
          subtotal?: number
          tax_inclusive?: boolean
          total_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sales_person_id_fkey"
            columns: ["sales_person_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_store_id_fkey"
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
      item_units: {
        Row: {
          abbreviation: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          abbreviation: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          abbreviation?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          journal_number: string
          posted_at: string
          posted_by: string | null
          source_entity_id: string | null
          source_entity_type: string | null
          status: string
          store_id: string | null
          total_credit: number
          total_debit: number
          transaction_date: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          journal_number: string
          posted_at?: string
          posted_by?: string | null
          source_entity_id?: string | null
          source_entity_type?: string | null
          status?: string
          store_id?: string | null
          total_credit?: number
          total_debit?: number
          transaction_date?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          journal_number?: string
          posted_at?: string
          posted_by?: string | null
          source_entity_id?: string | null
          source_entity_type?: string | null
          status?: string
          store_id?: string | null
          total_credit?: number
          total_debit?: number
          transaction_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_lines: {
        Row: {
          account_id: string
          created_at: string
          credit_amount: number
          debit_amount: number
          description: string
          id: string
          journal_entry_id: string
          line_order: number
        }
        Insert: {
          account_id: string
          created_at?: string
          credit_amount?: number
          debit_amount?: number
          description?: string
          id?: string
          journal_entry_id: string
          line_order?: number
        }
        Update: {
          account_id?: string
          created_at?: string
          credit_amount?: number
          debit_amount?: number
          description?: string
          id?: string
          journal_entry_id?: string
          line_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean
          message: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          message: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          message?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      order_fulfillment_items: {
        Row: {
          fulfillment_id: string
          id: string
          order_item_id: string | null
          quantity: number
          reserved_quantity: number
          shipped_quantity: number
          variant_id: string
        }
        Insert: {
          fulfillment_id: string
          id?: string
          order_item_id?: string | null
          quantity: number
          reserved_quantity?: number
          shipped_quantity?: number
          variant_id: string
        }
        Update: {
          fulfillment_id?: string
          id?: string
          order_item_id?: string | null
          quantity?: number
          reserved_quantity?: number
          shipped_quantity?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_fulfillment_items_fulfillment_id_fkey"
            columns: ["fulfillment_id"]
            isOneToOne: false
            referencedRelation: "order_fulfillments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_fulfillment_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_fulfillment_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_fulfillments: {
        Row: {
          created_at: string
          id: string
          inventory_committed: boolean
          order_id: string
          reserved_at: string | null
          shipment_number: string | null
          shipped_at: string | null
          status: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_committed?: boolean
          order_id: string
          reserved_at?: string | null
          shipment_number?: string | null
          shipped_at?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_committed?: boolean
          order_id?: string
          reserved_at?: string | null
          shipment_number?: string | null
          shipped_at?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_fulfillments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_fulfillments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_funnel_reach: {
        Row: {
          checkout_at: string
          completed_at: string | null
          order_id: string
          total_amount: number
          user_id: string | null
        }
        Insert: {
          checkout_at?: string
          completed_at?: string | null
          order_id: string
          total_amount?: number
          user_id?: string | null
        }
        Update: {
          checkout_at?: string
          completed_at?: string | null
          order_id?: string
          total_amount?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_funnel_reach_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          base_price: number | null
          created_at: string
          customer_edit_flag: string | null
          final_price: number | null
          id: string
          margin_amount: number | null
          order_id: string | null
          price: number | null
          product_name: string | null
          quantity: number | null
          variant_id: string | null
          vendor_id: string | null
        }
        Insert: {
          base_price?: number | null
          created_at?: string
          customer_edit_flag?: string | null
          final_price?: number | null
          id?: string
          margin_amount?: number | null
          order_id?: string | null
          price?: number | null
          product_name?: string | null
          quantity?: number | null
          variant_id?: string | null
          vendor_id?: string | null
        }
        Update: {
          base_price?: number | null
          created_at?: string
          customer_edit_flag?: string | null
          final_price?: number | null
          id?: string
          margin_amount?: number | null
          order_id?: string | null
          price?: number | null
          product_name?: string | null
          quantity?: number | null
          variant_id?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address_id: string | null
          company: string | null
          created_at: string
          created_by_admin_id: string | null
          customer_edited_at: string | null
          customer_name: string | null
          delivery_method: string | null
          delivery_user_id: string | null
          discount: number | null
          estimate_id: string | null
          fulfillment_status: string
          gst_number: string | null
          id: string
          invoice_id: string | null
          inventory_committed: boolean
          inventory_reserved: boolean
          merchant_note: string | null
          payment_status: string
          phone: string | null
          reference_number: string | null
          sales_order_number: string | null
          sales_person_id: string | null
          shipment_date: string | null
          source: string | null
          status: string
          store_id: string | null
          subtotal: number | null
          tax: number | null
          total_amount: number | null
          user_id: string | null
        }
        Insert: {
          address_id?: string | null
          company?: string | null
          created_at?: string
          created_by_admin_id?: string | null
          customer_edited_at?: string | null
          customer_name?: string | null
          delivery_method?: string | null
          delivery_user_id?: string | null
          discount?: number | null
          estimate_id?: string | null
          fulfillment_status?: string
          gst_number?: string | null
          id?: string
          invoice_id?: string | null
          inventory_committed?: boolean
          inventory_reserved?: boolean
          merchant_note?: string | null
          payment_status?: string
          phone?: string | null
          reference_number?: string | null
          sales_order_number?: string | null
          sales_person_id?: string | null
          shipment_date?: string | null
          source?: string | null
          status?: string
          store_id?: string | null
          subtotal?: number | null
          tax?: number | null
          total_amount?: number | null
          user_id?: string | null
        }
        Update: {
          address_id?: string | null
          company?: string | null
          created_at?: string
          created_by_admin_id?: string | null
          customer_edited_at?: string | null
          customer_name?: string | null
          delivery_method?: string | null
          delivery_user_id?: string | null
          discount?: number | null
          estimate_id?: string | null
          fulfillment_status?: string
          gst_number?: string | null
          id?: string
          invoice_id?: string | null
          inventory_committed?: boolean
          inventory_reserved?: boolean
          merchant_note?: string | null
          payment_status?: string
          phone?: string | null
          reference_number?: string | null
          sales_order_number?: string | null
          sales_person_id?: string | null
          shipment_date?: string | null
          source?: string | null
          status?: string
          store_id?: string | null
          subtotal?: number | null
          tax?: number | null
          total_amount?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_address_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_user_fkey"
            columns: ["delivery_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_sales_person_id_fkey"
            columns: ["sales_person_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          created_at: string
          fixed_markup: number | null
          id: string
          is_active: boolean
          margin_percent: number | null
          product_id: string | null
        }
        Insert: {
          created_at?: string
          fixed_markup?: number | null
          id?: string
          is_active?: boolean
          margin_percent?: number | null
          product_id?: string | null
        }
        Update: {
          created_at?: string
          fixed_markup?: number | null
          id?: string
          is_active?: boolean
          margin_percent?: number | null
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_product_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          created_at: string | null
          id: string
          is_preview: boolean
          product_id: string
          sort_order: number
          url: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_preview?: boolean
          product_id: string
          sort_order?: number
          url: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_preview?: boolean
          product_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          created_at: string
          id: string
          markup_percent: number | null
          mrp: number | null
          name: string | null
          price: number | null
          product_code: string | null
          product_id: string | null
          purchase_price: number | null
          tax_rate_percent: number | null
          unit_id: string | null
          variant_group_id: string | null
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          id?: string
          markup_percent?: number | null
          mrp?: number | null
          name?: string | null
          price?: number | null
          product_code?: string | null
          product_id?: string | null
          purchase_price?: number | null
          tax_rate_percent?: number | null
          unit_id?: string | null
          variant_group_id?: string | null
        }
        Update: {
          barcode?: string | null
          created_at?: string
          id?: string
          markup_percent?: number | null
          mrp?: number | null
          name?: string | null
          price?: number | null
          product_code?: string | null
          product_id?: string | null
          purchase_price?: number | null
          tax_rate_percent?: number | null
          unit_id?: string | null
          variant_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "item_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_variant_group_id_fkey"
            columns: ["variant_group_id"]
            isOneToOne: false
            referencedRelation: "variant_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      product_videos: {
        Row: {
          created_at: string | null
          id: string
          product_id: string
          sort_order: number
          url: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id: string
          sort_order?: number
          url: string
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_videos_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_view_reach: {
        Row: {
          first_seen_at: string
          product_id: string
          user_id: string
          variant_id: string | null
        }
        Insert: {
          first_seen_at?: string
          product_id: string
          user_id: string
          variant_id?: string | null
        }
        Update: {
          first_seen_at?: string
          product_id?: string
          user_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_view_reach_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_view_reach_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          brand_id: string | null
          category_id: string | null
          created_at: string
          description: string | null
          hsn_sac: string | null
          id: string
          image_url: string | null
          is_active: boolean
          item_type: string
          mrp: number | null
          name: string | null
          price: number | null
          purchase_price: number | null
          specs: Json
          tax_rate_percent: number | null
          use_smart_pricing: boolean
          variant_layout: string
        }
        Insert: {
          barcode?: string | null
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          hsn_sac?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          item_type?: string
          mrp?: number | null
          name?: string | null
          price?: number | null
          purchase_price?: number | null
          specs?: Json
          tax_rate_percent?: number | null
          use_smart_pricing?: boolean
          variant_layout?: string
        }
        Update: {
          barcode?: string | null
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          hsn_sac?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          item_type?: string
          mrp?: number | null
          name?: string | null
          price?: number | null
          purchase_price?: number | null
          specs?: Json
          tax_rate_percent?: number | null
          use_smart_pricing?: boolean
          variant_layout?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_landed_costs: {
        Row: {
          created_at: string
          id: string
          landed_cost_item_id: string | null
          line_total: number
          name: string
          po_id: string
          quantity: number
          rate: number
          tax_amount: number
          tax_rate_percent: number
        }
        Insert: {
          created_at?: string
          id?: string
          landed_cost_item_id?: string | null
          line_total?: number
          name: string
          po_id: string
          quantity?: number
          rate?: number
          tax_amount?: number
          tax_rate_percent?: number
        }
        Update: {
          created_at?: string
          id?: string
          landed_cost_item_id?: string | null
          line_total?: number
          name?: string
          po_id?: string
          quantity?: number
          rate?: number
          tax_amount?: number
          tax_rate_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_landed_costs_landed_cost_item_id_fkey"
            columns: ["landed_cost_item_id"]
            isOneToOne: false
            referencedRelation: "erp_landed_cost_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_landed_costs_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          accepted_qty: number
          discount: number
          id: string
          landed_cost_allocated: number
          line_total: number
          po_id: string | null
          price: number | null
          quantity: number | null
          received_qty: number
          rejected_qty: number
          tax_amount: number
          tax_rate_percent: number
          unit_loaded_cost: number | null
          variant_id: string | null
          product_id: string | null
        }
        Insert: {
          discount?: number
          id?: string
          landed_cost_allocated?: number
          line_total?: number
          po_id?: string | null
          price?: number | null
          quantity?: number | null
          tax_amount?: number
          tax_rate_percent?: number
          unit_loaded_cost?: number | null
          variant_id?: string | null
          product_id?: string | null
        }
        Update: {
          discount?: number
          id?: string
          landed_cost_allocated?: number
          line_total?: number
          po_id?: string | null
          price?: number | null
          quantity?: number | null
          tax_amount?: number
          tax_rate_percent?: number
          unit_loaded_cost?: number | null
          variant_id?: string | null
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_po_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_variant_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          discount: number
          expected_delivery_date: string | null
          id: string
          landed_cost_total: number
          notes: string | null
          po_date: string | null
          po_number: string | null
          reference: string | null
          status: string
          store_id: string | null
          subtotal: number
          tax_total: number
          total_amount: number | null
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          discount?: number
          expected_delivery_date?: string | null
          id?: string
          landed_cost_total?: number
          notes?: string | null
          po_date?: string | null
          po_number?: string | null
          reference?: string | null
          status?: string
          store_id?: string | null
          subtotal?: number
          tax_total?: number
          total_amount?: number | null
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          discount?: number
          expected_delivery_date?: string | null
          id?: string
          landed_cost_total?: number
          notes?: string | null
          po_date?: string | null
          po_number?: string | null
          reference?: string | null
          status?: string
          store_id?: string | null
          subtotal?: number
          tax_total?: number
          total_amount?: number | null
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          order_id: string
          order_item_id: string
          quantity: number
          reason: string
          refund_amount: number | null
          status: string
          updated_at: string | null
          user_id: string
          variant_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          order_id: string
          order_item_id: string
          quantity?: number
          reason: string
          refund_amount?: number | null
          status?: string
          updated_at?: string | null
          user_id: string
          variant_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          order_item_id?: string
          quantity?: number
          reason?: string
          refund_amount?: number | null
          status?: string
          updated_at?: string | null
          user_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          id: string
          list_id: string | null
          quantity: number | null
          variant_id: string | null
        }
        Insert: {
          id?: string
          list_id?: string | null
          quantity?: number | null
          variant_id?: string | null
        }
        Update: {
          id?: string
          list_id?: string | null
          quantity?: number | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_list_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_variant_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          created_at: string
          id: string
          name: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_lists_user_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          balance_after: number | null
          created_at: string
          id: string
          quantity: number
          reason: string | null
          reference_id: string | null
          reference_type: string | null
          store_id: string | null
          transaction_price: number | null
          transfer_store_id: string | null
          type: string
          user_id: string | null
          variant_id: string
        }
        Insert: {
          balance_after?: number | null
          created_at?: string
          id?: string
          quantity: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          store_id?: string | null
          transaction_price?: number | null
          transfer_store_id?: string | null
          type: string
          user_id?: string | null
          variant_id: string
        }
        Update: {
          balance_after?: number | null
          created_at?: string
          id?: string
          quantity?: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          store_id?: string | null
          transaction_price?: number | null
          transfer_store_id?: string | null
          type?: string
          user_id?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_transfer_store_id_fkey"
            columns: ["transfer_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      store_inventory: {
        Row: {
          opening_stock: number
          purchase_price: number | null
          reserved_stock: number
          sales_price: number | null
          stock: number
          store_id: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          opening_stock?: number
          purchase_price?: number | null
          reserved_stock?: number
          sales_price?: number | null
          stock?: number
          store_id: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          opening_stock?: number
          purchase_price?: number | null
          reserved_stock?: number
          sales_price?: number | null
          stock?: number
          store_id?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_inventory_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_inventory_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      store_product_inventory: {
        Row: {
          opening_stock: number
          product_id: string
          purchase_price: number | null
          sales_price: number | null
          stock: number
          store_id: string
          updated_at: string
        }
        Insert: {
          opening_stock?: number
          product_id: string
          purchase_price?: number | null
          sales_price?: number | null
          stock?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          opening_stock?: number
          product_id?: string
          purchase_price?: number | null
          sales_price?: number | null
          stock?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      online_stock_transfers: {
        Row: {
          allocated_at: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          product_id: string
          quantity: number
          status: string
          store_id: string
          transfer_number: string
          updated_at: string
        }
        Insert: {
          allocated_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id: string
          quantity: number
          status?: string
          store_id: string
          transfer_number: string
          updated_at?: string
        }
        Update: {
          allocated_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          status?: string
          store_id?: string
          transfer_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      online_stock_transfer_allocations: {
        Row: {
          id: string
          quantity: number
          transfer_id: string
          variant_id: string
        }
        Insert: {
          id?: string
          quantity: number
          transfer_id: string
          variant_id: string
        }
        Update: {
          id?: string
          quantity?: number
          transfer_id?: string
          variant_id?: string
        }
        Relationships: []
      }
      stores: {
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
          markup_percent: number
          name: string
          phone: string | null
          pincode: string | null
          state: string | null
          store_type: string | null
          tax_template: string | null
          trn: string | null
          updated_at: string
        }
        Insert: {
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
            foreignKeyName: "stores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_default: boolean
          name: string
          rate_percent: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          rate_percent: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          rate_percent?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number | null
          created_at: string
          id: string
          reference: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          id?: string
          reference?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          id?: string
          reference?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_user_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_erp_preferences: {
        Row: {
          active_store_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_store_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_store_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_erp_preferences_active_store_id_fkey"
            columns: ["active_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_erp_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_store_access: {
        Row: {
          created_at: string
          is_default: boolean
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          is_default?: boolean
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          is_default?: boolean
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_store_access_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_store_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          company_name: string | null
          contact_display_name: string | null
          created_at: string
          customer_notes: string | null
          customer_number: string | null
          email: string | null
          id: string
          is_verified: boolean
          location: string | null
          name: string | null
          opening_balance: number
          opening_balance_date: string | null
          phone: string | null
          po_box: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          trn: string | null
        }
        Insert: {
          company_name?: string | null
          contact_display_name?: string | null
          created_at?: string
          customer_notes?: string | null
          customer_number?: string | null
          email?: string | null
          id?: string
          is_verified?: boolean
          location?: string | null
          name?: string | null
          opening_balance?: number
          opening_balance_date?: string | null
          phone?: string | null
          po_box?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          trn?: string | null
        }
        Update: {
          company_name?: string | null
          contact_display_name?: string | null
          created_at?: string
          customer_notes?: string | null
          customer_number?: string | null
          email?: string | null
          id?: string
          is_verified?: boolean
          location?: string | null
          name?: string | null
          opening_balance?: number
          opening_balance_date?: string | null
          phone?: string | null
          po_box?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          trn?: string | null
        }
        Relationships: []
      }
      variant_groups: {
        Row: {
          created_at: string | null
          id: string
          name: string
          product_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          product_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "variant_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      variant_images: {
        Row: {
          created_at: string | null
          id: string
          is_preview: boolean
          sort_order: number
          url: string
          variant_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_preview?: boolean
          sort_order?: number
          url: string
          variant_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_preview?: boolean
          sort_order?: number
          url?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_images_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_pricing_overrides: {
        Row: {
          created_at: string
          id: string
          override_margin: number | null
          override_price: number | null
          variant_id: string | null
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          override_margin?: number | null
          override_price?: number | null
          variant_id?: string | null
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          override_margin?: number | null
          override_price?: number | null
          variant_id?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_pricing_overrides_variant_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_pricing_overrides_vendor_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_products: {
        Row: {
          base_price: number
          created_at: string
          id: string
          stock: number
          variant_id: string | null
          vendor_id: string | null
        }
        Insert: {
          base_price: number
          created_at?: string
          id?: string
          stock?: number
          variant_id?: string | null
          vendor_id?: string | null
        }
        Update: {
          base_price?: number
          created_at?: string
          id?: string
          stock?: number
          variant_id?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_products_variant_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_products_vendor_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          contact: string | null
          created_at: string
          email: string | null
          fax: string | null
          id: string
          is_active: boolean
          name: string | null
          notes: string | null
          opening_balance: number
          opening_balance_date: string | null
          phone: string | null
          po_box: string | null
          trn: string | null
          updated_at: string
          vendor_type: string | null
        }
        Insert: {
          address?: string | null
          contact?: string | null
          created_at?: string
          email?: string | null
          fax?: string | null
          id?: string
          is_active?: boolean
          name?: string | null
          notes?: string | null
          opening_balance?: number
          opening_balance_date?: string | null
          phone?: string | null
          po_box?: string | null
          trn?: string | null
          updated_at?: string
          vendor_type?: string | null
        }
        Update: {
          address?: string | null
          contact?: string | null
          created_at?: string
          email?: string | null
          fax?: string | null
          id?: string
          is_active?: boolean
          name?: string | null
          notes?: string | null
          opening_balance?: number
          opening_balance_date?: string | null
          phone?: string | null
          po_box?: string | null
          trn?: string | null
          updated_at?: string
          vendor_type?: string | null
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          badge_enabled: boolean
          order_updates: boolean
          promotions: boolean
          push_enabled: boolean
          quiet_hours_enabled: boolean
          quiet_hours_end: string
          quiet_hours_start: string
          sound_enabled: boolean
          updated_at: string
          user_id: string
          wallet_updates: boolean
        }
        Insert: {
          badge_enabled?: boolean
          order_updates?: boolean
          promotions?: boolean
          push_enabled?: boolean
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          sound_enabled?: boolean
          updated_at?: string
          user_id: string
          wallet_updates?: boolean
        }
        Update: {
          badge_enabled?: boolean
          order_updates?: boolean
          promotions?: boolean
          push_enabled?: boolean
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          sound_enabled?: boolean
          updated_at?: string
          user_id?: string
          wallet_updates?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_campaigns: {
        Row: {
          audience: string
          body: string
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          failed_count: number
          href: string | null
          id: string
          name: string | null
          origin: string
          scheduled_at: string | null
          sent_at: string | null
          sent_count: number
          skipped_count: number
          sound: string
          status: string
          template_id: string | null
          title: string
          topic: string
        }
        Insert: {
          audience?: string
          body: string
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          failed_count?: number
          href?: string | null
          id?: string
          name?: string | null
          origin?: string
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number
          skipped_count?: number
          sound?: string
          status?: string
          template_id?: string | null
          title: string
          topic?: string
        }
        Update: {
          audience?: string
          body?: string
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          failed_count?: number
          href?: string | null
          id?: string
          name?: string | null
          origin?: string
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number
          skipped_count?: number
          sound?: string
          status?: string
          template_id?: string | null
          title?: string
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "push_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      push_templates: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          enabled: boolean
          event_key: string | null
          href: string | null
          id: string
          kind: string
          name: string
          sound: string
          title: string
          topic: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          event_key?: string | null
          href?: string | null
          id?: string
          kind?: string
          name: string
          sound?: string
          title: string
          topic?: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          event_key?: string | null
          href?: string | null
          id?: string
          kind?: string
          name?: string
          sound?: string
          title?: string
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          device_name: string | null
          expo_push_token: string
          id: string
          is_active: boolean
          last_seen_at: string
          platform: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          expo_push_token: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          platform: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          expo_push_token?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          platform?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet: {
        Row: {
          balance: number
          id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          balance?: number
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          balance?: number
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_user_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_to_cart: {
        Args: { p_quantity?: number; p_user_id: string; p_variant_id: string }
        Returns: Json
      }
      analytics_funnel_reach: {
        Args: { p_from: string; p_product_id?: string; p_to: string }
        Returns: {
          cart_reach: number
          checkout_reach: number
          purchase_reach: number
          view_reach: number
        }[]
      }
      analytics_product_reach_detail: {
        Args: {
          p_from: string
          p_limit?: number
          p_product_id?: string
          p_to: string
        }
        Returns: {
          buyers: Json
          cart_count: number
          carters: Json
          order_count: number
          product_id: string
          product_name: string
          revenue: number
          units_sold: number
          view_count: number
          viewers: Json
        }[]
      }
      apply_erp_credit_note: {
        Args: {
          p_amount: number
          p_applied_by?: string
          p_credit_note_id: string
          p_invoice_id: string
        }
        Returns: undefined
      }
      apply_erp_vendor_credit: {
        Args: {
          p_amount: number
          p_applied_by?: string
          p_bill_id: string
          p_credit_id: string
        }
        Returns: undefined
      }
      approve_erp_store_transfer: {
        Args: { p_approved_by?: string; p_transfer_id: string }
        Returns: undefined
      }
      assign_order_fulfillment_store: {
        Args: { p_actor?: string; p_order_id: string; p_store_id: string }
        Returns: undefined
      }
      calculate_tax: {
        Args: { p_amount: number; p_rate_percent: number }
        Returns: number
      }
      check_credit_limit: {
        Args: { p_order_amount: number; p_user_id: string }
        Returns: boolean
      }
      complete_pos_counter_sale: {
        Args: {
          p_company?: string
          p_created_by?: string
          p_customer_name?: string
          p_customer_user_id?: string
          p_discount: number
          p_gst_number?: string
          p_idempotency_key: string
          p_lines: Json
          p_phone?: string
          p_store_id: string
          p_subtotal: number
          p_tax: number
          p_total_amount: number
        }
        Returns: Json
      }
      check_storefront_signup_email: {
        Args: { p_email: string }
        Returns: Json
      }
      clear_cart: { Args: { p_user_id: string }; Returns: boolean }
      complete_erp_store_transfer: {
        Args: { p_completed_by?: string; p_transfer_id: string }
        Returns: undefined
      }
      create_address: {
        Args: {
          p_city: string
          p_is_default?: boolean
          p_label: string
          p_latitude?: number
          p_line1: string
          p_line2: string
          p_longitude?: number
          p_phone: string
          p_pincode: string
          p_state: string
          p_user_id: string
        }
        Returns: Json
      }
      create_erp_account: {
        Args: {
          p_account_type_id: string
          p_code: string
          p_created_by?: string
          p_description?: string
          p_name: string
          p_opening_balance?: number
          p_store_id?: string
        }
        Returns: string
      }
      create_erp_account_transaction: {
        Args: {
          p_account_id: string
          p_counter_account_id?: string
          p_created_by?: string
          p_credit_amount?: number
          p_debit_amount?: number
          p_details?: string
          p_payment_type?: string
          p_reference?: string
          p_store_id: string
          p_transaction_date: string
          p_transaction_type: string
        }
        Returns: string
      }
      create_erp_credit_note: {
        Args: {
          p_created_by?: string
          p_credit_note_date: string
          p_finalize?: boolean
          p_lines: Json
          p_notes?: string
          p_reference?: string
          p_restore_stock?: boolean
          p_store_id: string
          p_user_id: string
        }
        Returns: string
      }
      create_erp_employee: {
        Args: {
          p_allowance?: number
          p_basic_salary?: number
          p_created_by?: string
          p_date_of_birth?: string | null
          p_employee_code?: string | null
          p_full_name: string
          p_id_expiry_date?: string | null
          p_id_number?: string | null
          p_is_active?: boolean
          p_joining_date: string
          p_mobile: string
          p_notes?: string | null
          p_store_id: string
        }
        Returns: string
      }
      create_erp_estimate: {
        Args: {
          p_created_by?: string
          p_discount?: number
          p_estimate_date: string
          p_lines: Json
          p_notes?: string
          p_reference?: string
          p_sales_person_id?: string
          p_store_id: string
          p_tax_inclusive?: boolean
          p_user_id: string
          p_valid_until: string
        }
        Returns: string
      }
      create_erp_expense: {
        Args: {
          p_account_id: string
          p_amount: number
          p_created_by?: string
          p_expense_date: string
          p_notes?: string
          p_paid_through_account_id?: string
          p_reference?: string
          p_store_id: string
          p_tax_mode?: string
          p_tax_percent?: number
          p_user_id?: string
          p_vendor_id?: string
        }
        Returns: string
      }
      create_erp_fixed_asset: {
        Args: {
          p_brand?: string
          p_created_by?: string
          p_details?: string
          p_maintenance_info?: string
          p_name: string
          p_paid_through_account_id?: string
          p_purchase_amount: number
          p_purchase_date?: string
          p_reference?: string
          p_serial_number?: string
          p_store_id: string
          p_tax_amount?: number
          p_tax_mode?: string
          p_vendor_id?: string
          p_warranty_details?: string
          p_warranty_expiry?: string
        }
        Returns: string
      }
      create_erp_invoice: {
        Args: {
          p_created_by?: string
          p_discount?: number
          p_due_date: string
          p_estimate_id?: string
          p_finalize?: boolean
          p_invoice_date: string
          p_lines: Json
          p_notes?: string
          p_reference?: string
          p_sales_person_id?: string
          p_store_id: string
          p_tax_inclusive?: boolean
          p_user_id: string
        }
        Returns: string
      }
      create_erp_purchase_bill: {
        Args: {
          p_batch_reference?: string
          p_created_by?: string
          p_discount?: number
          p_due_date?: string
          p_expected_delivery_date?: string
          p_finalize?: boolean
          p_grn_reference?: string
          p_landed_costs?: Json
          p_lines?: Json
          p_notes?: string
          p_physical_receipt_on_bill?: boolean
          p_po_id?: string
          p_purchase_date: string
          p_reference?: string
          p_sales_person_id?: string
          p_store_id: string
          p_vendor_bill_number?: string
          p_vendor_id: string
        }
        Returns: string
      }
      create_erp_purchase_order: {
        Args: {
          p_created_by?: string
          p_discount?: number
          p_expected_delivery_date?: string
          p_lines?: Json
          p_notes?: string
          p_po_date: string
          p_reference?: string
          p_store_id: string
          p_vendor_id: string
        }
        Returns: string
      }
      create_erp_stock_adjustment: {
        Args: {
          p_adjustment_date: string
          p_created_by?: string
          p_finalize?: boolean
          p_lines: Json
          p_note?: string
          p_store_id: string
        }
        Returns: string
      }
      create_erp_store_transfer: {
        Args: {
          p_created_by?: string
          p_from_store_id: string
          p_lines: Json
          p_note?: string
          p_request_id?: string
          p_to_store_id: string
          p_transfer_date: string
        }
        Returns: string
      }
      create_erp_transfer_request: {
        Args: {
          p_created_by?: string
          p_from_store_id: string
          p_lines: Json
          p_note?: string
          p_request_date: string
          p_submit?: boolean
          p_to_store_id: string
        }
        Returns: string
      }
      create_erp_vat_payment: {
        Args: {
          p_amount: number
          p_created_by?: string
          p_notes?: string
          p_paid_from_account_id: string
          p_payment_date: string
          p_payment_type: string
          p_reference?: string
          p_vat_return_id: string
        }
        Returns: string
      }
      create_erp_vat_return:
        | {
            Args: {
              p_created_by?: string
              p_period_end: string
              p_period_start: string
              p_store_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_created_by?: string
              p_notes?: string
              p_period_end: string
              p_period_start: string
              p_store_id: string
            }
            Returns: string
          }
      preview_erp_vat_return: {
        Args: {
          p_period_end: string
          p_period_start: string
          p_requested_by?: string
          p_store_id: string
        }
        Returns: Json
      }
      refresh_purchase_bill_landed_allocations: {
        Args: {
          p_bill_id: string
        }
        Returns: undefined
      }
      refresh_purchase_order_landed_allocations: {
        Args: {
          p_po_id: string
        }
        Returns: undefined
      }
      refresh_erp_vat_return: {
        Args: {
          p_refreshed_by?: string
          p_return_id: string
        }
        Returns: undefined
      }
      create_erp_vendor_credit: {
        Args: {
          p_created_by?: string
          p_credit_date: string
          p_finalize?: boolean
          p_lines: Json
          p_notes?: string
          p_reduce_stock?: boolean
          p_reference?: string
          p_store_id: string
          p_vendor_id: string
        }
        Returns: string
      }
      create_notification: {
        Args: {
          p_entity_id?: string
          p_entity_type?: string
          p_message: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      create_posted_journal_entry: {
        Args: {
          p_created_by?: string
          p_description: string
          p_lines: Json
          p_source_entity_id: string
          p_source_entity_type: string
          p_store_id: string
          p_transaction_date: string
        }
        Returns: string
      }
      customer_edit_order: {
        Args: { p_items: Json; p_order_id: string }
        Returns: Json
      }
      customer_has_viewed_product: {
        Args: { p_product_id: string; p_user_id: string }
        Returns: boolean
      }
      delete_address: {
        Args: { p_address_id: string; p_user_id: string }
        Returns: boolean
      }
      delete_erp_credit_note: {
        Args: { p_actor?: string; p_credit_note_id: string }
        Returns: undefined
      }
      delete_erp_salary_payment: {
        Args: { p_actor?: string; p_payment_id: string }
        Returns: undefined
      }
      delete_erp_vat_payment: {
        Args: { p_deleted_by?: string; p_payment_id: string }
        Returns: undefined
      }
      delete_erp_vendor_credit: {
        Args: { p_actor?: string; p_credit_id: string }
        Returns: undefined
      }
      delete_erp_vat_return: {
        Args: { p_deleted_by?: string; p_return_id: string }
        Returns: undefined
      }
      ensure_product_default_variant: {
        Args: { p_product_id: string }
        Returns: string
      }
      file_erp_vat_return: {
        Args: { p_filed_by?: string; p_return_id: string }
        Returns: undefined
      }
      finalize_erp_credit_note: {
        Args: {
          p_actor?: string
          p_credit_note_id: string
          p_restore_stock?: boolean
        }
        Returns: undefined
      }
      cancel_erp_purchase_receive: {
        Args: { p_actor?: string; p_receive_id: string }
        Returns: undefined
      }
      create_erp_purchase_receive: {
        Args: {
          p_allow_over_authorization?: boolean
          p_created_by?: string
          p_expected_delivery_date?: string
          p_finalize?: boolean
          p_lines?: Json
          p_notes?: string
          p_po_id?: string
          p_purchase_bill_id?: string
          p_receive_date: string
          p_reconcile_bill?: boolean
          p_reference?: string
          p_store_id: string
          p_vendor_id: string
        }
        Returns: string
      }
      finalize_erp_purchase_receive: {
        Args: {
          p_finalized_by?: string
          p_receive_id: string
          p_reconcile_bill?: boolean
        }
        Returns: undefined
      }
      reverse_erp_purchase_receive: {
        Args: { p_actor?: string; p_reason?: string; p_receive_id: string }
        Returns: string
      }
      submit_erp_po_delivery_and_finalize: {
        Args: {
          p_actor?: string
          p_idempotency_key?: string
          p_lines: Json
          p_notes?: string
          p_po_id: string
          p_receive_date?: string
        }
        Returns: Json
      }
      get_purchase_receive_adjustments: {
        Args: { p_receive_id: string }
        Returns: Json
      }
      create_vendor_credit_from_receive_adjustment: {
        Args: {
          p_actor?: string
          p_adjustment_kind?: string
          p_finalize?: boolean
          p_receive_id: string
        }
        Returns: string
      }
      finalize_erp_purchase_bill: {
        Args: { p_bill_id: string; p_finalized_by?: string }
        Returns: undefined
      }
      finalize_erp_stock_adjustment: {
        Args: { p_adjustment_id: string; p_finalized_by?: string }
        Returns: undefined
      }
      finalize_erp_vendor_credit: {
        Args: {
          p_actor?: string
          p_credit_id: string
          p_reduce_stock?: boolean
        }
        Returns: undefined
      }
      generate_invoice_for_order: {
        Args: { p_gst_number?: string; p_order_id: string }
        Returns: Json
      }
      generate_invoice_number: { Args: never; Returns: string }
      generate_erp_pay_slips: {
        Args: {
          p_created_by?: string
          p_employee_id?: string | null
          p_from_date?: string | null
          p_period_month: number
          p_period_year: number
          p_store_id: string
          p_to_date?: string | null
        }
        Returns: Json
      }
      get_account_balance: { Args: { p_account_id: string }; Returns: number }
      get_account_by_code: { Args: { p_code: string }; Returns: string }
      get_addresses_for_user: { Args: { p_user_id: string }; Returns: Json }
      get_all_movements: {
        Args: { p_limit?: number; p_offset?: number; p_type_filter?: string }
        Returns: Json
      }
      get_available_credit: { Args: { p_user_id: string }; Returns: number }
      get_cart_with_items: { Args: { p_user_id: string }; Returns: Json }
      get_default_store_id: { Args: never; Returns: string }
      get_store_stock_shortages: {
        Args: { p_store_id: string }
        Returns: {
          product_id: string
          product_name: string
          stock: number
          suggested_qty: number
        }[]
      }
      get_default_tax_rate: { Args: never; Returns: number }
      get_erp_context: { Args: { p_user_id?: string }; Returns: Json }
      get_erp_financial_dashboard: { Args: never; Returns: Json }
      get_erp_reconciliation_snapshot: { Args: never; Returns: Json }
      get_invoice_by_id: {
        Args: { p_invoice_id: string; p_user_id: string }
        Returns: Json
      }
      get_invoices_count: { Args: { p_user_id: string }; Returns: number }
      get_invoices_for_user: {
        Args: { p_limit?: number; p_offset?: number; p_user_id: string }
        Returns: Json
      }
      get_movements_count: { Args: { p_variant_id: string }; Returns: number }
      get_movements_for_variant: {
        Args: { p_limit?: number; p_offset?: number; p_variant_id: string }
        Returns: Json
      }
      get_or_create_cart: { Args: { p_user_id: string }; Returns: string }
      get_transactions_count: { Args: { p_user_id: string }; Returns: number }
      get_transactions_for_user: {
        Args: { p_limit?: number; p_offset?: number; p_user_id: string }
        Returns: Json
      }
      get_transfer_statement: {
        Args: {
          p_from_date?: string
          p_from_store_id: string
          p_to_date?: string
          p_to_store_id?: string
        }
        Returns: Json
      }
      get_variant_online_available: {
        Args: { p_variant_id: string }
        Returns: number
      }
      get_wallet_balance: { Args: { p_user_id: string }; Returns: number }
      inventory_apply_invoice_stock: {
        Args: { p_invoice_id: string; p_multiplier?: number }
        Returns: undefined
      }
      inventory_apply_order_stock: {
        Args: { p_multiplier?: number; p_order_id: string }
        Returns: undefined
      }
      inventory_apply_purchase_bill_stock: {
        Args: { p_bill_id: string; p_multiplier?: number }
        Returns: undefined
      }
      inventory_apply_vendor_credit_stock: {
        Args: { p_credit_id: string }
        Returns: undefined
      }
      is_posting_enabled: { Args: { p_event_type: string }; Returns: boolean }
      is_staff_user: { Args: { p_user_id?: string }; Returns: boolean }
      log_audit_event: {
        Args: {
          p_action: string
          p_description?: string
          p_entity_id?: string
          p_entity_type: string
          p_metadata?: Json
          p_new_data?: Json
          p_old_data?: Json
          p_store_id?: string
          p_user_id?: string
        }
        Returns: string
      }
      log_stock_movement: {
        Args: {
          p_quantity: number
          p_reason?: string
          p_reference_id?: string
          p_reference_type?: string
          p_store_id?: string
          p_transaction_price?: number
          p_transfer_store_id?: string
          p_type: string
          p_variant_id: string
        }
        Returns: string
      }
      mark_all_notifications_read: {
        Args: { p_user_id: string }
        Returns: number
      }
      mark_notification_read: {
        Args: { p_notification_id: string; p_user_id: string }
        Returns: undefined
      }
      next_erp_document_number: {
        Args: { p_document_type: string }
        Returns: string
      }
      peek_erp_document_number: {
        Args: { p_document_type: string }
        Returns: string
      }
      place_customer_order: {
        Args: { p_address_id: string; p_items: Json; p_merchant_note?: string }
        Returns: Json
      }
      post_journal_for_credit_note: {
        Args: { p_actor?: string; p_credit_note_id: string }
        Returns: string
      }
      post_journal_for_credit_note_application: {
        Args: {
          p_actor?: string
          p_amount: number
          p_credit_note_id: string
          p_invoice_id: string
        }
        Returns: string
      }
      post_journal_for_customer_payment: {
        Args: { p_actor?: string; p_payment_id: string }
        Returns: string
      }
      post_journal_for_expense: {
        Args: { p_actor?: string; p_expense_id: string }
        Returns: string
      }
      post_journal_for_invoice: {
        Args: { p_actor?: string; p_invoice_id: string }
        Returns: string
      }
      post_journal_for_purchase_bill: {
        Args: { p_actor?: string; p_bill_id: string }
        Returns: string
      }
      post_journal_for_supplier_payment: {
        Args: { p_actor?: string; p_payment_id: string }
        Returns: string
      }
      post_journal_for_vendor_credit_application: {
        Args: {
          p_actor?: string
          p_amount: number
          p_bill_id: string
          p_credit_id: string
        }
        Returns: string
      }
      recalculate_invoice_balance: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      recalculate_purchase_bill_balance: {
        Args: { p_bill_id: string }
        Returns: undefined
      }
      reconcile_central_inventory_from_stores: {
        Args: { p_variant_id?: string }
        Returns: number
      }
      record_erp_customer_payment: {
        Args: {
          p_account_id: string
          p_allocations?: Json
          p_created_by?: string
          p_is_bulk?: boolean
          p_notes?: string
          p_payment_date: string
          p_payment_mode: string
          p_reference?: string
          p_store_id: string
          p_total_amount: number
          p_user_id: string
        }
        Returns: string
      }
      record_erp_employee_opening_balances: {
        Args: {
          p_created_by?: string
          p_entry_date: string
          p_lines: Json
          p_notes?: string | null
          p_store_id: string
        }
        Returns: string
      }
      record_erp_salary_bulk_payment: {
        Args: {
          p_created_by?: string
          p_lines: Json
          p_notes?: string | null
          p_paid_through_account_id?: string | null
          p_payment_date: string
          p_payment_mode: string
          p_reference?: string | null
          p_store_id: string
        }
        Returns: Json
      }
      record_erp_salary_payment: {
        Args: {
          p_advance_recovery?: number
          p_bulk_payment_id?: string | null
          p_created_by?: string
          p_employee_id: string
          p_notes?: string | null
          p_paid_through_account_id?: string | null
          p_payment_date: string
          p_payment_mode?: string
          p_store_id: string
          p_total_paid: number
        }
        Returns: string
      }
      record_erp_supplier_bulk_payment: {
        Args: {
          p_account_id?: string
          p_bank_charges?: number
          p_bank_charges_account_id?: string
          p_created_by?: string
          p_lines: Json
          p_notes?: string
          p_payment_date: string
          p_payment_mode: string
          p_reference?: string
          p_store_id: string
        }
        Returns: Json
      }
      record_erp_supplier_payment: {
        Args: {
          p_account_id?: string
          p_allocations?: Json
          p_created_by?: string
          p_is_bulk?: boolean
          p_notes?: string
          p_payment_date: string
          p_payment_mode: string
          p_reference?: string
          p_store_id: string
          p_total_amount: number
          p_vendor_id: string
        }
        Returns: string
      }
      record_erp_transfer_bulk_payment: {
        Args: {
          p_account_id?: string
          p_allocations: Json
          p_created_by?: string
          p_notes?: string
          p_payment_date: string
          p_payment_mode: string
          p_reference?: string
        }
        Returns: Json
      }
      record_erp_transfer_payment: {
        Args: {
          p_account_id?: string
          p_amount: number
          p_created_by?: string
          p_notes?: string
          p_payment_date: string
          p_payment_mode: string
          p_reference?: string
          p_transfer_id: string
        }
        Returns: string
      }
      record_product_view: {
        Args: { p_product_id: string; p_variant_id?: string }
        Returns: boolean
      }
      release_order_inventory_reservations: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      remove_from_cart: {
        Args: { p_user_id: string; p_variant_id: string }
        Returns: boolean
      }
      require_store_access: {
        Args: { p_store_id: string; p_user_id?: string }
        Returns: undefined
      }
      set_default_address: {
        Args: { p_address_id: string; p_user_id: string }
        Returns: Json
      }
      set_store_inventory_stock: {
        Args: {
          p_stock: number
          p_store_id: string
          p_user_id?: string
          p_variant_id: string
        }
        Returns: undefined
      }
      set_user_active_store: {
        Args: { p_store_id: string; p_user_id?: string }
        Returns: Json
      }
      setup_order_fulfillments_and_reserve: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      ship_all_order_fulfillments: {
        Args: { p_actor?: string; p_order_id: string }
        Returns: undefined
      }
      ship_order_fulfillment: {
        Args: { p_actor?: string; p_fulfillment_id: string }
        Returns: undefined
      }
      store_inventory_apply_delta: {
        Args: {
          p_delta: number
          p_store_id: string
          p_update_central?: boolean
          p_user_id?: string
          p_variant_id: string
        }
        Returns: number
      }
      store_inventory_available: {
        Args: { p_store_id: string; p_variant_id: string }
        Returns: number
      }
      store_inventory_release_reservation: {
        Args: { p_quantity: number; p_store_id: string; p_variant_id: string }
        Returns: undefined
      }
      store_inventory_reserve: {
        Args: {
          p_quantity: number
          p_reference_id?: string
          p_reference_type?: string
          p_store_id: string
          p_user_id?: string
          p_variant_id: string
        }
        Returns: undefined
      }
      store_inventory_ship_reserved: {
        Args: {
          p_quantity: number
          p_reason?: string
          p_reference_id: string
          p_reference_type: string
          p_store_id: string
          p_user_id?: string
          p_variant_id: string
        }
        Returns: undefined
      }
      update_address: {
        Args: {
          p_address_id: string
          p_city: string
          p_is_default: boolean
          p_label: string
          p_latitude?: number
          p_line1: string
          p_line2: string
          p_longitude?: number
          p_phone: string
          p_pincode: string
          p_state: string
          p_user_id: string
        }
        Returns: Json
      }
      update_cart_item: {
        Args: { p_quantity: number; p_user_id: string; p_variant_id: string }
        Returns: Json
      }
      update_erp_account: {
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
      }
      update_erp_employee: {
        Args: {
          p_actor?: string
          p_allowance?: number | null
          p_basic_salary?: number | null
          p_date_of_birth?: string | null
          p_discontinuation_date?: string | null
          p_employee_code?: string | null
          p_employee_id: string
          p_full_name?: string | null
          p_id_expiry_date?: string | null
          p_id_number?: string | null
          p_is_active?: boolean | null
          p_joining_date?: string | null
          p_mobile?: string | null
          p_notes?: string | null
          p_store_id?: string | null
        }
        Returns: undefined
      }
      user_has_store_access: {
        Args: { p_store_id: string; p_user_id: string }
        Returns: boolean
      }
      wallet_credit_user: {
        Args: { p_amount: number; p_reference: string; p_user_id: string }
        Returns: number
      }
      wallet_debit: {
        Args: { p_amount: number; p_reference: string }
        Returns: number
      }
      wallet_debit_user: {
        Args: { p_amount: number; p_reference: string; p_user_id: string }
        Returns: number
      }
      wallet_top_up: {
        Args: { p_amount: number; p_reference?: string }
        Returns: number
      }
    }
    Enums: {
      user_role: "admin" | "customer" | "vendor" | "delivery" | "manager"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      user_role: ["admin", "customer", "vendor", "delivery", "manager"],
    },
  },
} as const
