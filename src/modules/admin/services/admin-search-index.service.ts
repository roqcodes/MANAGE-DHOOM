import "server-only";

import { format } from "date-fns";

import { formatCurrency } from "@/lib/format-currency";
import { erpShortCode, formatErpDocRef } from "@/lib/erp-document-ref";
import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { getAppSettings } from "@/modules/settings/services/app-settings.service";
import type {
  AdminSearchBadge,
  AdminSearchBadgeTone,
  AdminSearchIndexItem,
  AdminSearchIndexResponse,
} from "@/modules/admin/types/admin-search";
import { CUSTOMER_ROLE_OR_FILTER } from "@/modules/customers/lib/customer-query";

const FETCH_LIMIT = 5000;

function formatMoney(n: number | null | undefined, settings: Parameters<typeof formatCurrency>[2]) {
  return formatCurrency(Number(n ?? 0), { maximumFractionDigits: 0 }, settings);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  try {
    return format(new Date(value), "d MMM yyyy");
  } catch {
    return "";
  }
}

function titleCaseStatus(value: string | null | undefined): string {
  if (!value) return "Unknown";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fulfillmentBadgeTone(status: string): AdminSearchBadgeTone {
  if (status === "delivered" || status === "shipped") return "success";
  if (status === "cancelled") return "muted";
  if (status === "pending" || status === "processing") return "warning";
  return "info";
}

function paymentBadgeTone(status: string | null | undefined): AdminSearchBadgeTone {
  if (status === "paid") return "success";
  if (status === "refunded") return "danger";
  if (status === "not_required") return "info";
  return "warning";
}

function activeBadgeTone(isActive: boolean): AdminSearchBadgeTone {
  return isActive ? "success" : "muted";
}

function stockBadgeTone(stock: number): AdminSearchBadgeTone {
  if (stock <= 0) return "danger";
  if (stock <= 5) return "warning";
  return "success";
}

function categoryImageUrl(row: {
  image_url?: string | null;
  thumbnail_url?: string | null;
}): string | undefined {
  const url = row.image_url?.trim() || row.thumbnail_url?.trim();
  return url || undefined;
}

function buildSearchText(...parts: (string | number | null | undefined)[]): string {
  return parts
    .filter((part) => part != null && String(part).trim().length > 0)
    .join(" ")
    .toLowerCase();
}

function pushItem(
  items: AdminSearchIndexItem[],
  item: AdminSearchIndexItem,
) {
  items.push(item);
}

export async function buildAdminSearchIndex(): Promise<AdminSearchIndexResponse> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const currencySettings = await getAppSettings();

  const [
    ordersRes,
    purchaseOrdersRes,
    productsRes,
    customersRes,
    vendorsRes,
    variantsRes,
    categoriesRes,
    staffRes,
    orderItemsRes,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id,status,payment_status,total_amount,created_at,customer_name,phone,merchant_note,users:users!orders_user_fkey(name,email,phone)",
      )
      .order("created_at", { ascending: false })
      .limit(FETCH_LIMIT),
    supabase
      .from("purchase_orders")
      .select("id,status,total_amount,created_at,vendors(name)")
      .order("created_at", { ascending: false })
      .limit(FETCH_LIMIT),
    supabase
      .from("products")
      .select("id,name,description,is_active,created_at,image_url,categories(name)")
      .order("created_at", { ascending: false })
      .limit(FETCH_LIMIT),
    supabase
      .from("users")
      .select("id,name,email,phone,is_verified,created_at")
      .or(CUSTOMER_ROLE_OR_FILTER)
      .order("created_at", { ascending: false })
      .limit(FETCH_LIMIT),
    supabase
      .from("vendors")
      .select("id,name,contact,is_active,created_at")
      .order("created_at", { ascending: false })
      .limit(FETCH_LIMIT),
    supabase
      .from("product_variants")
      .select("id,name,price,created_at,products(name),inventory(stock)")
      .order("created_at", { ascending: false })
      .limit(FETCH_LIMIT),
    supabase
      .from("categories")
      .select("id,name,slug,description,is_active,image_url,thumbnail_url")
      .order("name", { ascending: true })
      .limit(FETCH_LIMIT),
    supabase
      .from("users")
      .select("id,name,email,phone,role,is_verified,created_at")
      .or("role.eq.admin,role.eq.manager,role.eq.vendor,role.eq.delivery")
      .order("created_at", { ascending: false })
      .limit(FETCH_LIMIT),
    supabase
      .from("order_items")
      .select("id,order_id,product_name,quantity")
      .order("id", { ascending: false })
      .limit(FETCH_LIMIT),
  ]);

  const items: AdminSearchIndexItem[] = [];
  const counts: Record<string, number> = {};
  const orderProductNames = new Map<string, string[]>();

  for (const row of orderItemsRes.data ?? []) {
    const orderId = row.order_id as string | null;
    const productName = row.product_name as string | null;
    if (!orderId || !productName) continue;
    const list = orderProductNames.get(orderId) ?? [];
    if (!list.includes(productName)) list.push(productName);
    orderProductNames.set(orderId, list);
  }

  for (const row of ordersRes.data ?? []) {
    const users = row.users as {
      name?: string | null;
      email?: string | null;
      phone?: string | null;
    } | null;
    const customer = row.customer_name ?? users?.name ?? users?.email ?? "Guest";
    const ref = erpShortCode(row.id as string);
    const lineItems = orderProductNames.get(row.id as string) ?? [];
    const status = row.status as string;
    const paymentStatus = row.payment_status as string | null;
    const badges: AdminSearchBadge[] = [
      {
        label: titleCaseStatus(status),
        tone: fulfillmentBadgeTone(status),
      },
    ];
    if (paymentStatus) {
      badges.push({
        label: titleCaseStatus(paymentStatus),
        tone: paymentBadgeTone(paymentStatus),
      });
    }

    pushItem(items, {
      id: row.id as string,
      group: "orders",
      ref: `#${ref}`,
      title: customer,
      subtitle: [formatMoney(row.total_amount as number, currencySettings), formatDate(row.created_at as string)]
        .filter(Boolean)
        .join(" · "),
      badges,
      meta: lineItems.slice(0, 3).join(", ") || users?.email || row.phone || undefined,
      href: `/admin/orders/${row.id}`,
      searchText: buildSearchText(
        ref,
        row.id,
        customer,
        row.customer_name,
        row.phone,
        users?.name,
        users?.email,
        users?.phone,
        row.status,
        row.payment_status,
        row.merchant_note,
        ...lineItems,
      ),
    });
  }

  for (const row of purchaseOrdersRes.data ?? []) {
    const vendor = (row.vendors as { name?: string | null } | null)?.name ?? "Unknown vendor";
    const poRef = formatErpDocRef("PO", row.id as string);
    const status = row.status as string;

    pushItem(items, {
      id: row.id as string,
      group: "purchase_orders",
      ref: poRef,
      title: vendor,
      subtitle: [formatMoney(row.total_amount as number, currencySettings), formatDate(row.created_at as string)]
        .filter(Boolean)
        .join(" · "),
      badges: [{ label: titleCaseStatus(status), tone: fulfillmentBadgeTone(status) }],
      href: `/admin/purchase-orders/${row.id}`,
      searchText: buildSearchText(poRef, row.id, vendor, row.status, "purchase order", "po"),
    });
  }

  for (const row of productsRes.data ?? []) {
    const category = (row.categories as { name?: string | null } | null)?.name;
    const name = row.name as string;
    const isActive = Boolean(row.is_active);

    pushItem(items, {
      id: row.id as string,
      group: "products",
      title: name,
      subtitle: [category ?? "Uncategorized", formatDate(row.created_at as string)]
        .filter(Boolean)
        .join(" · "),
      thumbnailUrl: (row.image_url as string | null)?.trim() || undefined,
      badges: [{ label: isActive ? "Active" : "Inactive", tone: activeBadgeTone(isActive) }],
      meta: (row.description as string | null)?.slice(0, 100) || undefined,
      href: `/admin/products/${row.id}`,
      searchText: buildSearchText(
        row.id,
        erpShortCode(row.id as string),
        name,
        row.description,
        category,
        row.is_active ? "active" : "inactive",
      ),
    });
  }

  for (const row of variantsRes.data ?? []) {
    const product = (row.products as { name?: string | null } | null)?.name ?? "Product";
    const variantName = (row.name as string | null) ?? "Default";
    const stockRow = Array.isArray(row.inventory) ? row.inventory[0] : row.inventory;
    const stock = (stockRow as { stock?: number | null } | null)?.stock ?? 0;
    const sku = erpShortCode(row.id as string);

    pushItem(items, {
      id: row.id as string,
      group: "inventory",
      ref: `SKU ${sku}`,
      title: `${product} · ${variantName}`,
      subtitle: formatMoney(row.price as number, currencySettings),
      badges: [{ label: `${stock} in stock`, tone: stockBadgeTone(stock) }],
      href: "/admin/inventory",
      searchText: buildSearchText(
        row.id,
        sku,
        product,
        variantName,
        stock,
        row.price,
        "inventory",
        "stock",
      ),
    });
  }

  for (const row of customersRes.data ?? []) {
    const title = (row.name as string | null) ?? (row.email as string | null) ?? "Customer";

    pushItem(items, {
      id: row.id as string,
      group: "customers",
      title,
      subtitle: [row.email, row.phone, formatDate(row.created_at as string)]
        .filter(Boolean)
        .join(" · "),
      badges: [
        {
          label: row.is_verified ? "Verified" : "Unverified",
          tone: row.is_verified ? "success" : "muted",
        },
      ],
      href: `/admin/customers/${row.id}`,
      searchText: buildSearchText(
        row.id,
        erpShortCode(row.id as string),
        row.name,
        row.email,
        row.phone,
        "customer",
      ),
    });
  }

  for (const row of vendorsRes.data ?? []) {
    const isActive = Boolean(row.is_active);

    pushItem(items, {
      id: row.id as string,
      group: "vendors",
      title: row.name as string,
      subtitle: [row.contact, formatDate(row.created_at as string)].filter(Boolean).join(" · "),
      badges: [{ label: isActive ? "Active" : "Inactive", tone: activeBadgeTone(isActive) }],
      href: `/admin/vendors/${row.id}`,
      searchText: buildSearchText(
        row.id,
        erpShortCode(row.id as string),
        row.name,
        row.contact,
        "vendor",
        "supplier",
      ),
    });
  }

  for (const row of categoriesRes.data ?? []) {
    const isActive = Boolean(row.is_active);

    pushItem(items, {
      id: row.id as string,
      group: "categories",
      title: row.name as string,
      subtitle: row.slug as string,
      thumbnailUrl: categoryImageUrl(row),
      badges: [{ label: isActive ? "Active" : "Inactive", tone: activeBadgeTone(isActive) }],
      href: "/admin/categories",
      searchText: buildSearchText(row.id, row.name, row.slug, row.description, "category"),
    });
  }

  for (const row of staffRes.data ?? []) {
    pushItem(items, {
      id: `staff-${row.id}`,
      group: "team",
      title: (row.name as string | null) ?? (row.email as string | null) ?? "Team member",
      subtitle: [row.email, row.phone].filter(Boolean).join(" · "),
      badges: [
        {
          label: titleCaseStatus(row.role as string),
          tone: "info",
        },
        {
          label: row.is_verified ? "Verified" : "Unverified",
          tone: row.is_verified ? "success" : "muted",
        },
      ],
      href: "/admin/users",
      searchText: buildSearchText(row.id, row.name, row.email, row.phone, row.role, "team", "staff"),
    });
  }

  for (const item of items) {
    counts[item.group] = (counts[item.group] ?? 0) + 1;
  }

  return {
    items,
    builtAt: new Date().toISOString(),
    counts,
  };
}
