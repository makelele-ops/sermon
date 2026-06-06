import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(".");
const port = Number(process.env.PORT || 4173);

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

function safePath(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0]);
  const resolved = resolve(root, `.${normalize(cleanPath)}`);
  return resolved.startsWith(root) ? resolved : null;
}

createServer((request, response) => {
  const resolved = safePath(request.url || "/");
  const requested = !resolved || request.url === "/" ? join(root, "index.html") : resolved;
  const filePath = existsSync(requested) && statSync(requested).isDirectory()
    ? join(requested, "index.html")
    : requested;

  if (!existsSync(filePath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": types[extname(filePath)] || "application/octet-stream"
  });
  createReadStream(filePath).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Interactive Daily Devotional running at http://127.0.0.1:${port}/`);
});
