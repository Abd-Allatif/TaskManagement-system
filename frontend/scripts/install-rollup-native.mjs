/**
 * Rolls the vendored Rollup native binding back into node_modules.
 *
 * This environment has no network access, so `@rollup/rollup-linux-x64-gnu`
 * (an optional dependency of Rollup) may not reach the npm cache. The binding
 * is kept in `vendor/rollup/linux-x64/` and restored here after every install.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, "..");
const vendor = join(projectRoot, "vendor", "rollup", "linux-x64");
const target = join(projectRoot, "node_modules", "@rollup", "rollup-linux-x64-gnu");

if (!existsSync(join(vendor, "rollup.linux-x64-gnu.node"))) {
  console.warn(
    "[rollup] no vendored binding found in vendor/rollup/linux-x64 — skipping.",
  );
  process.exit(0);
}

if (existsSync(join(target, "rollup.linux-x64-gnu.node"))) {
  process.exit(0);
}

try {
  mkdirSync(dirname(target), { recursive: true });
  cpSync(vendor, target, { recursive: true });
  console.log("[rollup] vendored native binding installed into node_modules.");
} catch (err) {
  console.warn("[rollup] could not install the vendored binding:", err.message);
}
