import { weeklyContent } from "./content.js";

const devotions = weeklyContent.days;
const storageKey = `personal-devotion-${weeklyContent.weekId}`;

document.title = `${weeklyContent.themeTitle} | 매일 말씀 묵상`;

const mediaThemes = [
  {
    id: "renewal",
    image: "/assets/devotion/warm-open-bible.png",
    accent: "#317b65",
    keywords: ["새 사람", "새롭게", "낡은", "벗고", "입다", "회개", "변화"]
  },
  {
    id: "grace",
    image: "/assets/devotion/warm-notebook.png",
    accent: "#b66550",
    keywords: ["은혜의 눈", "은혜", "사랑", "긍휼", "축복", "용서", "평안", "환영", "관계"]
  },
  {
    id: "word",
    image: "/assets/devotion/warm-pages.png",
    accent: "#4f7fa8",
    keywords: ["말씀", "생명", "믿음", "복음", "진리", "포도주", "본문", "호흡"]
  },
  {
    id: "prayer",
    image: "/assets/devotion/warm-candle.png",
    accent: "#8b689d",
    keywords: ["기도", "입술", "증인", "고백", "두려움", "담대", "충만", "예배"]
  },
  {
    id: "guidance",
    image: "/assets/devotion/warm-meadow.png",
    accent: "#4d8a55",
    keywords: ["새 부대", "길", "인도", "순종", "결정", "겸손", "부대", "유연", "고집"]
  },
  {
    id: "gratitude",
    image: "/assets/devotion/warm-wheat.png",
    accent: "#b77716",
    keywords: ["감사", "찬양", "열매", "은혜를 표시", "새 일", "가정", "교회", "지도"]
  }
];

const icons = {
  book:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5V5.75A2.75 2.75 0 0 1 6.75 3H20v16H6.75A2.75 2.75 0 0 0 4 21.75"/><path d="M8 7h8M8 11h7"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  chevronLeft:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  chevronRight:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
  list:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  heart:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>'
};

const $app = document.querySelector("#app");
const saved = readState();
const dayParam = new URLSearchParams(location.search).get("day");
const queryDay = dayParam === null ? NaN : Number(dayParam);
const hasQueryDay = Number.isInteger(queryDay) && queryDay >= 0 && queryDay < devotions.length;

const state = {
  selected: hasQueryDay ? queryDay : Number.isInteger(saved.selected) ? saved.selected : 0,
  view: hasQueryDay ? "detail" : "list",
  completed: new Set(saved.completed || []),
  entries: saved.entries || {}
};

function readState() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || {};
  } catch {
    return {};
  }
}

function persist() {
  localStorage.setItem(
    storageKey,
    JSON.stringify({
      selected: state.selected,
      completed: [...state.completed],
      entries: state.entries
    })
  );
}

function icon(name) {
  return icons[name] || "";
}

function themeText(devotion) {
  return [
    devotion.title,
    devotion.subtitle,
    devotion.reference,
    devotion.verse,
    devotion.reading,
    devotion.prayer,
    devotion.action,
    ...(devotion.prompts || [])
  ].join(" ");
}

function scoreTheme(text, theme) {
  return theme.keywords.reduce((score, keyword) => {
    if (!text.includes(keyword)) return score;
    return score + Math.max(2, Math.min(keyword.length, 6));
  }, 0);
}

function autoMediaFor(devotion, index = 0) {
  const text = themeText(devotion);
  const [best] = mediaThemes
    .map((theme) => ({ theme, score: scoreTheme(text, theme) }))
    .sort((left, right) => right.score - left.score);

  const fallback = best && best.score > 0 ? best.theme : mediaThemes[index % mediaThemes.length];

  return {
    ...fallback,
    image: devotion.image || fallback.image,
    accent: devotion.accent || fallback.accent
  };
}

function metaFor(devotion, index = devotions.indexOf(devotion)) {
  const [date = "", navTitle = "말씀 묵상"] = devotion.subtitle.split(" · ");
  return {
    date,
    navTitle,
    media: autoMediaFor(devotion, Math.max(0, index))
  };
}

function excerpt(text) {
  return text.length > 44 ? `${text.slice(0, 44)}...` : text;
}

function render(transition = "fade") {
  const devotion = devotions[state.selected];
  const meta = metaFor(devotion);
  const completeCount = devotions.filter((item) => state.completed.has(item.id)).length;
  const progress = Math.round((completeCount / devotions.length) * 100);

  $app.innerHTML =
    state.view === "detail"
      ? renderDetail(devotion, meta, completeCount, transition)
      : renderList(completeCount, progress, transition);
}

function renderList(completeCount, progress, transition) {
  const heroMedia = autoMediaFor(devotions[0], 0);

  return `
    <section class="screen list-screen ${transition}">
      <header class="hero" style="--hero-image: url('${heroMedia.image}')">
        <div class="hero-copy">
          <p class="sermon-date">${weeklyContent.sermonDate}</p>
          <h1>${weeklyContent.themeTitle}</h1>
          <p class="passage">${weeklyContent.passage}</p>
          <div class="hero-progress" aria-label="묵상 완료율">
            <div class="progress-track"><span style="width: ${progress}%"></span></div>
            <strong>${completeCount} / ${devotions.length} 완료</strong>
          </div>
        </div>
      </header>

      <main class="journey" aria-labelledby="journey-title">
        <div class="section-heading">
          <p id="journey-title">${weeklyContent.journeyTitle}</p>
        </div>
        <div class="card-grid">
          ${devotions
            .map((item, index) => renderDayCard(item, index))
            .join("")}
        </div>
      </main>
    </section>
  `;
}

function renderDayCard(item, index) {
  const meta = metaFor(item, index);
  const isDone = state.completed.has(item.id);

  return `
    <button
      class="day-card ${isDone ? "done" : ""}"
      style="--image: url('${meta.media.image}'); --accent: ${meta.media.accent}"
      data-open="${index}"
      type="button"
    >
      ${isDone ? `<span class="check-badge">${icon("check")}</span>` : ""}
      <span class="card-copy">
        <small>${meta.date}</small>
        <strong>${meta.navTitle}</strong>
        <span>${item.title}</span>
        <em>${excerpt(item.reading)}</em>
      </span>
    </button>
  `;
}

function renderDetail(devotion, meta, completeCount, transition) {
  const journal = state.entries[devotion.id] || "";
  const isDone = state.completed.has(devotion.id);

  return `
    <section class="screen detail-screen ${transition}" style="--accent: ${meta.media.accent}; --detail-image: url('${meta.media.image}')">
      <main class="detail-layout">
        <article class="detail-card">
          <p class="sermon-date">${weeklyContent.themeTitle}</p>
          <p class="day-pill">${meta.date} · ${meta.navTitle}</p>
          <h1>${devotion.title}</h1>
          <p class="lead">${devotion.reading}</p>

          <div class="verse-block">
            <span>오늘 붙들 말씀 · ${devotion.reference}</span>
            <p>“${devotion.verse}”</p>
            <small>${devotion.passage}</small>
          </div>

          <div class="reflection-grid">
            <div>
              <span>생각할 질문</span>
              <p>${devotion.prompts[0]}</p>
            </div>
            <div>
              <span>오늘의 한 가지 적용</span>
              <p>${devotion.action}</p>
            </div>
          </div>

          <div class="prayer-line">
            ${icon("heart")}
            <p>${devotion.prayer}</p>
          </div>
        </article>

        <aside class="journal-card">
          <div class="journal-head">
            <p>묵상 기록</p>
            <span>기록은 이 기기에만 저장됩니다</span>
          </div>
          <div class="chip-row">
            ${devotion.prompts.slice(1).map((prompt, index) => `<button class="chip" data-prompt-index="${index}" type="button">${prompt}</button>`).join("")}
          </div>
          <textarea id="journal-entry" placeholder="오늘 받은 마음, 적용할 한 문장, 기도 제목을 적어보세요.">${journal}</textarea>
        </aside>
      </main>

      <footer class="detail-bottom">
        <button class="text-button" data-action="list" type="button">${icon("list")} 목록</button>
        <div class="detail-nav" aria-label="묵상 이동">
          <button class="icon-button" data-action="previous" type="button" aria-label="이전 묵상">${icon("chevronLeft")}</button>
          <span>${state.selected + 1} / ${devotions.length}</span>
          <button class="icon-button" data-action="next" type="button" aria-label="다음 묵상">${icon("chevronRight")}</button>
        </div>
        <button class="text-button complete ${isDone ? "done" : ""}" data-action="complete-day" type="button">
          ${icon("check")} ${isDone ? "묵상 완료됨" : "묵상 완료"}
        </button>
      </footer>
    </section>
  `;
}

function openDetail(index, transition = "open") {
  state.selected = (index + devotions.length) % devotions.length;
  state.view = "detail";
  persist();
  render(transition);
}

function openList() {
  state.view = "list";
  persist();
  render("back");
}

function moveDetail(direction) {
  openDetail(state.selected + direction, direction > 0 ? "slide-left" : "slide-right");
}

$app.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.open) openDetail(Number(button.dataset.open));
  if (button.dataset.jump) openDetail(Number(button.dataset.jump), "fade");
  if (button.dataset.action === "list") openList();
  if (button.dataset.action === "previous") moveDetail(-1);
  if (button.dataset.action === "next") moveDetail(1);
  if (button.dataset.action === "complete-day") {
    const id = devotions[state.selected].id;
    if (state.completed.has(id)) state.completed.delete(id);
    else state.completed.add(id);
    persist();
    render("fade");
  }
  if (button.dataset.promptIndex) {
    const devotion = devotions[state.selected];
    const prompt = devotion.prompts[Number(button.dataset.promptIndex) + 1];
    const current = state.entries[devotion.id] || "";
    state.entries[devotion.id] = current.includes(prompt) ? current : `${current}${current ? "\n" : ""}${prompt}`;
    persist();
    render("fade");
    document.querySelector("#journal-entry")?.focus();
  }
});

$app.addEventListener("input", (event) => {
  if (event.target.id !== "journal-entry") return;

  const devotion = devotions[state.selected];
  state.entries[devotion.id] = event.target.value;
  persist();
});

render();
