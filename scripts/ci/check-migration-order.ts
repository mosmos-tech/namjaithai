// ใช้ใน CI ตอน pull_request: node scripts/ci/check-migration-order.ts <base-ref> [head-ref]
// (รันเองก่อน push ได้: npm run check:migrations — เทียบ HEAD กับ origin/develop)
import { execFileSync } from "node:child_process";
import { checkMigrationOrder, FIX_HINT, type MigrationFile } from "./migration-order.ts";

const baseRef = process.argv[2] ?? "origin/develop";
const headRef = process.argv[3] ?? "HEAD";

function listMigrations(ref: string): MigrationFile[] {
  const out = execFileSync("git", ["ls-tree", ref, "supabase/migrations/"], { encoding: "utf8" });
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      // <mode> blob <hash>\t<path>
      const [meta, path] = line.split("\t");
      return { blob: meta.split(" ")[2], name: path.split("/").pop()! };
    });
}

const result = checkMigrationOrder(listMigrations(baseRef), listMigrations(headRef));
for (const name of result.renamed) {
  console.log(`เปลี่ยนชื่อ migration เดิม (เนื้อหาเหมือนใน ${baseRef}) ข้ามการเทียบเวลา: ${name}`);
}
if (result.errors.length > 0) {
  console.error(`migration ล่าสุดใน ${baseRef}: ${result.latestBase ?? "-"}`);
  for (const error of result.errors) console.error(`::error::${error}`);
  console.error(FIX_HINT);
  process.exit(1);
}
console.log(`ลำดับ migration ถูกต้อง (ล่าสุดใน ${baseRef}: ${result.latestBase ?? "-"})`);
