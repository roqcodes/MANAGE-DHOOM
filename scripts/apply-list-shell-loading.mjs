/**
 * One-off codemod: stop full-page AdminPageSkeleton on ERP list views.
 * Keeps AdminPageLayout/header; uses AdminListCard isLoading + table row skeletons.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..", "src");

const EARLY_RETURN_PATTERNS = [
  /^\s*if \(isPending && !data\) return <AdminPageSkeleton \/>;\s*\n/m,
  /^\s*if \(loading && rows\.length === 0\) return <AdminPageSkeleton \/>;\s*\n/m,
  /^\s*if \(loading && !rows\.length\) return <AdminPageSkeleton \/>;\s*\n/m,
  /^\s*if \(loading\) return <AdminPageSkeleton \/>;\s*\n/m,
];

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (p.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

function inferInitialLoadingExpr(content, removedLine) {
  if (removedLine?.includes("isPending && !data")) return "isPending && !data";
  if (removedLine?.includes("loading && rows.length === 0"))
    return "loading && rows.length === 0";
  if (removedLine?.includes("loading && !rows.length")) return "loading && !rows.length";
  if (removedLine?.includes("if (loading)")) return "loading";
  return null;
}

function patchFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  if (!content.includes("AdminPageSkeleton")) return false;
  if (!content.includes("AdminListCard")) return false;

  let removedLine = null;
  for (const re of EARLY_RETURN_PATTERNS) {
    const m = content.match(re);
    if (m) {
      removedLine = m[0].trim();
      content = content.replace(re, "");
      break;
    }
  }
  if (!removedLine) return false;

  const expr = inferInitialLoadingExpr(content, removedLine);
  if (!expr) return false;

  if (!content.includes("const initialLoading = ")) {
    const hookNeedle = /const (?:rows|total|filtered|sorted) =/;
    const insertAt = content.search(hookNeedle);
    if (insertAt === -1) {
      const returnIdx = content.indexOf("\n  return (");
      if (returnIdx === -1) return false;
      content =
        content.slice(0, returnIdx) +
        `\n  const initialLoading = ${expr};\n` +
        content.slice(returnIdx);
    } else {
      const lineEnd = content.indexOf("\n", insertAt);
      content =
        content.slice(0, lineEnd + 1) +
        `  const initialLoading = ${expr};\n` +
        content.slice(lineEnd + 1);
    }
  }

  if (content.includes("<AdminListCard") && !content.includes("isLoading={initialLoading}")) {
    content = content.replace(
      /<AdminListCard(\s)/,
      "<AdminListCard isLoading={initialLoading}$1",
    );
    content = content.replace(
      /isEmpty=\{([^}]+)\}/g,
      (match, inner) => {
        if (inner.includes("initialLoading")) return match;
        return `isEmpty={!initialLoading && (${inner.trim()})}`;
      },
    );
  }

  if (
    content.includes("<AdminTableBody>") &&
    !content.includes("AdminDataTableRowsSkeleton")
  ) {
    if (content.includes("from \"@/modules/admin/ui\"")) {
      content = content.replace(
        /(AdminDataTable),/,
        "$1,\n  AdminDataTableRowsSkeleton,",
      );
    }
    content = content.replace(
      /<AdminTableBody>/,
      "{initialLoading ? (\n            <AdminDataTableRowsSkeleton rows={8} columns={6} />\n          ) : (\n          <AdminTableBody>",
    );
    const closeIdx = content.lastIndexOf("</AdminTableBody>");
    if (closeIdx !== -1) {
      content =
        content.slice(0, closeIdx + "</AdminTableBody>".length) +
        "\n          )}" +
        content.slice(closeIdx + "</AdminTableBody>".length);
    }
  }

  if (
    !content.includes("<AdminPageSkeleton") &&
    content.includes("AdminPageSkeleton")
  ) {
    content = content.replace(
      /import \{([^}]*?)AdminPageSkeleton,?\s*([^}]*)\} from "@\/modules\/admin\/components\/admin-page-skeleton";\n/m,
      (full, a, b) => {
        const parts = `${a}${b}`.split(",").map((s) => s.trim()).filter(Boolean);
        if (parts.length === 0) return "";
        return `import { ${parts.join(", ")} } from "@/modules/admin/components/admin-page-skeleton";\n`;
      },
    );
    content = content.replace(
      /import \{ AdminPageSkeleton \} from "@\/modules\/admin\/components\/admin-page-skeleton";\n/m,
      "",
    );
  }

  fs.writeFileSync(filePath, content);
  return true;
}

const files = walk(ROOT);
let n = 0;
for (const f of files) {
  if (patchFile(f)) {
    n++;
    console.log("patched", path.relative(ROOT, f));
  }
}
console.log("done", n);
