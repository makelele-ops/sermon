import { existsSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const publicDir = path.join(root, "public");

function assertInsideRoot(target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (!resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Refusing to write outside project: ${resolvedTarget}`);
  }
}

async function copyIfExists(from, to) {
  if (!existsSync(from)) return false;
  await cp(from, to, { recursive: true, force: true });
  return true;
}

assertInsideRoot(publicDir);

await rm(publicDir, { recursive: true, force: true });
await mkdir(publicDir, { recursive: true });

await copyIfExists(path.join(root, "index.html"), path.join(publicDir, "index.html"));
await copyIfExists(path.join(root, "assets"), path.join(publicDir, "assets"));
await copyIfExists(path.join(root, "archive"), path.join(publicDir, "archive"));
await copyIfExists(path.join(root, "_redirects"), path.join(publicDir, "_redirects"));
await copyIfExists(path.join(root, "_headers"), path.join(publicDir, "_headers"));

console.log("Cloudflare Pages public folder updated.");
console.log(`Output directory: ${path.relative(root, publicDir) || "public"}`);
