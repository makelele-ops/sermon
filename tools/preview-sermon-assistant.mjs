// 내 컴퓨터에서 사이트와 말씀 도우미를 미리 봅니다.  http://127.0.0.1:8765
// 클라우드플레어처럼 public 폴더를 보여 주고 /api/sermon-chat 도 실행합니다.
// AI까지 시험하려면 이 폴더에 .dev.vars 파일을 만들고 한 줄 적습니다:  ANTHROPIC_API_KEY=sk-ant-...
// (.dev.vars는 깃허브에 올라가지 않습니다)
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const project = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const root = path.join(project, process.argv.includes("--source") ? "" : "public");
const port = Number(process.env.PORT || 8765);
const types = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };

const env = {};
const varsFile = path.join(project, ".dev.vars");
if (existsSync(varsFile)) {
  for (const line of readFileSync(varsFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
}
async function fileResponse(pathname) {
  const file = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
  if (!file.startsWith(root + path.sep) && file !== root) return new Response("Forbidden", { status: 403 });
  try {
    if (!(await stat(file)).isFile()) throw new Error();
    return new Response(await readFile(file), { headers: { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
env.ASSETS = { fetch: (url) => fileResponse(new URL(url).pathname) };
const { onRequest } = await import(pathToFileURL(path.join(project, "functions/api/sermon-chat.js")).href);

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);
    let response;
    if (pathname === "/_assistant-preview-health") {
      response = new Response("sermon-assistant-preview");
    } else if (pathname === "/api/sermon-chat") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(url, { method: req.method, headers: req.headers, body: req.method === "POST" ? Buffer.concat(chunks) : undefined });
      response = await onRequest({ request, env });
    } else {
      response = await fileResponse(pathname);
    }
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) for await (const chunk of response.body) res.write(chunk);
    res.end();
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`미리보기: http://127.0.0.1:${port}`);
  console.log(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY ? "AI 답변: 켜짐 (.dev.vars)" : "AI 답변: 꺼짐 — 등록된 묵상 자료에서 찾아 답합니다");
});
