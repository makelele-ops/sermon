// 말씀 도우미 화면. 모든 묵상 페이지 맨 아래에서 불러옵니다.
import { retrieve, buildSources, localAnswer, compactSelection } from "./core.mjs";

const base = new URL(".", import.meta.url);
const DAY_KO = ["월", "화", "수", "목", "금", "토"];
const STORE = "sermon-assistant-chat-v2";

const css = document.createElement("link");
css.rel = "stylesheet";
css.href = new URL("widget.css?v=3", base);
document.head.append(css);

const page = () => window.devotionPage || {};
const pageContent = () => (typeof weeklyContent !== "undefined" ? weeklyContent : null);
const contextWeek = () => page().weekId || pageContent()?.weekId || "";

const svg = {
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c.4 4.6 2.4 6.6 7 7-4.6.4-6.6 2.4-7 7-.4-4.6-2.4-6.6-7-7 4.6-.4 6.6-2.4 7-7Z"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/></svg>'
};

// ---------- 화면 만들기 ----------
const launcher = document.createElement("button");
launcher.type = "button";
launcher.className = "sa-launcher";
launcher.innerHTML = `${svg.spark}<span>말씀 도우미</span>`;
launcher.setAttribute("aria-haspopup", "dialog");

const dialog = document.createElement("dialog");
dialog.className = "sa-sheet";
dialog.setAttribute("aria-labelledby", "sa-title");
dialog.innerHTML = `
  <header class="sa-head">
    <span class="sa-mark">${svg.spark}</span>
    <div class="sa-head-text"><h2 id="sa-title">말씀 도우미</h2><p class="sa-scope"></p></div>
    <button type="button" class="sa-new">새 대화</button>
    <button type="button" class="sa-x" aria-label="닫기">${svg.close}</button>
  </header>
  <div class="sa-log" role="log" aria-live="polite"></div>
  <form class="sa-compose">
    <div class="sa-pin" hidden><span></span><button type="button" aria-label="설교 지정 해제">${svg.close}</button></div>
    <div class="sa-row">
      <label class="sa-sr" for="sa-input">질문</label>
      <textarea id="sa-input" rows="1" maxlength="1000" enterkeyhint="send" placeholder="설교나 말씀에 대해 물어보세요"></textarea>
      <button type="submit" class="sa-send" aria-label="보내기">${svg.send}</button>
    </div>
    <p class="sa-note">설교 자료를 바탕으로 한 참고용 답변이에요. 이름·연락처 같은 개인정보는 적지 마세요.</p>
  </form>`;
document.body.append(launcher, dialog);

const $ = (s) => dialog.querySelector(s);
const log = $(".sa-log"), input = $("#sa-input"), form = $(".sa-compose"), sendBtn = $(".sa-send"), scopeEl = $(".sa-scope"), pinEl = $(".sa-pin");

// ---------- 상태 ----------
let state = load();
let busy = null; // AbortController
let localData = null;

function load() {
  try { return JSON.parse(sessionStorage.getItem(STORE)) || { messages: [], pin: null }; } catch { return { messages: [], pin: null }; }
}
function save() {
  try { sessionStorage.setItem(STORE, JSON.stringify({ messages: state.messages.slice(-20), pin: state.pin })); } catch { /* 무시 */ }
}

// ---------- 글 모양 (굵게, 목록, 출처 번호) ----------
function esc(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function inline(text, sources) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(\d{1,2})\](?:\s*\[(\d{1,2})\])*/g, (all) =>
      all.match(/\d+/g).map((n) => {
        const s = sources?.find((x) => x.n === Number(n));
        return s ? `<a class="sa-cite" href="${esc(s.href)}" title="${esc(sourceLabel(s))}">${n}</a>` : "";
      }).join(""));
}
function renderMarkdown(text, sources) {
  const lines = String(text).replace(/^#{1,6}\s*/gm, "").split("\n");
  let html = "", list = null, para = [];
  const flushPara = () => { if (para.length) { html += `<p>${para.map((l) => inline(l, sources)).join("<br>")}</p>`; para = []; } };
  const flushList = () => { if (list) { html += `<${list.tag}>${list.items.map((i) => `<li>${inline(i, sources)}</li>`).join("")}</${list.tag}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-•*]\s+(.*)$/);
    const num = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || num) {
      flushPara();
      const tag = bullet ? "ul" : "ol";
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push((bullet || num)[1]);
    } else if (!line.trim()) {
      flushPara(); flushList();
    } else {
      flushList(); para.push(line.trim());
    }
  }
  flushPara(); flushList();
  return html;
}
function shortDate(id) { const [, m, d] = id.split("-").map(Number); return `${m}.${d}`; }
function sourceLabel(s) { return `${shortDate(s.week)} 「${s.sermon}」${s.day ? " · " + s.day : s.label ? " · " + s.label : ""}`; }

// ---------- 메시지 그리기 ----------
function intro() {
  const c = pageContent();
  const p = page();
  const day = state.pin?.day;
  const dayTitle = Number.isInteger(day) && c?.days?.[day] ? c.days[day].title : "";
  const chips = Number.isInteger(day) && dayTitle
    ? [`「${dayTitle}」 묵상을 쉽게 풀어 주세요`, "오늘 적용을 제 생활에 맞게 구체적으로 도와주세요", "이 말씀으로 짧은 기도문을 써 주세요"]
    : p.isPastWeek
      ? ["이 주 설교를 세 줄로 정리해 주세요", "이 설교로 소그룹 나눔 질문을 만들어 주세요", "지금까지 설교 중 용서에 관한 말씀을 찾아 주세요"]
      : ["이번 주 설교 핵심을 세 줄로 정리해 주세요", "요즘 마음이 지쳐 있어요. 이번 주 말씀을 어떻게 붙들 수 있을까요?", "이번 주 설교로 소그룹 나눔 교재를 만들어 주세요", "지금까지 설교 중 두려움에 관한 말씀을 찾아 주세요"];
  const lead = Number.isInteger(day) && dayTitle
    ? `<b>${esc(DAY_KO[day])}요일 묵상 「${esc(dayTitle)}」</b>을 함께 생각해 볼게요. 지금 어떤 상황인지 편하게 적어 주시면 말씀과 연결해 드릴게요.`
    : "주일설교와 매일 묵상을 바탕으로 답해 드려요. 설교 내용이 궁금할 때, 말씀을 내 삶에 적용하고 싶을 때, 소그룹 나눔을 준비할 때 물어보세요.";
  return `<div class="sa-intro"><p>${lead}</p><div class="sa-chips">${chips.map((q) => `<button type="button" class="sa-chip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div></div>`;
}

function messageHtml(m, i) {
  if (m.role === "user") return `<div class="sa-msg sa-user"><p>${esc(m.content)}</p></div>`;
  const cited = new Set((m.content.match(/\[(\d{1,2})\]/g) || []).map((x) => Number(x.slice(1, -1))));
  const shown = (m.sources || []).filter((s) => (cited.size ? cited.has(s.n) : true)).slice(0, 5);
  const note = m.mode === "local" ? `<p class="sa-mode">${m.reason === "rate_limited" ? "질문이 많아 잠시 등록된 묵상 자료에서 찾아 드렸어요." : "AI 연결 전이라 등록된 설교·묵상 자료에서 찾아 드렸어요."}</p>` : "";
  return `<div class="sa-msg sa-ai${m.pending ? " sa-typing" : ""}" data-i="${i}">
    ${note}<div class="sa-text">${m.content ? renderMarkdown(m.content, m.sources) : '<span class="sa-dots"><i></i><i></i><i></i></span>'}</div>
    ${!m.pending && shown.length ? `<div class="sa-sources"><span>참고한 설교·묵상</span>${shown.map((s) => `
      <div class="sa-src"><a href="${esc(s.href)}"><b>${s.n}</b>${esc(sourceLabel(s))}</a>${s.video ? `<a class="sa-vid" href="${esc(s.video)}" target="_blank" rel="noopener">${svg.play}영상</a>` : ""}</div>`).join("")}</div>` : ""}
    ${!m.pending && m.content ? `<div class="sa-tools"><button type="button" class="sa-copy" data-i="${i}">${svg.copy}<span>복사</span></button></div>` : ""}
  </div>`;
}

function draw() {
  log.innerHTML = state.messages.length ? state.messages.map(messageHtml).join("") : intro();
  if (state.messages.length) log.insertAdjacentHTML("afterbegin", '<div class="sa-gap"></div>');
  log.scrollTop = log.scrollHeight;
}
let frame = 0;
function drawLast() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const i = state.messages.length - 1;
    const el = log.querySelector(`.sa-msg[data-i="${i}"]`);
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 120;
    if (el) el.outerHTML = messageHtml(state.messages[i], i); else draw();
    if (nearBottom) log.scrollTop = log.scrollHeight;
  });
}

function updateScope() {
  const c = pageContent();
  scopeEl.textContent = c ? `${page().isPastWeek ? "보고 있는 설교" : "이번 주 설교"} · ${shortDate(c.weekId)} 「${c.themeTitle}」` : "주일설교 묵상";
  if (state.pin && c) {
    pinEl.hidden = false;
    pinEl.querySelector("span").textContent = `${shortDate(c.weekId)} 설교${Number.isInteger(state.pin.day) ? ` · ${DAY_KO[state.pin.day]}요일 묵상` : ""} 기준으로 답해요`;
  } else pinEl.hidden = true;
}

function setBusy(on) {
  sendBtn.innerHTML = on ? svg.stop : svg.send;
  sendBtn.setAttribute("aria-label", on ? "멈추기" : "보내기");
  sendBtn.classList.toggle("sa-stop", on);
}

// ---------- 보내기 ----------
// 설교 자료와 자막을 한 번만 받아 두고, 질문에 맞는 자료를 이 기기에서 고릅니다.
let loading = null;
function getLocalData() {
  if (localData) return Promise.resolve(localData);
  if (!loading) {
    loading = Promise.all([
      fetch(new URL("data.json", base)).then((r) => { if (!r.ok) throw new Error("data"); return r.json(); }),
      fetch(new URL("transcripts.json", base)).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
    ]).then(([data, tx]) => {
      data.transcripts = tx.transcripts || {};
      localData = data;
      return data;
    }).catch((e) => { loading = null; throw e; });
  }
  return loading;
}

async function send(text) {
  const question = String(text ?? input.value).trim();
  if (!question || busy) return;
  input.value = "";
  autosize();
  const history = state.messages.filter((m) => !m.pending && m.content).map((m) => ({ role: m.role, content: m.content })).slice(-6);
  state.messages.push({ role: "user", content: question });
  const answer = { role: "assistant", content: "", sources: [], pending: true };
  state.messages.push(answer);
  draw();
  busy = new AbortController();
  setBusy(true);
  const body = {
    question,
    history,
    contextWeek: contextWeek(),
    week: state.pin ? contextWeek() : "",
    day: state.pin && Number.isInteger(state.pin.day) ? state.pin.day : page().view === "detail" ? page().day : undefined
  };
  let found = null;
  try {
    const data = await getLocalData();
    found = retrieve(data, { question, history, week: body.week, contextWeek: body.contextWeek });
    body.selection = compactSelection(found);
  } catch { /* 자료를 못 받으면 서버가 직접 찾습니다 */ }
  try {
    if (location.protocol === "file:") throw new Error("local");
    const res = await fetch("/api/sermon-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: busy.signal });
    const type = res.headers.get("content-type") || "";
    if (res.ok && res.headers.get("X-Answer-Mode") === "ai" && res.body) {
      answer.mode = "ai";
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let head = "", gotHead = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        let chunk = decoder.decode(value, { stream: true });
        if (!gotHead) {
          head += chunk;
          const cut = head.indexOf("\n");
          if (cut < 0) continue;
          try { answer.sources = JSON.parse(head.slice(0, cut)); } catch { answer.sources = []; }
          chunk = head.slice(cut + 1);
          gotHead = true;
        }
        answer.content += chunk;
        drawLast();
      }
    } else if (res.ok && type.includes("application/json")) {
      const payload = await res.json();
      Object.assign(answer, { content: payload.answer || "", sources: payload.sources || [], mode: "local", reason: payload.reason });
    } else if (res.status === 429 || res.status === 413 || res.status === 400) {
      const payload = await res.json().catch(() => ({}));
      answer.content = payload.error || "질문을 처리하지 못했어요. 다시 시도해 주세요.";
    } else {
      throw new Error("server");
    }
  } catch (error) {
    if (error.name === "AbortError") {
      answer.content = (answer.content || "") + (answer.content ? "\n\n(답변을 멈췄어요)" : "답변을 멈췄어요.");
    } else {
      // 서버가 없을 때(미리보기, 오프라인)는 이 기기에서 자료를 찾아 답합니다.
      try {
        const data = await getLocalData();
        found = found || retrieve(data, { question, history, week: body.week, contextWeek: body.contextWeek });
        const sources = buildSources(data, found);
        Object.assign(answer, { content: localAnswer(data, question, found, sources), sources, mode: "local", reason: "offline" });
      } catch {
        answer.content = "지금은 답변을 가져오지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.";
      }
    }
  } finally {
    answer.pending = false;
    busy = null;
    setBusy(false);
    save();
    draw();
  }
}

// ---------- 열기 / 닫기 ----------
function open(options = {}) {
  if (Number.isInteger(options.day)) {
    if (!state.pin || state.pin.day !== options.day) { state.messages = []; }
    state.pin = { day: options.day };
  }
  updateScope();
  draw();
  getLocalData().catch(() => {});
  if (!dialog.open) dialog.showModal();
  document.documentElement.classList.add("sa-open");
  input.placeholder = options.placeholder || "설교나 말씀에 대해 물어보세요";
  if (options.question && options.autoSend) send(options.question);
  else {
    if (options.question) input.value = options.question;
    autosize();
    // 휴대폰에서 키보드가 화면을 가리지 않도록, 빈 대화일 때만 바로 입력창에 초점
    if (!matchMedia("(pointer: coarse)").matches || options.question) input.focus();
  }
}
window.openSermonAssistant = open;

launcher.addEventListener("click", () => open());
$(".sa-x").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => { document.documentElement.classList.remove("sa-open"); busy?.abort(); });
dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
$(".sa-new").addEventListener("click", () => {
  busy?.abort();
  state = { messages: [], pin: null };
  save();
  updateScope();
  draw();
});
pinEl.querySelector("button").addEventListener("click", () => { state.pin = null; save(); updateScope(); if (!state.messages.length) draw(); });

log.addEventListener("click", async (e) => {
  const chip = e.target.closest(".sa-chip");
  if (chip) return send(chip.dataset.q);
  const copy = e.target.closest(".sa-copy");
  if (copy) {
    const m = state.messages[Number(copy.dataset.i)];
    const text = m.content.replace(/\*\*/g, "").replace(/\s*\[\d{1,2}\]/g, "") +
      (m.sources?.length ? "\n\n참고: " + m.sources.filter((s) => !s.day).map((s) => `${shortDate(s.week)} 「${s.sermon}」`).join(", ") : "");
    try { await navigator.clipboard.writeText(text); copy.querySelector("span").textContent = "복사했어요"; }
    catch { copy.querySelector("span").textContent = "길게 눌러 복사해 주세요"; }
  }
});

form.addEventListener("submit", (e) => { e.preventDefault(); if (busy) busy.abort(); else send(); });
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); send(); }
});
function autosize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; }
input.addEventListener("input", autosize);

updateScope();
document.documentElement.dataset.assistant = "ready";
