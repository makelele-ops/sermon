// 매주 자동화가 실행합니다: 말씀 도우미 자료 → 가벼운 사진 → public 폴더 복사
// (클라우드플레어는 깃허브의 public 폴더와 functions 폴더를 배포합니다)
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildAssistant } from "./build-sermon-assistant.mjs";
import { makeThumbs } from "./make-thumbs.mjs";

const root = process.cwd();
const publicDir = path.join(root, "public");

function assertInsideRoot(target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (!resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Refusing to write outside project: ${resolvedTarget}`);
  }
}

// 파일을 지우지 않고 덮어써서 복사합니다 (OneDrive 잠금·삭제 제한에도 안전)
async function copyTree(from, to) {
  if ((await stat(from)).isDirectory()) {
    await mkdir(to, { recursive: true });
    for (const name of await readdir(from)) await copyTree(path.join(from, name), path.join(to, name));
    return;
  }
  if (existsSync(to)) {
    const [a, b] = await Promise.all([stat(from), stat(to)]);
    if (a.size === b.size && a.mtimeMs <= b.mtimeMs) return; // 이미 같은 파일
  }
  try {
    await copyFile(from, to);
  } catch {
    // 일부 저장소(동기화 폴더 등)는 빠른 복사를 막으므로 읽어서 다시 씁니다.
    await writeFile(to, await readFile(from));
  }
}

async function copyIfExists(from, to) {
  if (!existsSync(from)) return false;
  await copyTree(from, to);
  return true;
}

assertInsideRoot(publicDir);

await buildAssistant(root);
try {
  await makeThumbs(root);
} catch (error) {
  console.log(`가벼운 사진 단계 건너뜀: ${error.message}`);
}

// Update in place: OneDrive may lock directories even when their files are writable.
await mkdir(publicDir, { recursive: true });

await copyIfExists(path.join(root, "index.html"), path.join(publicDir, "index.html"));
await copyIfExists(path.join(root, "assets"), path.join(publicDir, "assets"));
await copyIfExists(path.join(root, "archive"), path.join(publicDir, "archive"));
await copyIfExists(path.join(root, "_redirects"), path.join(publicDir, "_redirects"));
await copyIfExists(path.join(root, "_headers"), path.join(publicDir, "_headers"));
await copyIfExists(path.join(root, "_routes.json"), path.join(publicDir, "_routes.json"));
await copyIfExists(path.join(root, "manifest.webmanifest"), path.join(publicDir, "manifest.webmanifest"));
await copyIfExists(path.join(root, "sw.js"), path.join(publicDir, "sw.js"));

console.log("Cloudflare Pages public folder updated.");
console.log(`Output directory: ${path.relative(root, publicDir) || "public"}`);
