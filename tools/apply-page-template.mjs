// 디자인 틀(tools/page-template.html)을 index.html과 archive/*.html 전체에 다시 입힙니다.
// 각 페이지의 묵상 내용(weeklyContent)과 보관함 목록(weeklyArchive)은 그대로 두고 화면 코드만 바꿉니다.
// 사용: node tools/apply-page-template.mjs   (그 다음 node tools/cloudflare-sync.mjs)
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const MARK = "/*__WEEKLY_DATA__*/";

export function extractLiteral(html, name, open, close) {
  const start = html.indexOf(`const ${name} =`);
  if (start < 0) return null;
  const from = html.indexOf(open, start);
  let depth = 0, quote = "", escaped = false;
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === open) depth++;
    if (c === close && --depth === 0) {
      return vm.runInNewContext(`(${html.slice(from, i + 1)})`, Object.create(null), { timeout: 1000 });
    }
  }
  throw new Error(`${name} 끝을 찾지 못했습니다.`);
}

export function makeArchivedHtml(html) {
  // tools/sermon-text-to-index.mjs 와 같은 규칙
  return html
    .replace(/(["'(])\.\/assets\//g, "$1../assets/")
    .replace(/(["'(])\.\/netlify-site\.zip/g, "$1../netlify-site.zip");
}

export function fillTemplate(template, content, archive) {
  if (!template.includes(MARK)) throw new Error("page-template.html에 데이터 자리표시가 없습니다.");
  const data = `const weeklyContent = ${JSON.stringify(content, null, 2)};\n\nconst weeklyArchive = ${JSON.stringify(archive, null, 2)};`;
  return template.replace(MARK, () => data);
}

export async function applyTemplate(root = process.cwd()) {
  const template = await readFile(path.join(root, "tools/page-template.html"), "utf8");
  const indexHtml = await readFile(path.join(root, "index.html"), "utf8");
  const current = extractLiteral(indexHtml, "weeklyContent", "{", "}");
  const archive = extractLiteral(indexHtml, "weeklyArchive", "[", "]") || [];
  await writeFile(path.join(root, "index.html"), fillTemplate(template, current, archive), "utf8");

  const files = (await readdir(path.join(root, "archive"))).filter((n) => /^\d{4}-\d{2}-\d{2}\.html$/.test(n));
  for (const name of files) {
    const file = path.join(root, "archive", name);
    const content = extractLiteral(await readFile(file, "utf8"), "weeklyContent", "{", "}");
    const entries = archive.map((e) => ({ ...e, href: e.weekId === current.weekId ? "../index.html" : `./${e.weekId}.html` }));
    await writeFile(file, makeArchivedHtml(fillTemplate(template, content, entries)), "utf8");
  }
  console.log(`디자인 틀 적용: index.html + 보관함 ${files.length}편`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await applyTemplate();
