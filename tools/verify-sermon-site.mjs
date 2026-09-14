import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const pages = ["index.html", ...readdirSync("archive").filter(n => n.endsWith(".html")).map(n => `archive/${n}`)];
const digest = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const parse = (html, name, end) => {
  const start = html.indexOf(`const ${name} = `);
  assert(start >= 0, `${name} missing`);
  const text = html.slice(start + `const ${name} = `.length);
  return vm.runInNewContext(`(${text.slice(0, text.indexOf(end) + end.length - 1)})`);
};
let checkedImages = 0;
for (const file of pages) {
  const html = readFileSync(file, "utf8");
  assert(!/여호와|세례/.test(html), `Denomination term in ${file}`);
  assert.equal(digest(file), digest(path.join("public", file)), `Public mismatch: ${file}`);
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1], { filename: file });
  const content = parse(html, "weeklyContent", "\n};");
  const archive = parse(html, "weeklyArchive", "\n];");
  assert.equal(content.days.length, 6, `Day count in ${file}`);
  assert.equal(new Set(archive.map(entry => entry.weekId)).size, archive.length, `Duplicate archive in ${file}`);
  for (const entry of archive) assert(existsSync(path.resolve(path.dirname(file), entry.href)), `Missing archive ${entry.href}`);
  for (const day of content.days) {
    const image = path.resolve(path.dirname(file), day.image);
    assert(image.startsWith(root + path.sep), "Image escaped workspace");
    assert(existsSync(image), `Missing ${image}`);
    assert.equal(digest(image), digest(path.join(root, "public", path.relative(root, image))));
    if (file === "index.html") {
      const png = readFileSync(image);
      assert.equal(png.readUInt32BE(16), 1536, `Width: ${day.id}`);
      assert.equal(png.readUInt32BE(20), 1024, `Height: ${day.id}`);
      checkedImages++;
      const seconds = time => time.split(":").reduce((sum, value) => sum * 60 + Number(value), 0);
      assert(seconds(day.video.start) < seconds(day.video.end), `Bad segment: ${day.id}`);
      assert(day.reading && day.prayer && day.action && day.familyQuestion && day.prompts.length === 4);
    }
  }
}
assert(!/여호와|세례/.test(readFileSync("새본문.txt", "utf8")), "Input denomination terms");
console.log(`PASS: ${pages.length} pages, six daily entries, ${checkedImages} 1536x1024 images, archive links, JavaScript syntax, terminology and public hashes.`);
