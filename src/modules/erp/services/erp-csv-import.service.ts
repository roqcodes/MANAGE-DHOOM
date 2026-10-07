import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { csvRowsToObjects, parseCsvText } from "@/lib/csv/csv-utils";
import type { CsvImportEntity } from "@/modules/erp/lib/csv-import-configs";
import { resolveErpStoreId } from "@/modules/erp/services/store-context.service";
import { createExpense } from "@/modules/erp/services/erp-expenses.service";
import { createPurchaseBill } from "@/modules/erp/services/erp-purchase-bills.service";
import { createAccountTransaction } from "@/modules/erp/services/erp-banking.service";

type ImportResult = { imported: number; errors: string[] };

export async function importCsvEntity(
  entity: CsvImportEntity,
  csvText: string,
  storeId?: string,
): Promise<ImportResult> {
  await requireAdminOrManagerProfile();
  const { headers, rows } = parseCsvText(csvText);
  const objects = csvRowsToObjects(headers, rows);
  if (objects.length === 0) return { imported: 0, errors: ["No data rows found in CSV."] };

  switch (entity) {
    case "products":
      return importProducts(objects);
    case "customers":
      return importCustomers(objects);
    case "vendors":
      return importVendors(objects);
    case "expenses":
      return importExpenses(objects, storeId);
    case "purchase_bills":
      return importPurchaseBills(objects, storeId);
    case "banking_transactions":
      return importBankingTransactions(objects, storeId);
    default:
      return { imported: 0, errors: ["Unknown import type."] };
  }
}

async function importProducts(rows: Record<string, string>[]): Promise<ImportResult> {
  const supabase = await createSupabaseServerClient();
  const errors: string[] = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = row.name?.trim();
    if (!name) {
      errors.push(`Row ${i + 2}: name is required.`);
      continue;
    }

    const productCode = row.sku?.trim() || row.product_code?.trim() || null;
    const basePrice = parseFloat(row.base_price || row.price) || 0;
    const gstRate = parseFloat(row.gst_rate || row.tax_rate_percent) || 0;
    const isActive = row.is_active?.toLowerCase() !== "false";

    let categoryId: string | null = null;
    if (row.category?.trim()) {
      const { data: cat } = await supabase
        .from("categories")
        .select("id")
        .ilike("name", row.category.trim())
        .maybeSingle();
      categoryId = cat?.id ?? null;
    }

    let brandId: string | null = null;
    if (row.brand?.trim()) {
      const { data: brand } = await supabase
        .from("brands")
        .select("id")
        .ilike("name", row.brand.trim())
        .maybeSingle();
      brandId = brand?.id ?? null;
    }

    let productId: string | null = null;
    if (productCode) {
      const { data: existing } = await supabase
        .from("product_variants")
        .select("product_id")
        .eq("product_code", productCode)
        .maybeSingle();
      productId = existing?.product_id ?? null;
    }

    if (productId) {
      const { error } = await supabase
        .from("products")
        .update({
          name,
          description: row.description?.trim() || null,
          category_id: categoryId,
          brand_id: brandId,
          is_active: isActive,
        })
        .eq("id", productId);
      if (error) {
        errors.push(`Row ${i + 2}: ${error.message}`);
        continue;
      }
    } else {
      const { data: created, error } = await supabase
        .from("products")
        .insert({
          name,
          description: row.description?.trim() || null,
          category_id: categoryId,
          brand_id: brandId,
          is_active: isActive,
        })
        .select("id")
        .single();
      if (error || !created) {
        errors.push(`Row ${i + 2}: ${error?.message ?? "Failed to create product"}`);
        continue;
      }
      productId = created.id;

      const { error: variantError } = await supabase.from("product_variants").insert({
        product_id: productId,
        product_code: productCode ?? `SKU-${Date.now()}-${i}`,
        price: basePrice,
        tax_rate_percent: gstRate,
        name,
      } as never);
      if (variantError) {
        errors.push(`Row ${i + 2}: ${variantError.message}`);
        continue;
      }
    }
    imported++;
  }

  return { imported, errors };
}

async function importCustomers(rows: Record<string, string>[]): Promise<ImportResult> {
  const supabase = await createSupabaseServerClient();
  const errors: string[] = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const email = row.email?.trim().toLowerCase();
    if (!email) {
      errors.push(`Row ${i + 2}: email is required.`);
      continue;
    }

    const payload = {
      name: row.name?.trim() || email,
      email,
      phone: row.phone?.trim() || null,
      company_name: row.company_name?.trim() || null,
      trn: row.trn?.trim() || null,
      role: "customer" as const,
      is_verified: true,
    };
    const creditLimit = parseFloat(row.credit_limit) || 0;

    const { data: existing } = await supabase.from("users").select("id").eq("email", email).maybeSingle();
    let userId = existing?.id;
    if (existing) {
      const { error } = await supabase.from("users").update(payload).eq("id", existing.id);
      if (error) errors.push(`Row ${i + 2}: ${error.message}`);
      else imported++;
    } else {
      const { data: created, error } = await supabase.from("users").insert(payload).select("id").single();
      if (error || !created) errors.push(`Row ${i + 2}: ${error?.message ?? "Failed"}`);
      else {
        imported++;
        userId = created.id;
      }
    }

    if (userId && creditLimit > 0) {
      await supabase.from("customer_credit_limits").upsert({
        user_id: userId,
        credit_limit: creditLimit,
      });
    }
  }

  return { imported, errors };
}

async function importVendors(rows: Record<string, string>[]): Promise<ImportResult> {
  const supabase = await createSupabaseServerClient();
  const errors: string[] = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = row.name?.trim();
    if (!name) {
      errors.push(`Row ${i + 2}: name is required.`);
      continue;
    }

    const email = row.email?.trim().toLowerCase() || null;
    const payload = {
      name,
      email,
      phone: row.phone?.trim() || null,
      trn: row.trn?.trim() || null,
      is_active: true,
    } as const;

    if (email) {
      const { data: existing } = await supabase.from("vendors").select("id").eq("email", email).maybeSingle();
      if (existing) {
        const { error } = await supabase.from("vendors").update(payload).eq("id", existing.id);
        if (error) errors.push(`Row ${i + 2}: ${error.message}`);
        else imported++;
        continue;
      }
    }

    const { error } = await supabase.from("vendors").insert(payload);
    if (error) errors.push(`Row ${i + 2}: ${error.message}`);
    else imported++;
  }

  return { imported, errors };
}

async function importExpenses(rows: Record<string, string>[], storeId?: string): Promise<ImportResult> {
  const resolvedStoreId = await resolveErpStoreId(storeId);
  if (!resolvedStoreId) return { imported: 0, errors: ["Store is required for expense import."] };

  const supabase = await createSupabaseServerClient();
  const errors: string[] = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const accountCode = row.account_code?.trim();
      const paidCode = row.paid_through_code?.trim();
      if (!accountCode || !paidCode) throw new Error("account_code and paid_through_code are required.");

      const { data: account } = await supabase
        .from("accounts")
        .select("id")
        .eq("code", accountCode)
        .maybeSingle();
      const { data: paid } = await supabase
        .from("accounts")
        .select("id")
        .eq("code", paidCode)
        .maybeSingle();
      if (!account?.id) throw new Error(`Expense account ${accountCode} not found.`);
      if (!paid?.id) throw new Error(`Paid-through account ${paidCode} not found.`);

      let vendorId: string | null = null;
      if (row.vendor_email?.trim()) {
        const { data: vendor } = await supabase
          .from("vendors")
          .select("id")
          .eq("email", row.vendor_email.trim().toLowerCase())
          .maybeSingle();
        vendorId = vendor?.id ?? null;
      }

      await createExpense({
        storeId: resolvedStoreId,
        expenseDate: row.expense_date?.trim() || new Date().toISOString().slice(0, 10),
        accountId: account.id,
        amount: parseFloat(row.amount) || 0,
        taxMode: row.tax_mode === "inclusive" ? "inclusive" : "exclusive",
        taxPercent: parseFloat(row.tax_percent) || 0,
        paidThroughAccountId: paid.id,
        vendorId,
        reference: row.reference?.trim() || undefined,
        notes: row.notes?.trim() || undefined,
      });
      imported++;
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : "Failed"}`);
    }
  }

  return { imported, errors };
}

async function importPurchaseBills(rows: Record<string, string>[], storeId?: string): Promise<ImportResult> {
  const resolvedStoreId = await resolveErpStoreId(storeId);
  if (!resolvedStoreId) return { imported: 0, errors: ["Store is required."] };

  const supabase = await createSupabaseServerClient();
  const errors: string[] = [];
  let imported = 0;

  const grouped = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const key = row.bill_number?.trim() || `ROW-${imported}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  let billIndex = 0;
  for (const [, billRows] of grouped) {
    billIndex++;
    const first = billRows[0];
    try {
      const vendorEmail = first.vendor_email?.trim().toLowerCase();
      if (!vendorEmail) throw new Error("vendor_email is required.");

      const { data: vendor } = await supabase.from("vendors").select("id").eq("email", vendorEmail).maybeSingle();
      if (!vendor?.id) throw new Error(`Vendor ${vendorEmail} not found.`);

      const lines = billRows.map((r) => ({
        productName: r.product_name?.trim() || "Imported item",
        quantity: parseFloat(r.quantity) || 1,
        purchasePrice: parseFloat(r.unit_price) || 0,
        taxRatePercent: parseFloat(r.tax_rate) || 0,
      }));

      await createPurchaseBill({
        vendorId: vendor.id,
        storeId: resolvedStoreId,
        purchaseDate: first.bill_date || new Date().toISOString().slice(0, 10),
        dueDate: first.due_date || first.bill_date || new Date().toISOString().slice(0, 10),
        lines,
        reference: first.reference?.trim() || undefined,
        finalize: true,
      });
      imported += billRows.length;
    } catch (err) {
      errors.push(`Bill group ${billIndex}: ${err instanceof Error ? err.message : "Failed"}`);
    }
  }

  return { imported, errors };
}

async function importBankingTransactions(
  rows: Record<string, string>[],
  storeId?: string,
): Promise<ImportResult> {
  const resolvedStoreId = await resolveErpStoreId(storeId);
  if (!resolvedStoreId) return { imported: 0, errors: ["Store is required."] };

  const supabase = await createSupabaseServerClient();
  const errors: string[] = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const code = row.account_code?.trim();
      if (!code) throw new Error("account_code is required.");

      const { data: account } = await supabase.from("accounts").select("id").eq("code", code).maybeSingle();
      if (!account?.id) throw new Error(`Account ${code} not found.`);

      const amount = parseFloat(row.amount) || 0;
      if (amount <= 0) throw new Error("amount must be positive.");

      const type = row.type?.trim().toLowerCase();
      const isDeposit = type === "deposit" || type === "credit";
      const isWithdrawal = type === "withdrawal" || type === "debit";
      if (!isDeposit && !isWithdrawal) throw new Error("type must be deposit or withdrawal.");

      await createAccountTransaction({
        accountId: account.id,
        storeId: resolvedStoreId,
        transactionDate: row.transaction_date || new Date().toISOString().slice(0, 10),
        transactionType: isDeposit ? "deposit" : "withdrawal",
        debitAmount: isDeposit ? amount : 0,
        creditAmount: isWithdrawal ? amount : 0,
        reference: row.reference?.trim() || undefined,
        details: row.notes?.trim() || undefined,
      });
      imported++;
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : "Failed"}`);
    }
  }

  return { imported, errors };
}
