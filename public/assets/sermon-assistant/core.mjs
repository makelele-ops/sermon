// 말씀 도우미 공통 코드 — 브라우저와 Cloudflare 서버(functions/api/sermon-chat.js)가 함께 씁니다.
// 외부 라이브러리 없음.

const DAY_KO = ["월", "화", "수", "목", "금", "토"];

// 질문에서 검색에 도움이 안 되는 말
const STOP = new Set(("설교 설교에서 말씀 말씀을 말씀이 대해 대해서 대한 관한 관해 관련 뭐라고 무엇 무슨 어떤 어떻게 " +
  "알려줘 알려주세요 알려 주세요 해줘 해주세요 해 주세요 정리 정리해 정리해줘 요약 요약해 요약해줘 만들어 만들어줘 " +
  "주세요 좀 그 이 저 것 거 수 있을까요 있나요 할까요 하나요 하셨지 하셨나요 했지 목사님 담임목사님 우리 제가 저는 나는 내가 " +
  "이번 지난 지난주 이번주 주일 오늘 찾아 찾아줘 찾아주세요 있어요 싶어요 궁금해요 궁금합니다 교회 질문").split(" "));

export function normalize(text) {
  return String(text || "").toLowerCase().replace(/[^가-힣a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// 뜻 없이 자주 나오는 말끝
const GRAM_STOP = new Set("어요 해요 니다 습니 세요 하는 하고 것이 있는 없는 합니 까요 해야 나요 하나 는데 어떻 떻게 했는 는지 려고 싶어 은데 아요 워요 들어 라고 이에 에서 으로 하게 해서 지요 데요".split(" "));

const JOSA = /(에서는|에게서|으로는|으로|에서|에게|한테|처럼|까지|부터|이라|라고|이란|에는|에|을|를|은|는|이|가|의|도|로|와|과|만)$/;

// 한글은 두 글자씩 잘라 비교합니다. "용서하는" → 용서, 서하, 하는 — 조사·어미가 달라도 찾을 수 있습니다.
export function grams(text) {
  const out = new Set();
  for (let word of normalize(text).split(" ")) {
    if (!word || STOP.has(word)) continue;
    if (/^[a-z0-9]+$/.test(word)) { if (word.length > 1) out.add(word); continue; }
    if (word.length === 1) continue;
    if (word.length >= 3) word = word.replace(JOSA, "");
    for (let i = 0; i < word.length - 1; i++) { const g = word.slice(i, i + 2); if (!GRAM_STOP.has(g)) out.add(g); }
  }
  return out;
}

const RELATIVE_NOW = /((이번|지난|저번)\s*주|이번\s*(설교|말씀|묵상|본문)|이\s*(설교|말씀|본문)|오늘\s*(말씀|묵상|본문)|최근\s*설교|가장\s*최근)/;
const RELATIVE_PREV = /(지지난\s*주|2\s*주\s*전|두\s*주\s*전)/;

// 질문 속 날짜 → 설교 id
export function findWeekInQuestion(data, question, contextWeek) {
  const q = String(question || "");
  const ids = data.sermons.map((s) => s.id);
  const iso = q.match(/(20\d\d)[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/);
  const md = q.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/) || q.match(/(?:^|\s)(\d{1,2})[./](\d{1,2})(?:\s|$|일|자)/);
  let month, day, year;
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (md) [month, day] = [Number(md[1]), Number(md[2])];
  if (month && day) {
    const hit = ids.find((id) => {
      const [y, m, d] = id.split("-").map(Number);
      return m === month && d === day && (!year || y === year);
    });
    if (hit) return { id: hit, how: "date" };
    // 평일 날짜(예: 10월 21일)는 그 주 설교로
    const target = Date.UTC(year || Number((contextWeek || ids[0] || "2026").slice(0, 4)), month - 1, day);
    const week = ids.find((id) => { const t = Date.parse(id + "T00:00:00Z"); return target >= t && target < t + 7 * 864e5; });
    if (week) return { id: week, how: "date" };
    return { id: null, how: "date-missing" };
  }
  const base = contextWeek && ids.includes(contextWeek) ? contextWeek : ids[0];
  if (RELATIVE_PREV.test(q)) return { id: ids[ids.indexOf(base) + 1] || base, how: "relative" };
  if (RELATIVE_NOW.test(q)) return { id: base, how: "relative" };
  return null;
}

function sermonText(s) {
  return [s.title, s.passage, s.notes || "", ...s.days.map((d) => [d.title, d.navTitle, d.reference, d.verse, d.reading, d.action, d.prayer].join(" "))].join(" ");
}
function dayText(s, d) {
  return [d.title, d.navTitle, d.reference, d.verse, d.reading, d.action, d.prayer, d.familyQuestion].join(" ");
}

function counts(text) {
  const map = new Map();
  for (const word of normalize(text).split(" ")) {
    for (let i = 0; i < word.length - 1; i++) { const g = word.slice(i, i + 2); map.set(g, (map.get(g) || 0) + 1); }
  }
  return map;
}

const cache = new WeakMap();
function index(data) {
  if (cache.has(data)) return cache.get(data);
  const docs = data.sermons.map((s) => ({
    s,
    tf: counts(sermonText(s)),
    title: counts(s.title + " " + s.days.map((d) => d.title).join(" ")),
    days: s.days.map((d) => ({ tf: counts(dayText(s, d)), title: counts(d.title + " " + (d.navTitle || "")) }))
  }));
  const df = new Map();
  for (const doc of docs) for (const g of doc.tf.keys()) df.set(g, (df.get(g) || 0) + 1);
  const n = docs.length;
  const idf = (g) => Math.log(1 + n / (df.get(g) || 0.5));
  const value = { docs, idf };
  cache.set(data, value);
  return value;
}

// 질문에 맞는 설교와 묵상 날짜를 고릅니다.
export function retrieve(data, { question = "", history = [], week = "", contextWeek = "" } = {}) {
  const { docs, idf } = index(data);
  const explicit = week && data.sermons.some((s) => s.id === week) ? { id: week, how: "selected" } : findWeekInQuestion(data, question, contextWeek);
  if (explicit && explicit.how === "date-missing") return { scope: "missing", sermons: [], hits: [] };
  // 짧은 후속 질문("그럼 화요일은요?")은 직전 질문의 맥락을 함께 씁니다.
  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content || "";
  const short = question.length < 25 && lastUser;
  const followUp = !explicit && short ? findWeekInQuestion(data, lastUser, contextWeek) : null;
  const q = [...grams(question.replace(RELATIVE_NOW, " ").replace(RELATIVE_PREV, " ") + (short ? " " + lastUser : ""))];
  const qWeight = q.reduce((t, g) => t + idf(g), 0) || 1;
  // coverage: 질문 낱말이 얼마나 들어 있나 / strength: 얼마나 자주·제목에 나오나
  const measure = (tf, title) => {
    let cover = 0, strength = 0;
    for (const g of q) {
      const c = tf.get(g) || 0;
      if (!c) continue;
      cover += idf(g);
      strength += idf(g) * (1 + Math.log(c)) + (title.get(g) ? idf(g) * 2.5 : 0);
    }
    return { cover: cover / qWeight, strength: strength / qWeight };
  };

  const scope = explicit?.id || followUp?.id;
  let ranked = docs.map((doc) => ({ doc, ...measure(doc.tf, doc.title) }));
  if (scope) ranked = ranked.filter((r) => r.doc.s.id === scope);
  else {
    ranked.sort((a, b) => b.strength - a.strength || b.doc.s.id.localeCompare(a.doc.s.id));
    const good = ranked.filter((r) => r.cover >= 0.45);
    ranked = good.length ? good : ranked.filter((r) => r.cover >= 0.25).slice(0, 2);
  }

  const picked = scope ? ranked : ranked.slice(0, 3);
  const hits = [];
  for (const r of picked) {
    r.doc.days.forEach((d, i) => {
      const m = measure(d.tf, d.title);
      hits.push({ week: r.doc.s.id, dayIndex: i, cover: m.cover, score: m.strength + (scope ? 0 : r.strength * 0.15) });
    });
  }
  hits.sort((a, b) => b.score - a.score);
  return {
    scope: scope ? "week" : picked.length ? "search" : "none",
    sermons: picked.map((r) => r.doc.s.id),
    hits: hits.filter((h) => scope || h.cover >= 0.3).slice(0, scope ? 6 : 5)
  };
}

export function sermonById(data, id) { return data.sermons.find((s) => s.id === id); }

export function pageLink(s, dayIndex) {
  return s.page + (Number.isInteger(dayIndex) ? `?day=${dayIndex}` : "");
}

export function videoLink(s, day) {
  const m = String(s.video || "").match(/(?:youtu\.be\/|v=|\/live\/)([\w-]{11})/);
  if (!m) return null;
  const sec = String(day?.start || "0").split(":").reduce((n, v) => n * 60 + Number(v || 0), 0);
  return `https://www.youtube.com/watch?v=${m[1]}${sec > 0 ? `&t=${sec}s` : ""}`;
}

// 화면 아래 "참고한 자료" 목록
export function buildSources(data, found) {
  const list = [];
  const seen = new Set();
  const push = (s, dayIndex) => {
    const key = s.id + ":" + (dayIndex ?? "w");
    if (seen.has(key)) return;
    seen.add(key);
    const d = Number.isInteger(dayIndex) ? s.days[dayIndex] : null;
    list.push({
      n: list.length + 1,
      week: s.id,
      sermon: s.title,
      passage: s.passage,
      day: d ? `${DAY_KO[dayIndex]} · ${d.title}` : "",
      href: pageLink(s, dayIndex),
      video: videoLink(s, d)
    });
  };
  for (const id of found.sermons) {
    const s = sermonById(data, id);
    if (!s) continue;
    push(s);
  }
  for (const h of found.hits) {
    const s = sermonById(data, h.week);
    if (s && list.length < 8) push(s, h.dayIndex);
  }
  return list;
}

// AI에게 넘길 자료 묶음
export function buildContext(data, found, sources, { transcripts = {} } = {}) {
  const parts = [];
  parts.push("## 전체 설교 목록 (최근순)\n" + data.sermons.map((s) => `- ${s.id} 「${s.title}」 ${s.passage} — 월~토 묵상: ${s.days.map((d) => d.title).join(" / ")}`).join("\n"));
  const full = found.scope === "week";
  for (const src of sources) {
    const s = sermonById(data, src.week);
    if (!s) continue;
    if (!src.day) {
      const notes = clip(s.notes || "", full ? 7000 : 3200);
      parts.push(`## [${src.n}] ${s.id} 주일설교 「${s.title}」 (${s.passage})\n` +
        (notes ? `### 설교 요약 원고\n${notes}` : "### 설교 요약 원고\n(이 주는 요약 원고가 없습니다. 아래 묵상문만 참고하세요.)") +
        (transcripts[s.id] ? `\n### 설교 자동 자막 일부 (오탈자 가능)\n${clip(transcripts[s.id], full ? 6000 : 2500)}` : ""));
    } else {
      const i = DAY_KO.indexOf(src.day[0]);
      const d = s.days[i];
      if (!d) continue;
      parts.push(`## [${src.n}] ${s.id} 설교 「${s.title}」의 ${DAY_KO[i]}요일 묵상 「${d.title}」\n` +
        `붙들 말씀: ${d.verse || ""} (${d.reference || ""})\n묵상: ${d.reading}\n적용: ${d.action}\n기도: ${d.prayer}` +
        (d.familyQuestion ? `\n가정예배 질문: ${d.familyQuestion}` : "") +
        (d.prompts?.[0] ? `\n생각할 질문: ${d.prompts[0]}` : ""));
    }
  }
  return parts.join("\n\n");
}

function clip(text, max) {
  const t = String(text || "").trim();
  return t.length > max ? t.slice(0, max) + " …(이하 생략)" : t;
}

// AI 연결 전이거나 연결이 안 될 때 쓰는 기본 답변
export function localAnswer(data, question, found, sources) {
  if (found.scope === "missing") return "말씀하신 날짜의 설교 묵상 자료가 아직 없습니다. 2026년 5월 31일부터의 주일설교가 등록되어 있어요. 날짜를 다시 확인해 주세요.";
  if (!sources.length) return "등록된 설교와 묵상 자료에서 관련된 내용을 찾지 못했어요. 다른 낱말로 물어보시거나 \"10월 11일 설교\"처럼 날짜를 넣어 보세요.";
  const lines = [];
  if (found.scope === "week") {
    const s = sermonById(data, found.sermons[0]);
    lines.push(`**${s.id.slice(5).replace("-", "월 ")}일 주일설교 「${s.title}」** (${s.passage}) [1]`);
    const points = (s.notes || "").split("\n").map((l) => l.trim()).filter((l) => /^(첫째|둘째|셋째|넷째|다섯째)/.test(l));
    if (points.length) lines.push("", "설교의 큰 줄기", ...points.map((p) => "- " + p));
    lines.push("", "이번 주 묵상", ...s.days.map((d, i) => `- ${DAY_KO[i]}: ${d.title}`));
    const top = found.hits[0];
    if (top && grams(question).size) {
      const d = s.days[top.dayIndex];
      const n = sources.find((x) => x.week === s.id && x.day.startsWith(DAY_KO[top.dayIndex]))?.n;
      lines.push("", `질문과 가까운 묵상 — ${DAY_KO[top.dayIndex]}요일 「${d.title}」${n ? ` [${n}]` : ""}`, d.reading, "", "**오늘의 적용** " + d.action);
    }
  } else {
    lines.push("관련된 설교와 묵상을 찾았어요.");
    for (const src of sources.filter((x) => x.day).slice(0, 3)) {
      const s = sermonById(data, src.week);
      const d = s.days[DAY_KO.indexOf(src.day[0])];
      lines.push("", `**${src.week.slice(5).replace("-", "/")} 「${s.title}」 · ${src.day}** [${src.n}]`, d.reading);
    }
  }
  return lines.join("\n");
}
