// 익명 방문 집계 (Cloudflare Pages Functions)
// 클라우드플레어 D1 데이터베이스를 STATS 라는 이름으로 연결하면 숫자가 쌓입니다. 연결 전에는 아무것도 하지 않습니다.
// 저장하는 것: 설교 주(날짜), 요일 번호, 행동 종류, 날짜, 횟수 — 이름·연락처·IP·기기 정보는 저장하지 않습니다.
const EVENTS = new Set(["visit", "day_open", "complete", "nudge", "app_open", "install", "ask", "ask_ai"]);
let ready = false;

export async function ensureTable(db) {
  if (ready) return;
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS site_stats (week TEXT NOT NULL, day INTEGER NOT NULL, event TEXT NOT NULL, date TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (week, day, event, date))"
  ).run();
  ready = true;
}

export async function countEvent(db, week, day, event) {
  if (!db || !EVENTS.has(event) || !/^\d{4}-\d{2}-\d{2}$/.test(week) || !Number.isInteger(day) || day < -1 || day > 5) return false;
  await ensureTable(db);
  const date = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 한국 날짜
  await db.prepare(
    "INSERT INTO site_stats (week, day, event, date, count) VALUES (?, ?, ?, ?, 1) ON CONFLICT(week, day, event, date) DO UPDATE SET count = count + 1"
  ).bind(week, day, event, date).run();
  return true;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export async function onRequest({ request, env, waitUntil }) {
  const db = env.STATS;
  if (request.method === "POST") {
    const origin = request.headers.get("Origin");
    if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403 });
    if (!db) return new Response(null, { status: 204 });
    let body;
    try {
      const text = await request.text();
      if (text.length > 300) return new Response(null, { status: 413 });
      body = JSON.parse(text);
    } catch {
      return new Response(null, { status: 400 });
    }
    const work = countEvent(db, String(body.week || ""), Number(body.day), String(body.event || "")).catch(() => false);
    if (waitUntil) waitUntil(work); else await work;
    return new Response(null, { status: 204 });
  }
  if (request.method !== "GET") return json({ error: "GET or POST" }, 405);
  if (!db) return json({ enabled: false });
  try {
    await ensureTable(db);
    const weeks = await db.prepare("SELECT week, day, event, SUM(count) AS n FROM site_stats GROUP BY week, day, event ORDER BY week DESC").all();
    const days = await db.prepare(
      "SELECT date, event, SUM(count) AS n FROM site_stats WHERE date >= ? GROUP BY date, event ORDER BY date DESC"
    ).bind(new Date(Date.now() + 9 * 3600e3 - 27 * 864e5).toISOString().slice(0, 10)).all();
    return json({ enabled: true, weeks: weeks.results || [], days: days.results || [] });
  } catch (error) {
    return json({ enabled: true, error: "집계를 읽지 못했습니다." }, 500);
  }
}
