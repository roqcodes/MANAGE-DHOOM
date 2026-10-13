import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..", "src");
const detailEarly =
  /if \(isPending && data === undefined\) return <AdminPageSkeleton \/>;/g;
const replacement = `if (isPending && data === undefined) {
    return (
      <AdminPageLayout>
        <AdminDetailBodySkeleton />
      </AdminPageLayout>
    );
  }`;

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (p.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

for (const f of walk(ROOT)) {
  let c = fs.readFileSync(f, "utf8");
  if (!detailEarly.test(c)) continue;
  c = c.replace(detailEarly, replacement);
  c = c.replace(
    /import \{ AdminPageSkeleton \} from "@\/modules\/admin\/components\/admin-page-skeleton";/,
    'import { AdminDetailBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";',
  );
  if (c.includes("<AdminPageLayout>") && !/AdminPageLayout/.test(c.split("from")[0])) {
    c = c.replace(
      /import \{([^}]+)\} from "@\/modules\/admin\/ui";/,
      (m, inner) => {
        if (inner.includes("AdminPageLayout")) return m;
        return `import {${inner}, AdminPageLayout } from "@/modules/admin/ui";`;
      },
    );
  }
  fs.writeFileSync(f, c);
  console.log("fixed", path.relative(ROOT, f));
}
