import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  createAccountTransaction,
  createBankingAccount,
  createProfitWithdrawal,
  getAccountStoreBalances,
  getBankingAccount,
  listAccountTransactions,
  listBankingAccounts,
  listPaymentStatements,
  listProfitWithdrawals,
} from "@/modules/erp/services/erp-banking.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const view = url.searchParams.get("view");
  const accountId = url.searchParams.get("accountId");

  try {
    if (view === "payment-statement") {
      const result = await listPaymentStatements({
        storeId: url.searchParams.get("storeId") ?? undefined,
        accountId: url.searchParams.get("accountId") ?? undefined,
        dateFrom: url.searchParams.get("dateFrom") ?? undefined,
        dateTo: url.searchParams.get("dateTo") ?? undefined,
        search: url.searchParams.get("search") ?? undefined,
      });
      return NextResponse.json(result);
    }

    if (view === "profit-withdrawals") {
      const rows = await listProfitWithdrawals({
        storeId: url.searchParams.get("storeId") ?? undefined,
        accountId: url.searchParams.get("accountId") ?? undefined,
        dateFrom: url.searchParams.get("dateFrom") ?? undefined,
        dateTo: url.searchParams.get("dateTo") ?? undefined,
        search: url.searchParams.get("search") ?? undefined,
      });
      const total = rows.reduce((s, r) => s + r.amount, 0);
      return NextResponse.json({ data: rows, total });
    }

    if (accountId && url.searchParams.get("storeBalances") === "1") {
      const balances = await getAccountStoreBalances(accountId);
      const account = await getBankingAccount(accountId);
      return NextResponse.json({ account, storeBalances: balances });
    }

    if (accountId) {
      const transactions = await listAccountTransactions(accountId, {
        storeId: url.searchParams.get("storeId") ?? undefined,
      });
      const account = await getBankingAccount(accountId);
      const storeBalances = await getAccountStoreBalances(accountId);
      return NextResponse.json({ account, data: transactions, storeBalances });
    }

    const accounts = await listBankingAccounts(url.searchParams.get("storeId") ?? undefined);
    return NextResponse.json({ data: accounts });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to list banking data";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();

    if (body.kind === "account") {
      const id = await createBankingAccount({
        accountKind: body.accountKind,
        name: body.name,
        code: body.code,
        description: body.description,
        storeId: body.storeId,
        openingBalance: body.openingBalance,
      });
      return NextResponse.json({ id }, { status: 201 });
    }

    if (body.kind === "profit_withdrawal") {
      const id = await createProfitWithdrawal(body);
      return NextResponse.json({ id }, { status: 201 });
    }

    const id = await createAccountTransaction({
      accountId: body.accountId,
      storeId: body.storeId,
      transactionDate: body.transactionDate,
      transactionType: body.transactionType,
      debitAmount: body.debitAmount,
      creditAmount: body.creditAmount,
      counterAccountId: body.counterAccountId,
      details: body.details,
      paymentType: body.paymentType,
      reference: body.reference,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create banking record";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
