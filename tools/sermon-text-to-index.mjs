import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const inputPath = path.join(root, "새본문.txt");
const indexPath = path.join(root, "index.html");
const generatedDir = path.join(root, "assets", "devotion", "generated");
const archiveDir = path.join(root, "archive");

const dayIds = ["mon", "tue", "wed", "thu", "fri", "sat"];
const weekdays = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
const segmentLabels = {
  월: "mon",
  월요일: "mon",
  mon: "mon",
  monday: "mon",
  화: "tue",
  화요일: "tue",
  tue: "tue",
  tuesday: "tue",
  수: "wed",
  수요일: "wed",
  wed: "wed",
  wednesday: "wed",
  목: "thu",
  목요일: "thu",
  thu: "thu",
  thursday: "thu",
  금: "fri",
  금요일: "fri",
  fri: "fri",
  friday: "fri",
  토: "sat",
  토요일: "sat",
  sat: "sat",
  saturday: "sat"
};

if (!existsSync(inputPath)) {
  await writeFile(inputPath, sampleInput(), "utf8");
  console.log("새본문.txt를 만들었습니다.");
  console.log("파일을 열어 새 설교 본문을 붙여넣고 저장한 뒤, 배치파일을 다시 실행하세요.");
  process.exit(1);
}

if (!existsSync(indexPath)) {
  console.error("이 폴더에서 index.html을 찾지 못했습니다.");
  process.exit(1);
}

const sourceText = stripBom(await readFile(inputPath, "utf8"));
if (!hasRealInput(sourceText)) {
  console.error("새본문.txt에 새 설교 본문을 먼저 붙여넣고 저장해 주세요.");
  process.exit(1);
}

const indexHtml = await readFile(indexPath, "utf8");
const weeklyContent = buildWeeklyContent(sourceText);
const archiveEntries = await buildArchive(indexHtml, weeklyContent);
let updatedHtml = replaceWeeklyContent(indexHtml, weeklyContent);
updatedHtml = replaceWeeklyArchive(updatedHtml, archiveEntries);
const backupPath = path.join(root, `index.backup.${timestamp()}.html`);

await copyFile(indexPath, backupPath);
await writeFile(indexPath, updatedHtml, "utf8");
await syncArchivePages(archiveEntries, weeklyContent);

console.log("");
console.log(`완료: ${weeklyContent.sermonDate}`);
console.log(`제목: ${weeklyContent.themeTitle}`);
console.log(`본문: ${weeklyContent.passage}`);
console.log(`백업: ${path.basename(backupPath)}`);
console.log("");
console.log("새 카드 이미지를 직접 넣을 때의 파일명:");
for (const dayId of dayIds) {
  console.log(`  assets\\devotion\\generated\\${weeklyContent.weekId}-${dayId}.png`);
}
console.log("");

function buildWeeklyContent(raw) {
  const text = removeGuideLines(raw);
  const meta = parseMeta(text);
  const sections = splitSections(text);
  const dayStart = addDays(meta.date, 1);
  const segments = parseSegments(text);

  return cleanObject({
    weekId: meta.weekId,
    sermonDate: meta.sermonDate,
    themeTitle: meta.themeTitle,
    passage: meta.passage,
    journeyTitle: "6일 말씀 묵상 여정",
    sermonVideo: meta.sermonVideo,
    days: dayIds.map((id, index) => {
      const section = sectionForDay(sections, index);
      const variant = sectionVariant(sections, index);
      const date = addDays(dayStart, index);
      const imagePath = path.join(generatedDir, `${meta.weekId}-${id}.png`);
      const image = existsSync(imagePath) ? `./assets/devotion/generated/${meta.weekId}-${id}.png` : undefined;
      return makeDay({
        id,
        index,
        variant,
        section,
        date,
        passage: meta.passage,
        image,
        video: segments[id]
      });
    })
  });
}

function parseMeta(text) {
  const header = firstMeaningfulLine(text);
  const titleByLabel = matchLine(text, /^(?:제목|설교제목)\s*[:：]\s*(.+)$/m);
  const passageByLabel = matchLine(text, /^(?:본문|성경본문|성경)\s*[:：]\s*(.+)$/m);
  const dateByLabel = matchLine(text, /^(?:날짜|설교일|일자)\s*[:：]\s*(.+)$/m);
  const videoByLabel = matchLine(text, /^(?:영상|유튜브|youtube|YouTube)\s*[:：]\s*(.+)$/m);

  const date = parseDate(dateByLabel || header || text) || new Date();
  const themeTitle = cleanTitle(titleByLabel || quotedTitle(header) || guessTitleFromHeader(header) || "주일 말씀 묵상");

  return {
    date,
    weekId: formatDateId(date),
    sermonDate: `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 주일설교`,
    themeTitle,
    passage: normalizePassage(passageByLabel || guessPassage(header) || guessPassage(text) || "본문"),
    sermonVideo: cleanVideoUrl(videoByLabel || findYoutubeUrl(text) || "")
  };
}

function makeDay({ id, index, variant, section, date, passage, image, video }) {
  const profile = classifySection(section);
  const title = dayTitle(section, profile, variant);
  const navTitle = dayNavTitle(section, profile, variant);
  const focus = sectionFocusText(section, variant);
  const reference = firstReference(focus) || firstReference(section.content) || passage;
  const verse = dayVerse(focus, profile, title, variant);

  return cleanObject({
    id,
    image: image || defaultImageFor(profile, index, variant),
    accent: accentFor(profile, index),
    title,
    subtitle: `${date.getMonth() + 1}.${date.getDate()} ${weekdays[index]} · ${navTitle}`,
    reference,
    passage,
    verse,
    reading: readingText(section, profile, variant),
    prayer: prayerText(profile, title),
    action: actionText(profile, title),
    familyQuestion: familyQuestionText(profile, title),
    prompts: prompts(profile, title),
    video
  });
}

function classifySection(section) {
  const text = `${section.title} ${section.content}`;
  if (hasAny(text, ["향유", "죄 사함", "죄 지은", "회개", "눈물", "평안히"])) return "forgiveness";
  if (hasAny(text, ["침례요한", "감옥", "확신", "흔들", "메시야", "증거"])) return "assurance";
  if (hasAny(text, ["과부", "죽은 아들", "장례", "울지 말", "소망", "살려"])) return "hope";
  if (hasAny(text, ["원수", "선대", "미워"])) return "enemyLove";
  if (hasAny(text, ["사랑", "긍휼", "용서", "종을 사랑", "백부장"])) return "love";
  if (hasAny(text, ["저주", "축복", "모욕", "입술"])) return "blessing";
  if (hasAny(text, ["들보", "티", "자기", "정한 마음", "성찰", "회개"])) return "self";
  if (hasAny(text, ["안식일", "병든", "고통", "회복", "규정", "사람을 보"])) return "compassion";
  if (hasAny(text, ["말씀", "반석", "집", "행하는", "준행", "순종", "듣고"])) return "word";
  if (hasAny(text, ["기도", "성령", "충만", "제자", "부르"])) return "prayer";
  return "general";
}

function dayTitle(section, profile, variant) {
  const title = cleanTitle(section.title);
  const table = {
    enemyLove: ["사랑의 범위가 넓어진 사람", "원수까지 품는 성령의 사람"],
    love: ["사랑이 믿음을 깊게 하다", "사랑으로 사람을 귀히 여기다"],
    hope: ["슬픔을 보시는 주님", "의외의 은혜가 소망이 되다"],
    assurance: ["흔들리는 믿음에도 찾아오시는 사랑", "확신을 주시는 주님의 사랑"],
    forgiveness: ["용서받은 사랑으로 드리는 사랑", "평안으로 돌려보내시는 주님"],
    blessing: ["저주 대신 축복을 선택하다", "모욕 앞에서 기도로 반응하다"],
    self: ["먼저 내 들보를 보는 사람", "정한 마음으로 나를 살피다"],
    compassion: ["규정보다 사람을 보는 눈", "고통을 보고 회복을 선택하다"],
    word: ["말씀 위에 삶을 세우다", "듣고 준행하는 주의 자녀"],
    prayer: ["기도로 주님께 나아가다", "성령의 인도를 구하다"],
    general: [title || "말씀을 마음에 새기다", title ? `${shorten(title, 12)}을 삶으로 옮기다` : "믿음으로 하루를 걷다"]
  };
  return table[profile][variant % table[profile].length];
}

function dayNavTitle(section, profile, variant) {
  const title = cleanTitle(section.title);
  const table = {
    enemyLove: ["사랑의 범위", "원수 사랑"],
    love: ["백부장의 사랑", "믿음을 깊게 하는 사랑"],
    hope: ["과부를 보신 주님", "소망을 주시는 은혜"],
    assurance: ["흔들리는 요한", "확신을 주시는 사랑"],
    forgiveness: ["향유를 부은 사랑", "죄 사함과 평안"],
    blessing: ["축복의 입술", "기도의 반응"],
    self: ["자기 성찰", "정한 마음"],
    compassion: ["회복의 시선", "사람을 보는 눈"],
    word: ["반석 위의 집", "말씀 순종"],
    prayer: ["기도의 자리", "성령의 인도"],
    general: [shorten(title || "묵상", 8), "삶의 적용"]
  };
  return table[profile][variant % table[profile].length];
}

function dayVerse(focusText, profile, title, variant = 0) {
  const quoted = firstQuotedSentence(focusText);
  if (quoted) return quoted;

  const table = {
    enemyLove: [
      "너희 원수를 사랑하며 너희를 미워하는 자를 선대하며",
      "너희를 저주하는 자를 위하여 축복하며 너희를 모욕하는 자를 위하여 기도하라"
    ],
    love: [
      "어떤 백부장의 사랑하는 종이 병들어 죽게 되었더니",
      "이스라엘 중에서도 이만한 믿음은 만나보지 못하였노라"
    ],
    hope: [
      "주께서 과부를 보시고 불쌍히 여기사 울지 말라 하시고",
      "죽었던 자가 일어나 앉고 말도 하거늘 예수께서 그를 어머니에게 주시니"
    ],
    assurance: [
      "오실 그이가 당신이오니이까 우리가 다른 이를 기다리오리이까",
      "맹인이 보며 못 걷는 사람이 걸으며 나병환자가 깨끗함을 받으며"
    ],
    forgiveness: [
      "그 동네에 죄를 지은 한 여자가 있어 예수께서 바리새인의 집에 앉아 계심을 알고",
      "네 죄 사함을 받았느니라"
    ],
    blessing: [
      "너희를 저주하는 자를 위하여 축복하며 너희를 모욕하는 자를 위하여 기도하라",
      "선한 사람은 마음에 쌓은 선에서 선을 내고"
    ],
    self: [
      "너는 네 눈 속에 있는 들보는 깨닫지 못하느냐",
      "먼저 네 눈 속에서 들보를 빼라"
    ],
    compassion: [
      "사람의 생명을 구하는 것이 옳으냐 죽이는 것이 옳으냐",
      "그들을 둘러보시고 그 사람에게 이르시되 네 손을 내밀라"
    ],
    word: [
      "내 말을 듣고 행하는 자마다 누구와 같은 것을 너희에게 보이리라",
      "주추를 반석 위에 놓은 사람과 같으니"
    ],
    prayer: [
      "예수께서 기도하시러 산으로 가사 밤이 새도록 하나님께 기도하시고",
      "밝으매 그 제자들을 부르사 그 중에서 열둘을 택하여"
    ]
  };
  const verses = table[profile];
  if (Array.isArray(verses)) return verses[Math.min(variant, verses.length - 1)];
  return `${title}의 말씀을 오늘 마음에 새깁니다`;
}

function readingText(section, profile, variant) {
  const focus = sectionFocusText(section, variant);
  const body = firstSentences(focus, 2);
  if (body.length >= 80) return shorten(body, 165);

  const additions = {
    enemyLove: "성령의 사람은 사랑하기 쉬운 사람에게만 머물지 않고, 주님의 마음으로 사랑의 경계를 넓혀 갑니다.",
    love: "성령의 사람은 사랑하기 쉬운 사람에게만 머물지 않고, 주님의 마음으로 사랑의 경계를 넓혀 갑니다.",
    hope: "주님은 아무도 도움을 구하지 못한 자리에서도 슬픔을 보시고, 의외의 은혜로 다시 소망을 열어 주십니다.",
    assurance: "주님은 흔들리는 믿음을 책망하기보다 다시 붙들 증거와 소망을 주시며 사랑으로 일으켜 세우십니다.",
    forgiveness: "주님의 사랑을 아는 사람은 회개와 감사의 사랑으로 나아가고, 주님은 죄 사함과 평안으로 응답하십니다.",
    blessing: "성령의 사람은 상처의 흐름을 반복하지 않고, 축복과 기도로 새 길을 엽니다.",
    self: "성령의 사람은 다른 사람을 고치기 전에 먼저 자기 안의 들보를 주님 앞에서 봅니다.",
    compassion: "성령의 사람은 기준과 규정 뒤에 가려진 사람의 아픔과 필요를 볼 줄 압니다.",
    word: "성령의 사람은 말씀을 듣는 자리에서 멈추지 않고, 그 말씀 위에 오늘의 선택과 삶을 세웁니다.",
    prayer: "성령의 사람은 중요한 선택 앞에서 먼저 주님께 나아가 기도하며 인도를 구합니다.",
    general: "오늘 말씀은 주님이 찾으시는 사람의 모습을 우리 삶에 비추어 보게 합니다."
  };
  return `${body ? `${body} ` : ""}${additions[profile] || additions.general}`;
}

function sectionFocusText(section, variant = 0) {
  const parts = String(section.content || "")
    .split(/(?=\(\d+\)\s*)/g)
    .map((part) => cleanNumberedMarkers(part))
    .filter(Boolean);

  if (parts.length > 1) return parts[Math.min(variant, parts.length - 1)];
  return cleanNumberedMarkers(section.content);
}

function cleanNumberedMarkers(value) {
  return String(value || "")
    .replace(/(^|\n)\s*\(\d+\)\s*/g, "$1")
    .replace(/\s+\(\d+\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function defaultImageFor(profile, index, variant) {
  const byProfile = {
    love: ["./assets/devotion/warm-notebook.png", "./assets/devotion/warm-open-bible.png"],
    enemyLove: ["./assets/devotion/warm-notebook.png", "./assets/devotion/warm-open-bible.png"],
    hope: ["./assets/devotion/warm-meadow.png", "./assets/devotion/field.jpg"],
    assurance: ["./assets/devotion/warm-candle.png", "./assets/devotion/candle.jpg"],
    forgiveness: ["./assets/devotion/warm-pages.png", "./assets/devotion/warm-wheat.png"],
    blessing: ["./assets/devotion/warm-wheat.png", "./assets/devotion/wheat.jpg"],
    self: ["./assets/devotion/warm-open-bible.png", "./assets/devotion/book-hand.jpg"],
    compassion: ["./assets/devotion/warm-meadow.png", "./assets/devotion/bible-path.jpg"],
    word: ["./assets/devotion/warm-pages.png", "./assets/devotion/pages.jpg"],
    prayer: ["./assets/devotion/warm-candle.png", "./assets/devotion/candle.jpg"]
  };
  const rotation = byProfile[profile] || [
    "./assets/devotion/warm-open-bible.png",
    "./assets/devotion/warm-notebook.png",
    "./assets/devotion/warm-meadow.png",
    "./assets/devotion/warm-candle.png",
    "./assets/devotion/warm-pages.png",
    "./assets/devotion/warm-wheat.png"
  ];
  return byProfile[profile]
    ? rotation[variant % rotation.length]
    : rotation[index % rotation.length];
}

function accentFor(profile, index) {
  const table = {
    love: "#317b65",
    enemyLove: "#317b65",
    hope: "#4d8a55",
    assurance: "#8b689d",
    forgiveness: "#b66550",
    blessing: "#b77716",
    self: "#4f7fa8",
    compassion: "#4d8a55",
    word: "#4f7fa8",
    prayer: "#8b689d"
  };
  const fallback = ["#317b65", "#b66550", "#4d8a55", "#8b689d", "#4f7fa8", "#b77716"];
  return table[profile] || fallback[index % fallback.length];
}

function prayerText(profile, title) {
  const table = {
    enemyLove: "성령님, 제 사랑의 경계를 넓혀 주시고 주님의 마음으로 사람을 보게 하옵소서.",
    love: "성령님, 제 사랑의 경계를 넓혀 주시고 주님의 마음으로 사람을 보게 하옵소서.",
    hope: "주님, 슬픔과 막막함 속에서도 저를 보시는 주님의 사랑을 신뢰하게 하옵소서.",
    assurance: "주님, 흔들리는 순간에도 책망보다 사랑으로 확신을 주시는 주님을 바라보게 하옵소서.",
    forgiveness: "주님, 받은 용서와 사랑을 기억하며 감사의 사랑으로 주님께 나아가게 하옵소서.",
    blessing: "성령님, 제 입술이 상처를 반복하지 않고 축복과 기도의 통로가 되게 하옵소서.",
    self: "주님, 제 안의 들보를 먼저 보게 하시고 정한 마음을 새롭게 하옵소서.",
    compassion: "성령님, 규정 뒤에 가려진 사람의 아픔과 필요를 볼 수 있는 눈을 주옵소서.",
    word: "주님, 제가 말씀을 듣기만 하는 사람이 아니라 오늘 한 가지라도 행하는 사람이 되게 하옵소서.",
    prayer: "성령님, 기도의 자리에서 주님의 뜻을 듣고 순종하게 하옵소서."
  };
  return table[profile] || `주님, ${title}의 말씀이 오늘 제 삶에 실제가 되게 하옵소서.`;
}

function actionText(profile, title) {
  const table = {
    enemyLove: "마음이 불편한 한 사람을 떠올리고, 그를 위해 짧게 축복의 기도를 드립니다.",
    love: "마음이 불편한 한 사람을 떠올리고, 그를 위해 짧게 축복의 기도를 드립니다.",
    hope: "소망이 끊긴 것처럼 느껴지는 한 가지 일을 주님 앞에 적고 다시 맡깁니다.",
    assurance: "요즘 흔들리는 믿음의 질문 하나를 적고, 주님이 이미 보여주신 은혜의 증거를 함께 기록합니다.",
    forgiveness: "오늘 받은 용서를 기억하며 감사의 표현 하나를 실제 행동으로 드립니다.",
    blessing: "불평이나 비난이 나오려는 순간 멈추고, 축복의 말 한 문장으로 바꿔 봅니다.",
    self: "오늘 판단했던 사람을 떠올리고, 그 판단 속에 숨어 있는 내 들보를 한 문장으로 적습니다.",
    compassion: "오늘 만나는 사람 중 한 명의 필요를 살피고, 작지만 실제적인 도움을 선택합니다.",
    word: "오늘 들은 말씀 중 즉시 순종할 수 있는 한 가지를 정하고 실행합니다.",
    prayer: "중요한 결정 하나를 놓고 잠시 멈추어 기도로 주님께 맡깁니다."
  };
  return table[profile] || `${title}과 연결된 작은 순종 하나를 오늘 실천합니다.`;
}

function familyQuestionText(profile, title) {
  const table = {
    enemyLove: "우리 가족이 이번 주 더 넓은 사랑으로 품어야 할 사람은 누구일까요?",
    love: "우리 가족이 이번 주 더 넓은 사랑으로 품어야 할 사람은 누구일까요?",
    hope: "우리 가족이 낙심한 사람에게 소망을 전하기 위해 할 수 있는 작은 위로는 무엇일까요?",
    assurance: "우리 가족이 흔들릴 때 함께 기억해야 할 주님의 은혜는 무엇일까요?",
    forgiveness: "우리 가족이 받은 용서와 사랑을 기억하며 감사로 표현할 일은 무엇일까요?",
    blessing: "우리 가정의 말이 축복이 되려면 오늘 어떤 표현을 바꾸면 좋을까요?",
    self: "가족 안에서 서로를 판단하기 전에 먼저 돌아볼 내 모습은 무엇일까요?",
    compassion: "우리 가족이 오늘 한 사람의 필요를 살피고 도울 수 있는 작은 일은 무엇일까요?",
    word: "오늘 말씀을 우리 집에서 함께 실천한다면 어떤 한 가지를 시작할 수 있을까요?",
    prayer: "우리 가족이 함께 기도로 주님께 맡겨야 할 일은 무엇일까요?"
  };
  return table[profile] || `${title}의 말씀을 우리 가족은 어떻게 함께 실천할 수 있을까요?`;
}

function prompts(profile, title) {
  const table = {
    enemyLove: ["오늘 내 사랑의 범위 밖에 두고 있는 사람은 누구인가요?", "축복 기도", "선대 선택", "미움 내려놓기"],
    love: ["오늘 내 사랑의 범위 밖에 두고 있는 사람은 누구인가요?", "축복 기도", "선대 선택", "미움 내려놓기"],
    hope: ["주님이 오늘 내 슬픔과 막막함을 보고 계신다는 사실은 어떤 위로가 되나요?", "소망 붙들기", "위로 전하기", "주님께 맡기기"],
    assurance: ["요즘 내 믿음을 흔들리게 하는 질문은 무엇이며, 주님은 어떤 증거로 나를 붙드시나요?", "질문 적기", "은혜 기억", "소망 고백"],
    forgiveness: ["내가 받은 용서와 사랑을 기억할 때 오늘 주님께 드릴 감사는 무엇인가요?", "감사 표현", "회개 고백", "평안 누리기"],
    blessing: ["내 입술이 축복보다 반응과 방어에 익숙해진 자리는 어디인가요?", "비난 멈춤", "축복 문장", "기도로 바꾸기"],
    self: ["내가 다른 사람에게서 크게 보던 문제가 사실 내 안에도 있는 것은 무엇인가요?", "판단 멈춤", "내 들보 보기", "정한 마음 구하기"],
    compassion: ["나는 요즘 사람의 아픔보다 기준과 평가를 먼저 보고 있지는 않나요?", "필요 살피기", "작은 도움", "회복의 시선"],
    word: ["내가 알고는 있지만 아직 행하지 못한 주님의 말씀은 무엇인가요?", "한 가지 순종", "말씀 실천", "반석 위에 세우기"],
    prayer: ["오늘 내가 먼저 기도로 주님께 가져가야 할 결정은 무엇인가요?", "멈추고 기도", "인도 구하기", "순종 선택"]
  };
  return table[profile] || [`오늘 ${title} 앞에서 주님이 제게 원하시는 반응은 무엇인가요?`, "멈추기", "기도하기", "실천하기"];
}

function splitSections(text) {
  const body = removeMetadataBlocks(text);
  const matches = [...body.matchAll(/^\s*(첫째(?:로)?|둘째(?:로)?|셋째(?:로)?|넷째(?:로)?|다섯째(?:로)?|여섯째(?:로)?|1[.)]|2[.)]|3[.)]|4[.)]|5[.)]|6[.)])\s*[,，.]?\s*(.+)$/gm)];

  if (matches.length) {
    return matches.map((match, index) => {
      const start = match.index || 0;
      const end = matches[index + 1]?.index ?? body.length;
      const content = body.slice(start, end).replace(match[0], "").trim();
      return {
        title: cleanTitle(match[2]),
        content
      };
    }).filter((section) => section.title || section.content);
  }

  const paragraphs = body.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  const chunkSize = Math.max(1, Math.ceil(paragraphs.length / 3));
  return [0, 1, 2].map((index) => {
    const chunk = paragraphs.slice(index * chunkSize, (index + 1) * chunkSize);
    return {
      title: index === 0 ? "말씀을 받는 사람" : index === 1 ? "자신을 살피는 사람" : "삶으로 행하는 사람",
      content: chunk.join("\n\n")
    };
  }).filter((section) => section.content);
}

function sectionForDay(sections, index) {
  if (!sections.length) return { title: "말씀 묵상", content: "" };
  if (sections.length >= 6) return sections[index] || sections[sections.length - 1];
  if (sections.length === 5) return sections[[0, 1, 2, 3, 4, 4][index]];
  if (sections.length === 4) return sections[[0, 0, 1, 2, 3, 3][index]];
  if (sections.length >= 3) return sections[Math.min(Math.floor(index / 2), sections.length - 1)];
  if (sections.length === 2) return sections[index < 3 ? 0 : 1];
  return sections[0];
}

function sectionVariant(sections, index) {
  if (sections.length >= 6) return 0;
  if (sections.length === 5) return [0, 0, 0, 0, 0, 1][index];
  if (sections.length === 4) return [0, 1, 0, 0, 0, 1][index];
  if (sections.length >= 3) return index % 2;
  if (sections.length === 2) return index % 3;
  return index % 2;
}

function parseSegments(text) {
  const segments = {};
  const segmentRegex = /^\s*(월요일?|화요일?|수요일?|목요일?|금요일?|토요일?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\s*[:：]\s*(\d{1,2}:\d{2})(?:\s*[-~–]\s*(\d{1,2}:\d{2}))?/gim;
  for (const match of text.matchAll(segmentRegex)) {
    const key = segmentLabels[match[1].toLowerCase()] || segmentLabels[match[1]];
    if (key) segments[key] = cleanObject({ start: match[2], end: match[3] });
  }
  return segments;
}

async function buildArchive(indexHtml, newWeeklyContent) {
  const entries = [];
  const existing = extractWeeklyArchive(indexHtml);
  const current = extractWeeklyContent(indexHtml);

  entries.push(...existing);

  if (current?.weekId && current.weekId !== newWeeklyContent.weekId) {
    await archiveCurrentPage(indexHtml, current);
    entries.push(archiveEntryFor(current, `./archive/${current.weekId}.html`));
  }

  entries.push(archiveEntryFor(newWeeklyContent, "./index.html"));
  return dedupeArchive(entries);
}

async function archiveCurrentPage(indexHtml, current) {
  await mkdir(archiveDir, { recursive: true });
  const archivePath = path.join(archiveDir, `${current.weekId}.html`);
  await writeFile(archivePath, makeArchivedHtml(indexHtml), "utf8");
}

async function syncArchivePages(entries, newestContent) {
  if (!existsSync(archiveDir)) return;

  await Promise.all(entries
    .filter((entry) => entry.weekId !== newestContent.weekId)
    .map(async (entry) => {
      const archivePath = path.join(archiveDir, `${entry.weekId}.html`);
      if (!existsSync(archivePath)) return;
      const html = await readFile(archivePath, "utf8");
      const archiveEntries = entries.map((item) => ({
        ...item,
        href: item.weekId === newestContent.weekId ? "../index.html" : `./${item.weekId}.html`
      }));
      await writeFile(archivePath, replaceWeeklyArchive(makeArchivedHtml(html), archiveEntries), "utf8");
    }));
}

function makeArchivedHtml(html) {
  return html
    .replace(/(["'(])\.\/assets\//g, "$1../assets/")
    .replace(/(["'(])\.\/netlify-site\.zip/g, "$1../netlify-site.zip");
}

function archiveEntryFor(content, href) {
  return {
    weekId: content.weekId,
    sermonDate: content.sermonDate,
    themeTitle: content.themeTitle,
    passage: content.passage,
    href
  };
}

function dedupeArchive(entries) {
  const byWeek = new Map();
  entries
    .filter((entry) => entry?.weekId)
    .forEach((entry) => {
      byWeek.set(entry.weekId, {
        weekId: entry.weekId,
        sermonDate: entry.sermonDate || entry.weekId,
        themeTitle: entry.themeTitle || "주일 말씀 묵상",
        passage: entry.passage || "",
        href: entry.href || `./archive/${entry.weekId}.html`
      });
    });
  return [...byWeek.values()].sort((a, b) => b.weekId.localeCompare(a.weekId));
}

function extractWeeklyContent(html) {
  const start = html.indexOf("const weeklyContent =");
  if (start < 0) return null;
  const braceStart = html.indexOf("{", start);
  if (braceStart < 0) return null;
  const braceEnd = findMatchingBrace(html, braceStart);
  return parseJsLiteral(html.slice(braceStart, braceEnd + 1));
}

function extractWeeklyArchive(html) {
  const start = html.indexOf("const weeklyArchive =");
  if (start < 0) return [];
  const arrayStart = html.indexOf("[", start);
  if (arrayStart < 0) return [];
  const arrayEnd = findMatchingArray(html, arrayStart);
  return parseJsLiteral(html.slice(arrayStart, arrayEnd + 1)) || [];
}

function parseJsLiteral(source) {
  try {
    return Function(`"use strict"; return (${source});`)();
  } catch (error) {
    return null;
  }
}

function removeMetadataBlocks(text) {
  const firstLine = firstMeaningfulLine(text);
  const looksLikeHeader = Boolean(parseDate(firstLine) && guessPassage(firstLine));
  const filtered = removeGuideLines(text)
    .split(/\r?\n/)
    .filter((line) => !/^\s*(제목|설교제목|본문|성경본문|성경|날짜|설교일|일자|영상|유튜브|youtube)\s*[:：]/i.test(line))
    .filter((line) => !/^\s*(월요일?|화요일?|수요일?|목요일?|금요일?|토요일?|mon|tue|wed|thu|fri|sat)\s*[:：]\s*\d{1,2}:\d{2}/i.test(line))
    .join("\n")
    .trim();

  return looksLikeHeader ? filtered.replace(firstLine, "").trim() : filtered;
}

function removeGuideLines(text) {
  return stripBom(text)
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("#"))
    .filter((line) => !line.includes("__PASTE_SERMON_TEXT_HERE__"))
    .join("\n")
    .trim();
}

function replaceWeeklyContent(html, content) {
  const start = html.indexOf("const weeklyContent =");
  if (start < 0) throw new Error("index.html에서 const weeklyContent = 를 찾지 못했습니다.");

  const braceStart = html.indexOf("{", start);
  if (braceStart < 0) throw new Error("weeklyContent 객체의 시작 부분을 찾지 못했습니다.");

  const braceEnd = findMatchingBrace(html, braceStart);
  const semicolon = html.indexOf(";", braceEnd);
  if (semicolon < 0) throw new Error("weeklyContent 객체의 끝 세미콜론을 찾지 못했습니다.");

  const replacement = `const weeklyContent = ${JSON.stringify(content, null, 2)};\n`;
  return `${html.slice(0, start)}${replacement}${html.slice(semicolon + 1)}`;
}

function replaceWeeklyArchive(html, entries) {
  const replacement = `const weeklyArchive = ${JSON.stringify(entries, null, 2)};\n`;
  const start = html.indexOf("const weeklyArchive =");

  if (start >= 0) {
    const arrayStart = html.indexOf("[", start);
    if (arrayStart < 0) throw new Error("weeklyArchive 배열의 시작 부분을 찾지 못했습니다.");
    const arrayEnd = findMatchingArray(html, arrayStart);
    const semicolon = html.indexOf(";", arrayEnd);
    if (semicolon < 0) throw new Error("weeklyArchive 배열의 끝 세미콜론을 찾지 못했습니다.");
    return `${html.slice(0, start)}${replacement}${html.slice(semicolon + 1)}`;
  }

  const contentStart = html.indexOf("const weeklyContent =");
  if (contentStart < 0) throw new Error("weeklyArchive를 넣을 위치를 찾지 못했습니다.");
  const braceStart = html.indexOf("{", contentStart);
  const braceEnd = findMatchingBrace(html, braceStart);
  const contentSemicolon = html.indexOf(";", braceEnd);
  if (contentSemicolon < 0) throw new Error("weeklyContent 객체의 끝 세미콜론을 찾지 못했습니다.");
  return `${html.slice(0, contentSemicolon + 1)}\n\n${replacement}${html.slice(contentSemicolon + 1)}`;
}

function findMatchingBrace(text, braceStart) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = braceStart; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  throw new Error("weeklyContent 객체의 닫는 중괄호를 찾지 못했습니다.");
}

function findMatchingArray(text, arrayStart) {
  return findMatchingPair(text, arrayStart, "[", "]", "weeklyArchive 배열");
}

function findMatchingPair(text, pairStart, openToken, closeToken, label) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = pairStart; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === openToken) depth += 1;
    if (char === closeToken) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  throw new Error(`${label}의 닫는 기호를 찾지 못했습니다.`);
}

function normalizePassage(value) {
  return value
    .replace(/\s+/g, " ")
    .replace(/(\d+)\s*장\s*(\d+)\s*[~–-]\s*(\d+)\s*절?/g, "$1장 $2-$3절")
    .replace(/(\d+)\s*장/g, "$1장")
    .trim();
}

function guessPassage(text) {
  if (!text) return "";
  const match = text.match(/([1-3]?\s*[가-힣]+)\s*(\d+)\s*장\s*(\d+)\s*(?:절)?\s*(?:[~\-–]\s*(\d+)\s*절?)?/);
  if (!match) return "";
  const book = match[1].replace(/\s+/g, "");
  const end = match[4] ? `-${match[4]}` : "";
  return `${book} ${match[2]}장 ${match[3]}${end}절`;
}

function guessTitleFromHeader(header) {
  if (!header) return "";
  const match = header.match(/([1-3]?\s*[가-힣]+)\s*(\d+)\s*장\s*(\d+)\s*(?:절)?\s*(?:[~\-–]\s*(\d+)\s*절?)?/);
  if (!match) return "";
  const after = header.slice((match.index || 0) + match[0].length).trim();
  return cleanTitle(after.replace(/^[^\w가-힣]+|[^\w가-힣]+$/g, ""));
}

function parseDate(text) {
  if (!text) return null;
  const match = text.match(/(20\d{2})\s*(?:[.\-/년])\s*(\d{1,2})\s*(?:[.\-/월])\s*(\d{1,2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function quotedTitle(text) {
  if (!text) return "";
  const match = text.match(/['"‘“](.+?)['"’”]/);
  return match?.[1] || "";
}

function firstReference(text) {
  const match = text.match(/[（(]([^()（）]*(?:\d+\s*:\s*\d+)[^()（）]*)[）)]/);
  return match ? match[1].replace(/\s+/g, " ").trim() : "";
}

function firstQuotedSentence(text) {
  const match = text.match(/['"‘“](.{8,90}?)['"’”]/);
  return match ? cleanTitle(match[1]) : "";
}

function firstSentences(text, count) {
  const clean = text
    .replace(/(^|\s)\(\d+\)\s*/g, "$1")
    .replace(/[（(][^()（）]*\d+\s*:\s*\d+[^()（）]*[）)]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";

  const sentences = clean.match(/[^.!?。！？]+(?:[.!?。！？]|다\.|요\.|니다\.)?/g) || [clean];
  return sentences.slice(0, count).join(" ").replace(/\s+/g, " ").trim();
}

function cleanTitle(value) {
  return String(value || "")
    .replace(/[“”‘’"']/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.。]+$/g, "")
    .trim();
}

function cleanVideoUrl(value) {
  return String(value || "").trim();
}

function findYoutubeUrl(text) {
  return text.match(/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s)]+/i)?.[0] || "";
}

function matchLine(text, regex) {
  return text.match(regex)?.[1]?.trim() || "";
}

function firstMeaningfulLine(text) {
  return stripBom(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && !line.includes("__PASTE_SERMON_TEXT_HERE__")) || "";
}

function hasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function shorten(text, max) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateId(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function timestamp() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0")
  ].join("");
}

function stripBom(text) {
  return String(text || "").replace(/^\uFEFF/, "");
}

function hasRealInput(text) {
  const clean = removeGuideLines(text);
  return clean.trim().length > 20;
}

function cleanObject(value) {
  if (Array.isArray(value)) return value.map(cleanObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== null && item !== "")
      .map(([key, item]) => [key, cleanObject(item)])
  );
}

function sampleInput() {
  return `# 새 설교 본문을 아래에 붙여넣고 저장하세요.
# 첫 줄 예시:
# 2026.6.7(주) 누가복음7장1~10절 '말씀 제목'
#
# 선택 사항:
# 영상: https://youtu.be/xxxxxxxxxxx
# 월: 0:00-5:35
# 화: 5:35-10:05
# 수: 10:05-14:20
# 목: 14:20-18:10
# 금: 18:10-22:30
# 토: 22:30-26:05
#
# 아래 줄을 지우고 새 본문을 붙여넣으세요.
__PASTE_SERMON_TEXT_HERE__
`;
}
