import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..", "src");

const fixes = [
  {
    file: "modules/admin/views/banking/cash-accounts-list-view.tsx",
    removeInsideMemo: /const initialLoading = loading;\n/,
    addAfter: "  }, [activeStoreId]);\n",
    add: "  const initialLoading = loading && accounts.length === 0;\n\n",
  },
  {
    file: "modules/admin/views/finance/journal-entries-list-view.tsx",
    removeInsideMemo: /  const initialLoading = loading && rows\.length === 0;\n/,
    addAfter: "  }, [activeStoreId, reloadToken]);\n",
    add: "  const initialLoading = loading && rows.length === 0;\n\n",
  },
  {
    file: "modules/admin/views/purchasing/landed-costs-list-view.tsx",
    removeInsideMemo: /  const initialLoading = loading;\n/,
    addAfter: "  }, []);\n",
    add: "  const initialLoading = loading && rows.length === 0;\n\n",
  },
  {
    file: "modules/admin/views/finance/vat-returns-list-view.tsx",
    removeInsideMemo: /  const initialLoading = loading && rows\.length === 0;\n\n  return \(\n    <Badge className="border-amber-200/,
    removeReplace:
      '  return (\n    <Badge className="border-amber-200',
    addAfter: "  }, [page, storeId, debouncedSearch, activeStoreId, reloadToken]);\n",
    add: "  const initialLoading = loading && rows.length === 0;\n\n",
  },
  {
    file: "modules/admin/views/hr/employee-opening-balances-views.tsx",
    addAfter: "  }, [page, storeId, debouncedSearch, activeStoreId, reloadToken]);\n",
    add: "  const initialLoading = loading && rows.length === 0;\n\n",
  },
];

for (const fix of fixes) {
  const p = path.join(ROOT, fix.file);
  let c = fs.readFileSync(p, "utf8");
  if (fix.removeInsideMemo) {
    if (fix.removeReplace) {
      c = c.replace(fix.removeInsideMemo, fix.removeReplace);
    } else {
      c = c.replace(fix.removeInsideMemo, "");
    }
  }
  if (fix.add && !c.includes("const initialLoading = loading")) {
    // allow re-add if missing in component
  }
  if (fix.addAfter && fix.add) {
    const needle = fix.addAfter;
    if (c.includes(needle) && !c.includes(fix.add.trim())) {
      const idx = c.indexOf(needle);
      c = c.slice(0, idx + needle.length) + fix.add + c.slice(idx + needle.length);
    } else if (
      c.includes(needle) &&
      c.includes("isLoading={initialLoading}") &&
      !c.match(/export function[\s\S]*?const initialLoading = loading/)
    ) {
      const idx = c.indexOf(needle);
      c = c.slice(0, idx + needle.length) + fix.add + c.slice(idx + needle.length);
    }
  }
  fs.writeFileSync(p, c);
  console.log("fixed", fix.file);
}

// Detail views: add AdminPageLayout import
const detailFiles = [
  "modules/admin/views/admin-customer-detail-view.tsx",
  "modules/admin/views/admin-order-detail-view.tsx",
  "modules/admin/views/admin-product-detail-view.tsx",
  "modules/admin/views/admin-vendor-detail-view.tsx",
  "modules/admin/views/sales/sales-order-detail-view.tsx",
  "modules/orders/components/admin-order-invoice-page.tsx",
  "modules/purchase-orders/components/admin-purchase-order-invoice-page.tsx",
];

for (const rel of detailFiles) {
  const p = path.join(ROOT, rel);
  let c = fs.readFileSync(p, "utf8");
  if (c.includes("<AdminPageLayout>") && !c.includes("AdminPageLayout")) {
    // already has import with different pattern
  }
  if (c.includes("<AdminPageLayout>") && !/AdminPageLayout/.test(c.split("\n").slice(0, 30).join("\n"))) {
    if (c.includes('from "@/modules/admin/ui"')) {
      c = c.replace(
        /import \{([^}]+)\} from "@\/modules\/admin\/ui";/,
        (m, inner) => {
          if (inner.includes("AdminPageLayout")) return m;
          return `import {${inner}, AdminPageLayout } from "@/modules/admin/ui";`;
        },
      );
    } else {
      c = `import { AdminPageLayout } from "@/modules/admin/ui";\n` + c;
    }
    fs.writeFileSync(p, c);
    console.log("layout import", rel);
  }
}
