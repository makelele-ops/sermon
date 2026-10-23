// 말씀 도우미 점검: node tools/verify-sermon-assistant.mjs
// 실제 AI 요청은 보내지 않습니다(가짜 응답으로 시험).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { retrieve, buildSources, localAnswer, buildContext, findWeekInQuestion } from "../assets/sermon-assistant/core.mjs";
import { onRequest } from "../functions/api/sermon-chat.js";

const data = JSON.parse(await readFile("assets/sermon-assistant/data.json", "utf8"));
const latest = data.sermons[0].id;
const second = data.sermons[1].id;
assert(data.sermons.length >= 21, "설교 수");
assert(data.sermons.every((s) => s.days.length === 6), "요일 6개");
assert(data.sermons.filter((s) => s.notes).length >= 20, "요약 원고");
assert(!/여호와|세례/.test(JSON.stringify(data)), "교단 용어");

// 날짜·상대 표현
const [, m2, d2] = second.split("-").map(Number);
assert.equal(findWeekInQuestion(data, `${m2}월 ${d2}일 설교 요약해 주세요`, latest).id, second);
assert.equal(findWeekInQuestion(data, "지난주 설교에서 용서에 대해 뭐라고 하셨지?", latest).id, latest);
assert.equal(findWeekInQuestion(data, "이번 말씀을 어떻게 적용할까요?", latest).id, latest);
assert.equal(findWeekInQuestion(data, "지지난주 설교 핵심", latest).id, second);
assert.equal(findWeekInQuestion(data, "이번 주 설교", second).id, second, "보관함 페이지에서는 그 주가 기준");
assert.equal(retrieve(data, { question: "1월 3일 설교" }).scope, "missing");

// 주제 검색
for (const q of ["용서하는 것이 힘들어요", "기도에 관한 설교 찾아 주세요", "두려움", "염려가 많을 때"]) {
  const f = retrieve(data, { question: q, contextWeek: latest });
  assert.equal(f.scope, "search", q);
  assert(f.sermons.length >= 1 && f.sermons.length <= 3, q);
}
const prayer = retrieve(data, { question: "기도에 관한 설교", contextWeek: latest });
assert(prayer.sermons.some((id) => /기도/.test(data.sermons.find((s) => s.id === id).title)), "기도 설교가 위에");
const none = retrieve(data, { question: "우주왕복선 정비 매뉴얼", contextWeek: latest });
assert.equal(buildSources(data, none).length, 0);
assert(localAnswer(data, "x", none, []).includes("찾지 못했어요"));

// 자료 묶음 크기(비용) 확인
for (const q of ["이번 주 설교 요약", "용서하는 것이 힘들어요"]) {
  const f = retrieve(data, { question: q, contextWeek: latest });
  const ctx = buildContext(data, f, buildSources(data, f));
  assert(ctx.length < 20000, `자료가 너무 깁니다: ${ctx.length}`);
}

// 서버
const assets = { fetch: async (url) => new URL(url).pathname.endsWith("data.json") ? Response.json(data) : new Response("", { status: 404 }) };
const req = (body, origin = "https://sermon.example") => new Request("https://sermon.example/api/sermon-chat", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
assert.equal((await onRequest({ request: req({ question: "a" }, "https://evil.example"), env: { ASSETS: assets } })).status, 403);
assert.equal((await onRequest({ request: req({ question: "" }), env: { ASSETS: assets } })).status, 400);
let res = await onRequest({ request: req({ question: "이번 주 설교 요약", contextWeek: latest }), env: { ASSETS: assets } });
let body = await res.json();
assert.equal(body.ai, false); assert.equal(body.reason, "not_configured"); assert(body.answer.length > 50); assert(body.sources.length);

const original = globalThis.fetch;
const calls = [];
globalThis.fetch = async (url, opts) => {
  calls.push({ url, body: JSON.parse(opts.body) });
  const enc = new TextEncoder();
  return new Response(new ReadableStream({ start(c) {
    c.enqueue(enc.encode('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"설교에서는 "}}\n\n'));
    c.enqueue(enc.encode('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"하나님을 먼저 선택하라고 전했습니다 [1]."}}\n\n'));
    c.close();
  } }), { status: 200 });
};
try {
  const env = { ASSETS: assets, ANTHROPIC_API_KEY: "test-only" };
  res = await onRequest({ request: req({ question: "이번 주 설교 요약", contextWeek: latest, history: [{ role: "assistant", content: "안내" }, { role: "user", content: "앞 질문" }, { role: "assistant", content: "앞 답" }] }), env });
  assert.equal(res.headers.get("X-Answer-Mode"), "ai");
  const text = await res.text();
  const [head, ...rest] = text.split("\n");
  assert(JSON.parse(head).length > 0, "첫 줄은 참고 자료");
  assert.equal(rest.join("\n"), "설교에서는 하나님을 먼저 선택하라고 전했습니다 [1].");
  const sent = calls[0].body;
  assert.equal(calls[0].url, "https://api.anthropic.com/v1/messages");
  assert.equal(sent.messages[0].role, "user", "대화는 사용자 말로 시작");
  assert.deepEqual(sent.messages.map((m) => m.role), ["user", "assistant", "user"]);
  assert(sent.messages.at(-1).content.includes("<자료>"));
  assert(!JSON.stringify(sent).includes("test-only"), "키가 본문에 섞이지 않음");

  // 사용량 제한 (분당 6회)
  const limitedEnv = { ...env };
  let limited = 0;
  for (let i = 0; i < 9; i++) {
    const r = await onRequest({ request: new Request("https://sermon.example/api/sermon-chat", { method: "POST", headers: { Origin: "https://sermon.example", "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9" }, body: JSON.stringify({ question: "기도", contextWeek: latest }) }), env: limitedEnv });
    if (r.headers.get("content-type").includes("json") && (await r.json()).reason === "rate_limited") limited++; else await r.text();
  }
  assert(limited >= 3, "분당 제한");

  // AI 서버 오류 → 자료 검색 답변으로
  globalThis.fetch = async () => new Response("down", { status: 500 });
  res = await onRequest({ request: req({ question: "용서", contextWeek: latest }), env: { ...env } });
  body = await res.json();
  assert.equal(body.ai, false);
  assert.equal(body.reason, "upstream_unavailable");
} finally {
  globalThis.fetch = original;
}
console.log("PASS: 말씀 도우미 — 날짜·이번주 인식, 주제 검색, 자료 크기, 출처, 서버 보안, AI 스트리밍, 사용량 제한, 오류 시 대체 답변");
