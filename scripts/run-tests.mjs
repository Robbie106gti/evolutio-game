import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--quick"))
  throw new Error("Usage: node scripts/run-tests.mjs [--quick]");
const quick = args.includes("--quick");
const tests = readdirSync(join(root, "src"), { recursive: true })
  .filter(
    (file) =>
      file.endsWith(".test.ts") &&
      (!quick || !file.endsWith("sim-stability.test.ts")),
  )
  .sort();
if (!tests.length) throw new Error("No tests discovered");
console.log(
  `Running ${tests.length} test files${quick ? " (excluding long stability run)" : ""}`,
);
for (const test of tests) {
  console.log(`\n--- ${test} ---`);
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", join(root, "src", test)],
    { cwd: root, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`\nAll ${tests.length} test files passed.`);
