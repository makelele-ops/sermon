import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "netlify");

const css = await readFile(path.join(root, "src", "styles.css"), "utf8");
let content = await readFile(path.join(root, "src", "content.js"), "utf8");
let app = await readFile(path.join(root, "src", "app.js"), "utf8");

content = content.replace("export const weeklyContent =", "const weeklyContent =");

app = app
  .replace('import { weeklyContent } from "./content.js";\n\n', "")
  .replaceAll('"/assets/devotion/', '"./assets/devotion/')
  .replaceAll("'/assets/devotion/", "'./assets/devotion/");

const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="6일 말씀 묵상 여정" />
    <title>매일 말씀 묵상</title>
    <style>
${css}
    </style>
  </head>
  <body>
    <main id="app" class="app-shell" aria-live="polite"></main>
    <script>
${content}

${app}
    </script>
  </body>
</html>
`;

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, "assets", "devotion"), { recursive: true });
await writeFile(path.join(output, "index.html"), html, "utf8");
await writeFile(path.join(output, "_redirects"), "/* /index.html 200\n", "utf8");
await cp(path.join(root, "assets", "devotion"), path.join(output, "assets", "devotion"), {
  recursive: true
});

console.log(`Netlify static export written to ${output}`);
