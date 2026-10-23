// 말씀 도우미 자료(assets/sermon-assistant/data.json)를 만듭니다.
// - index.html과 archive/*.html에서 주간 묵상문을 모읍니다.
// - content/sermon-notes/날짜.txt (설교 요약 원고)를 붙입니다. 이번 주 새본문.txt는 자동으로 여기에 보관됩니다.
// - content/transcripts/날짜.txt (설교 자막, 있으면)는 assets/sermon-assistant/transcripts/로 복사해 서버만 읽습니다.
// cloudflare-sync.mjs가 매주 자동으로 실행합니다.
import { readFile, readdir, writeFile, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const DAY_KO = ["월", "화", "수", "목", "금", "토"];

function literal(html, name) {
  const start = html.indexOf(`const ${name} =`);
  if (start < 0) return null;
  const from = html.indexOf("{", start);
  let depth = 0, quote = "", esc = false;
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (quote) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === quote) quote = ""; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth++;
    if (c === "}" && --depth === 0) return vm.runInNewContext(`(${html.slice(from, i + 1)})`, Object.create(null), { timeout: 1000 });
  }
  return null;
}

const terms = (t) => String(t || "").replaceAll("여호와", "야훼").replaceAll("세례", "침례");

// 영상 시간표 같은 작업용 줄은 빼고 설교 내용만 남깁니다.
export function cleanNotes(text) {
  return terms(text)
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .filter((l) => !/^\s*(영상|전체 실황|예배|유튜브|youtube|날짜|월|화|수|목|금|토|월요일|화요일|수요일|목요일|금요일|토요일|설교 단독 영상|전체 실황 설교|설교 전체|본문 봉독|성경 봉독|3부예배[^:：]*)\s*[:：]/i.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function noteMatchesWeek(raw, content) {
  const [y, m, d] = content.weekId.split("-").map(Number);
  const head = raw.slice(0, 400);
  const dateHit = new RegExp(`${y}\\s*[.\\-년]\\s*0?${m}\\s*[.\\-월]\\s*0?${d}(?!\\d)`).test(head);
  return dateHit || raw.includes(content.themeTitle);
}

export async function buildAssistant(root = process.cwd()) {
  const pages = ["index.html", ...(await readdir(path.join(root, "archive"))).filter((n) => /^\d{4}-\d{2}-\d{2}\.html$/.test(n)).map((n) => `archive/${n}`)];
  const notesDir = path.join(root, "content", "sermon-notes");
  const transcriptsDir = path.join(root, "content", "transcripts");
  const outDir = path.join(root, "assets", "sermon-assistant");
  await mkdir(notesDir, { recursive: true });
  await mkdir(path.join(outDir, "transcripts"), { recursive: true });

  // 이번 주 새본문.txt를 날짜별 설교 원고로 보관 (자동화가 매주 새본문.txt를 바꿔도 지난 원고가 남도록)
  const current = literal(await readFile(path.join(root, "index.html"), "utf8"), "weeklyContent");
  const inputPath = path.join(root, "새본문.txt");
  if (current && existsSync(inputPath)) {
    const raw = (await readFile(inputPath, "utf8")).replace(/^﻿/, "");
    if (raw.trim().length > 200 && noteMatchesWeek(raw, current)) {
      await writeFile(path.join(notesDir, `${current.weekId}.txt`), terms(raw).trim() + "\n", "utf8");
    }
  }

  const sermons = new Map();
  for (const page of pages) {
    const w = literal(await readFile(path.join(root, page), "utf8"), "weeklyContent");
    if (!w) throw new Error(`묵상 자료를 읽지 못했습니다: ${page}`);
    if (sermons.has(w.weekId)) continue;
    const notesFile = path.join(notesDir, `${w.weekId}.txt`);
    const transcriptFile = path.join(transcriptsDir, `${w.weekId}.txt`);
    let transcript = false;
    if (existsSync(transcriptFile)) {
      await copyFile(transcriptFile, path.join(outDir, "transcripts", `${w.weekId}.txt`));
      transcript = true;
    }
    sermons.set(w.weekId, {
      id: w.weekId,
      title: w.themeTitle,
      passage: w.passage,
      video: w.sermonVideo || "",
      page: `/${page}`,
      notes: existsSync(notesFile) ? cleanNotes(await readFile(notesFile, "utf8")) : "",
      transcript,
      days: w.days.map((d, i) => ({
        day: DAY_KO[i],
        title: d.title,
        navTitle: (d.subtitle || "").split(" · ")[1] || "",
        reference: d.reference,
        verse: d.verse,
        reading: d.reading,
        action: d.action,
        prayer: d.prayer,
        familyQuestion: d.familyQuestion || "",
        prompts: d.prompts || [],
        start: d.video?.start || "0"
      }))
    });
  }

  let church = { approved: false, text: "" };
  try { church = JSON.parse(await readFile(path.join(root, "content/church-guide.json"), "utf8")); }
  catch (e) { if (e.code !== "ENOENT") throw e; }

  const data = { version: 2, builtAt: new Date().toISOString(), church, sermons: [...sermons.values()].sort((a, b) => b.id.localeCompare(a.id)) };
  await writeFile(path.join(outDir, "data.json"), JSON.stringify(data) + "\n", "utf8");
  const withNotes = data.sermons.filter((s) => s.notes).length;
  console.log(`말씀 도우미 자료: 설교 ${data.sermons.length}편 (요약 원고 ${withNotes}편, 자막 ${data.sermons.filter((s) => s.transcript).length}편), 묵상 ${data.sermons.reduce((n, s) => n + s.days.length, 0)}개`);
  return data;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildAssistant();
