import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..", "src");

const CATALOG_VIEW_PATCHES = [
  {
    file: "modules/admin/views/admin-customers-view.tsx",
    remove: [
      /  if \(isPending && !data\) return <AdminPageSkeleton \/>;\n/,
      /  if \(!data\) return <AdminPageSkeleton \/>;\n/,
    ],
    insertAfter: "  });\n",
    insert: `  const initialLoading = isPending && !data;\n`,
    replaceImport:
      'import { EMPTY_CUSTOMER_STATS } from "@/modules/admin/lib/catalog-loading-defaults";\n',
    removeImport: /import \{ AdminPageSkeleton \} from "@\/modules\/admin\/components\/admin-page-skeleton";\n/,
    panelReplace: [
      [
        `<CustomersPanel\n        users={data.data}\n        total={data.total}\n        page={page}\n        stats={data.stats}`,
        `<CustomersPanel\n        initialLoading={initialLoading}\n        users={data?.data ?? []}\n        total={data?.total ?? 0}\n        page={page}\n        stats={data?.stats ?? EMPTY_CUSTOMER_STATS}`,
      ],
    ],
  },
  {
    file: "modules/admin/views/admin-vendors-view.tsx",
    remove: [
      /  if \(isPending && !data\) return <AdminPageSkeleton \/>;\n/,
      /  if \(!data\) return <AdminPageSkeleton \/>;\n/,
    ],
    insertAfter: "  });\n",
    insert: `  const initialLoading = isPending && !data;\n`,
    replaceImport:
      'import { EMPTY_VENDOR_CATALOG_STATS } from "@/modules/admin/lib/catalog-loading-defaults";\n',
    removeImport: /import \{ AdminPageSkeleton \} from "@\/modules\/admin\/components\/admin-page-skeleton";\n/,
    panelReplace: [
      [
        /stats=\{data\.stats\}/,
        "initialLoading={initialLoading}\n        stats={data?.stats ?? EMPTY_VENDOR_CATALOG_STATS}",
      ],
      [/vendors=\{data\.data\}/, "vendors={data?.data ?? []}"],
      [/total=\{data\.total\}/, "total={data?.total ?? 0}"],
    ],
  },
  {
    file: "modules/admin/views/admin-products-view.tsx",
    remove: [
      /  if \(isPending && !data\) return <AdminPageSkeleton \/>;\n/,
      /  if \(!data\) return <AdminPageSkeleton \/>;\n/,
    ],
    insertAfter: "  });\n",
    insert: `  const initialLoading = isPending && !data;\n`,
    replaceImport:
      'import { EMPTY_PRODUCT_CATALOG_STATS } from "@/modules/admin/lib/catalog-loading-defaults";\n',
    removeImport: /import \{ AdminPageSkeleton \} from "@\/modules\/admin\/components\/admin-page-skeleton";\n/,
    panelReplace: [
      [
        `<ProductsPanel`,
        `<ProductsPanel\n      initialLoading={initialLoading}`,
      ],
      [/products=\{data\.data\}/, "products={data?.data ?? []}"],
      [/categories=\{data\.categories\}/, "categories={data?.categories ?? []}"],
      [/brands=\{data\.brands \?\? \[\]\}/, "brands={data?.brands ?? []}"],
      [/total=\{data\.total\}/, "total={data?.total ?? 0}"],
      [/page=\{data\.page\}/, "page={data?.page ?? page}"],
      [
        /stats=\{data\.stats\}/,
        "stats={data?.stats ?? EMPTY_PRODUCT_CATALOG_STATS}",
      ],
    ],
  },
];

function applyPatch(spec) {
  const filePath = path.join(ROOT, spec.file);
  let content = fs.readFileSync(filePath, "utf8");
  for (const re of spec.remove) {
    content = content.replace(re, "");
  }
  if (spec.removeImport) content = content.replace(spec.removeImport, "");
  if (spec.replaceImport && !content.includes(spec.replaceImport.trim())) {
    content = spec.replaceImport + content;
  }
  if (spec.insert && !content.includes("const initialLoading")) {
    const idx = content.indexOf(spec.insertAfter);
    if (idx === -1) {
      console.warn("skip insert", spec.file);
      return;
    }
    content =
      content.slice(0, idx + spec.insertAfter.length) +
      spec.insert +
      content.slice(idx + spec.insertAfter.length);
  }
  for (const [from, to] of spec.panelReplace) {
    if (typeof from === "string") content = content.replace(from, to);
    else content = content.replace(from, to);
  }
  fs.writeFileSync(filePath, content);
  console.log("patched", spec.file);
}

for (const spec of CATALOG_VIEW_PATCHES) applyPatch(spec);
