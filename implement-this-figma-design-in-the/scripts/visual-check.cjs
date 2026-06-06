const { mkdirSync } = require("node:fs");
const { resolve } = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.APP_URL || "http://127.0.0.1:4173/";
const outDir = resolve("screenshots");
mkdirSync(outDir, { recursive: true });

async function capture(page, name, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.screenshot({ path: resolve(outDir, `${name}.png`), fullPage: true });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await capture(page, "desktop", { width: 1440, height: 1100 });
  await capture(page, "mobile", { width: 390, height: 1120 });
  await browser.close();
  console.log(`Saved screenshots to ${outDir}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
