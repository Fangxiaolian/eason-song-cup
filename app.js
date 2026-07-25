const BILINGUAL_DEFS = [
  { id: "tomorrow", left: "十年", right: "明年今日", label: "十年 · 明年今日" },
  { id: "fuji", left: "愛情轉移", right: "富士山下", label: "爱情转移 · 富士山下" },
  { id: "rose", left: "紅玫瑰", right: "白玫瑰", label: "红玫瑰 · 白玫瑰" },
  { id: "siblings", left: "兄妹", right: "歲月如歌", label: "兄妹 · 岁月如歌" },
  { id: "meeting", left: "好久不見", right: "不如不見", label: "好久不见 · 不如不见" },
  { id: "karaoke", left: "K歌之王（國）", right: "K歌之王", label: "K歌之王 · 国粤之争", karaoke: true },
  { id: "christmas", left: "聖誕結", right: "Lonely Christmas", label: "圣诞结 · Lonely Christmas" },
  { id: "smoke", left: "煙味", right: "裙下之臣", label: "烟味 · 裙下之臣" }
];

const STORAGE_SCHEMA_VERSION = 6;
const PHASE_LABELS = {
  version: "版本预选",
  preliminary: "三选一海选",
  bilingual: "国粤审判",
  gsl: "GSL死亡小组",
  lcq: "最后机会赛",
  shieldUpper1: "64强胜者区",
  shieldLower1: "败者区生死战",
  shieldUpper2: "32强胜者区",
  shieldCross: "双败汇合战",
  knockout: "单败淘汰赛",
  page: "四强Page审判"
};

const FALLBACK_COVER = "assets/eason-bilibili-cover.png";
const legacyMedia = window.MUSIC_DATA || {};
const spotifyMedia = window.SPOTIFY_MEDIA || {};
const rawCatalog = window.SPOTIFY_CATALOG || [];
const trackPreviews = window.TRACK_PREVIEWS || {};
const reviewExclusions = new Set([...(window.REVIEW_EXCLUSIONS || []), ...(window.VERSION_REVIEW_EXCLUSIONS || [])]);
const METING_API_ENDPOINT = window.METING_API_ENDPOINT || "https://api.i-meto.com/meting/api";
const METING_SERVERS = ["netease", "tencent", "kugou"];
const NETEASE_API_ENDPOINT = String(window.NETEASE_API_ENDPOINT || "").replace(/\/$/, "");
const QQMUSIC_API_ENDPOINT = String(window.QQMUSIC_API_ENDPOINT || "").replace(/\/$/, "");
const APPLE_SEARCH_COUNTRIES = ["HK", "TW", "US"];
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

let selectedMode = "balanced";
let selectedSongId = null;
let state = null;
let toastTimer = null;
let playingButton = null;
let summaryFilter = "all";
const fallbackPreviewCache = new Map();

function comparable(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s*-\s*remix.*$/gi, "")
    .replace(/[’']/g, "")
    .replace(/\([^)]*(live|現場|现场|remaster|重製|重制)[^)]*\)/gi, "")
    .replace(/[-–—]\s*(live|remaster(ed)?|重製|重制).*$/gi, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function versionType(song) {
  const text = `${song.title} ${song.album}`;
  if (/remaster|重製|重制|hqcd/i.test(text)) return "remaster";
  if (/remix|mix\b/i.test(text)) return "remix";
  if (/live|concert|演唱會|演唱会|拉闊|拉阔|duo|moving on stage|get a life|eason's life|third encounter|fear and dreams|903id/i.test(text)) return "live";
  return "studio";
}

function legacyFor(title) {
  const target = comparable(title);
  const direct = Object.entries(legacyMedia).find(([key]) => !key.startsWith("fear:") && comparable(key) === target);
  return direct?.[1] || null;
}

function fearLegacyFor(title) {
  const target = comparable(title);
  const match = Object.entries(legacyMedia).find(([key, media]) => {
    if (!key.startsWith("fear:") || !media.storeUrl) return false;
    try {
      const parts = new URL(media.storeUrl).pathname.split("/").filter(Boolean);
      const slug = decodeURIComponent(parts[2] || "").replace(/-live$/i, "").replace(/-/g, " ");
      return comparable(slug) === target;
    } catch {
      return false;
    }
  });
  return match?.[1] || null;
}

function exactPreviewFor(item, edition) {
  if (/fear and dreams/i.test(item.album)) return fearLegacyFor(item.title);
  if (edition !== "studio") return null;
  return legacyFor(item.title);
}

const songs = rawCatalog.map(item => {
  const legacy = legacyFor(item.title);
  const media = spotifyMedia[item.spotifyAlbumId] || {};
  const mappedPreview = trackPreviews[item.spotifyTrackId] || null;
  const edition = versionType(item);
  const exactPreview = exactPreviewFor(item, edition);
  return {
    ...item,
    sourceAlbum: item.album,
    album: exactPreview?.album || item.album,
    edition,
    cover: exactPreview?.cover || (media.source === "fallback" ? (legacy?.cover || FALLBACK_COVER) : (media.cover || legacy?.cover || FALLBACK_COVER)),
    preview: mappedPreview?.preview || exactPreview?.preview || null,
    previewStoreUrl: mappedPreview?.storeUrl || exactPreview?.storeUrl || null,
    previewSource: mappedPreview?.source || (exactPreview?.preview ? "apple" : null),
    year: exactPreview?.year || null,
    spotifyUrl: `https://open.spotify.com/track/${item.spotifyTrackId}`,
    titleKey: comparable(item.title)
  };
}).filter(song => song.edition !== "remaster" && !/instrumental/i.test(song.title) && !reviewExclusions.has(song.id));

const CATALOG_SIZE = songs.length;
const STORAGE_KEY = `eason-${CATALOG_SIZE}-cup-v${STORAGE_SCHEMA_VERSION}`;
const RESOLVED_PREVIEW_CACHE_KEY = `eason-${CATALOG_SIZE}-resolved-previews-v1`;
const persistentPreviewCache = new Map();
try {
  const storedPreviews = JSON.parse(localStorage.getItem(RESOLVED_PREVIEW_CACHE_KEY) || "{}");
  Object.entries(storedPreviews).forEach(([id, value]) => {
    if (typeof value?.url === "string" && value.url.startsWith("https://") && typeof value.source === "string") persistentPreviewCache.set(id, value);
  });
} catch {
  // Preview lookups remain session-only when browser storage is unavailable.
}

const songById = new Map(songs.map(song => [song.id, song]));

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function orderedSongs(items, mode = selectedMode) {
  if (mode === "random") return shuffle(items);
  return [...items].sort((a, b) => a.titleKey.localeCompare(b.titleKey, "zh-HK") || a.album.localeCompare(b.album, "zh-HK"));
}

function partitionIntoGroups(items, targetCount, prefix, mode) {
  const ordered = orderedSongs(items, mode);
  if (ordered.length < targetCount || ordered.length > targetCount * 3) {
    throw new Error(`无法把 ${ordered.length} 首歌编成 ${targetCount} 组`);
  }
  const sizes = Array(targetCount).fill(1);
  let extras = ordered.length - targetCount;
  for (let index = 0; index < targetCount && extras > 0; index += 1, extras -= 1) sizes[index] += 1;
  for (let index = 0; index < targetCount && extras > 0; index += 1, extras -= 1) sizes[index] += 1;
  const groups = [];
  let cursor = 0;
  sizes.sort((a, b) => b - a).forEach((size, index) => {
    groups.push({ id: `${prefix}${index + 1}`, label: `海选 ${String(index + 1).padStart(3, "0")}`, songIds: ordered.slice(cursor, cursor + size).map(song => song.id) });
    cursor += size;
  });
  return groups;
}

function balancedFixedGroups(ids, count, size, prefix, mode) {
  const items = ids.map(id => songById.get(id));
  const source = mode === "random" ? shuffle(items) : [...items].sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.titleKey.localeCompare(b.titleKey, "zh-HK"));
  const groups = Array.from({ length: count }, (_, index) => ({ id: `${prefix}${index + 1}`, songIds: [] }));
  source.forEach((song, index) => {
    const pass = Math.floor(index / count);
    const slot = index % count;
    groups[pass % 2 ? count - 1 - slot : slot].songIds.push(song.id);
  });
  if (groups.some(group => group.songIds.length !== size)) throw new Error(`${prefix} 分组人数不正确`);
  return groups;
}

function matchesTitle(song, target) {
  const source = song.titleKey;
  const wanted = comparable(target);
  return source === wanted || source.startsWith(wanted) || wanted.startsWith(source);
}

function isMandarinKaraoke(song) {
  return /反正是我|國語|国语/.test(`${song.title} ${song.sourceAlbum || song.album}`);
}

function familyCandidates(definition, side, pool = songs) {
  const target = definition[side];
  if (definition.karaoke) {
    return pool.filter(song => song.titleKey === comparable("K歌之王") && (side === "left" ? isMandarinKaraoke(song) : !isMandarinKaraoke(song)));
  }
  return pool.filter(song => matchesTitle(song, target));
}

function activeBilingualDefinitions(pool = songs) {
  return BILINGUAL_DEFS.filter(definition => familyCandidates(definition, "left", pool).length && familyCandidates(definition, "right", pool).length);
}

function versionGroupKey(song) {
  if (song.titleKey === comparable("K歌之王")) return `${song.titleKey}:${isMandarinKaraoke(song) ? "mandarin" : "cantonese"}`;
  return song.titleKey;
}

function createTournament(mode) {
  selectedMode = mode;
  const titleGroups = new Map();
  songs.forEach(song => {
    const key = versionGroupKey(song);
    if (!titleGroups.has(key)) titleGroups.set(key, []);
    titleGroups.get(key).push(song);
  });

  const versionPlans = [];
  const versionSingles = [];
  [...titleGroups.values()].forEach(candidates => {
    if (candidates.length === 1) versionSingles.push(candidates[0].id);
    else versionPlans.push({ key: candidates[0].titleKey, label: `${candidates[0].title} · 同名版本淘汰`, songIds: candidates.map(song => song.id), cursor: 0, championId: null });
  });

  versionPlans.forEach(plan => {
    plan.key = versionGroupKey(songById.get(plan.songIds[0]));
  });

  const tournament = {
    version: 4,
    mode,
    phase: versionPlans.length ? "version" : "preliminary",
    choiceStartedAt: Date.now(),
    versionPlans,
    versionIndex: 0,
    versionSingles,
    versionWinners: {},
    bilingualDefinitionIds: [],
    preliminaryGroups: [],
    preliminaryIndex: 0,
    preliminaryWinners: [],
    bilingualGroups: [],
    bilingualIndex: 0,
    bilingualWinners: [],
    entrants160: [],
    gsl: null,
    lcq: null,
    shield: null,
    series: null,
    knockout: null,
    page: null,
    championId: null,
    finalFourIds: [],
    decisions: [],
    history: []
  };
  if (!versionPlans.length) prepareMainDraw(tournament);
  return tournament;
}

function prepareMainDraw(tournament) {
  const qualifiedSongs = [...tournament.versionSingles, ...Object.values(tournament.versionWinners)]
    .map(id => songById.get(id)).filter(Boolean);
  const bilingualDefinitions = activeBilingualDefinitions(qualifiedSongs);
  const bilingualIds = new Set();
  tournament.bilingualGroups = bilingualDefinitions.map(definition => {
    const songIds = ["left", "right"].flatMap(side => familyCandidates(definition, side, qualifiedSongs).map(song => song.id));
    songIds.forEach(id => bilingualIds.add(id));
    return { id: `B-${definition.id}`, label: definition.label, songIds };
  });
  const malformedBilingualGroups = tournament.bilingualGroups.filter(group => group.songIds.length !== 2);
  if (malformedBilingualGroups.length) throw new Error(`Bilingual candidates are incomplete: ${JSON.stringify(malformedBilingualGroups)}`);
  tournament.bilingualDefinitionIds = bilingualDefinitions.map(definition => definition.id);
  const ordinary = qualifiedSongs.filter(song => !bilingualIds.has(song.id));
  const preliminaryDraw = partitionIntoGroups(ordinary, 160 - tournament.bilingualGroups.length, "P", tournament.mode);
  const preliminaryByes = preliminaryDraw.filter(group => group.songIds.length === 1).flatMap(group => group.songIds);
  tournament.preliminaryGroups = preliminaryDraw.filter(group => group.songIds.length > 1);
  tournament.preliminaryWinners = preliminaryByes;
}

function versionMatch() {
  const plan = state.versionPlans[state.versionIndex];
  if (!plan) return null;
  if (!plan.championId) return { id: `V-${plan.key}-${plan.cursor}`, label: plan.label, songIds: plan.songIds.slice(0, 3) };
  return { id: `V-${plan.key}-${plan.cursor}`, label: plan.label, songIds: [plan.championId, ...plan.songIds.slice(plan.cursor, plan.cursor + 2)] };
}

function currentContest() {
  if (state.phase === "version") return versionMatch();
  if (state.phase === "preliminary") return state.preliminaryGroups[state.preliminaryIndex];
  if (state.phase === "bilingual") return state.bilingualGroups[state.bilingualIndex];
  if (state.phase === "gsl") return currentGslMatch();
  if (state.phase === "lcq") return currentLcqMatch();
  if (["shieldUpper1", "shieldLower1", "shieldUpper2", "shieldCross"].includes(state.phase)) return state.series.matches[state.series.index];
  if (state.phase === "knockout") return state.knockout.matches[state.knockout.index];
  if (state.phase === "page") return currentPageMatch();
  return null;
}

function currentGslMatch() {
  const group = state.gsl.groups[state.gsl.groupIndex];
  const result = state.gsl.results;
  const pairs = [
    [group.songIds[0], group.songIds[1]],
    [group.songIds[2], group.songIds[3]],
    [result[0]?.winnerId, result[1]?.winnerId],
    [result[0]?.loserIds[0], result[1]?.loserIds[0]],
    [result[2]?.loserIds[0], result[3]?.winnerId]
  ];
  return { id: `${group.id}-${state.gsl.step + 1}`, label: `${group.id} · ${["首轮一", "首轮二", "头名战", "淘汰战", "晋级战"][state.gsl.step]}`, songIds: pairs[state.gsl.step].filter(Boolean) };
}

function currentLcqMatch() {
  const group = state.lcq.groups[state.lcq.groupIndex];
  const result = state.lcq.results;
  const pairs = [
    [group.songIds[3], group.songIds[4]],
    [group.songIds[1], group.songIds[2]],
    [result[0]?.winnerId, result[1]?.loserIds[0]]
  ];
  return { id: `${group.id}-${state.lcq.step + 1}`, label: `${group.id} · ${["末位生死战", "中位资格战", "最后席位战"][state.lcq.step]}`, songIds: pairs[state.lcq.step].filter(Boolean) };
}

function currentPageMatch() {
  const page = state.page;
  const pairs = [
    [page.seeds[0], page.seeds[1]],
    [page.seeds[2], page.seeds[3]],
    [page.results[0]?.loserIds[0], page.results[1]?.winnerId],
    [page.results[0]?.winnerId, page.results[2]?.winnerId]
  ];
  return { id: `PAGE-${page.step + 1}`, label: ["头名资格赛", "四强淘汰赛", "决赛资格赛", "总决赛"][page.step], songIds: pairs[page.step].filter(Boolean) };
}

function snapshotState() {
  const { history, ...rest } = state;
  return JSON.parse(JSON.stringify(rest));
}

function pushHistory() {
  state.history.push(snapshotState());
  if (state.history.length > 3) state.history.shift();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    state.history = [];
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { showToast("本次选择有效，但浏览器暂时无法保存进度"); }
  }
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.version !== 4) return null;
    saved.history = [];
    return saved;
  } catch {
    return null;
  }
}

function startTournament(mode = selectedMode) {
  try {
    state = createTournament(mode);
  } catch (error) {
    showToast(error.message);
    return;
  }
  selectedSongId = null;
  saveState();
  showScreen("stage");
  renderStage();
}

function resumeTournament() {
  state = loadState();
  if (!state) return;
  selectedMode = state.mode;
  selectedSongId = null;
  if (state.championId) {
    showScreen("champion");
    renderChampion();
  } else {
    showScreen("stage");
    renderStage();
  }
}

function chooseCard(songId) {
  selectedSongId = selectedSongId === songId ? null : songId;
  $$(".group-card").forEach(card => card.classList.toggle("selected", card.dataset.songId === selectedSongId));
  $("#stageSubmit").disabled = !selectedSongId;
  const count = currentContest()?.songIds.length || 2;
  $("#stageSubmit").textContent = selectedSongId ? `确认保留这一首，淘汰 ${count - 1} 首` : "选出唯一留下的歌";
}

function recordDecision(contest, winnerId) {
  const loserIds = contest.songIds.filter(id => id !== winnerId);
  const decision = {
    phase: state.phase,
    group: contest.id,
    label: contest.label,
    candidateIds: [...contest.songIds],
    winnerId,
    loserIds,
    durationMs: Math.max(0, Date.now() - (state.choiceStartedAt || Date.now()))
  };
  state.decisions.push(decision);
  return decision;
}

function confirmChoice() {
  const contest = currentContest();
  if (!contest?.songIds.includes(selectedSongId)) return;
  stopPreview();
  pushHistory();
  const decision = recordDecision(contest, selectedSongId);
  advancePhase(decision);
  selectedSongId = null;
  state.choiceStartedAt = Date.now();
  saveState();
  if (state.decisions.length % 30 === 0 && !state.championId) showToast(`已完成 ${state.decisions.length} 次选择，进度已保存`);
  if (state.championId) {
    showScreen("champion");
    renderChampion();
  } else {
    renderStage();
  }
}

function advancePhase(decision) {
  if (state.phase === "version") return advanceVersion(decision);
  if (state.phase === "preliminary") return advancePreliminary(decision);
  if (state.phase === "bilingual") return advanceBilingual(decision);
  if (state.phase === "gsl") return advanceGsl(decision);
  if (state.phase === "lcq") return advanceLcq(decision);
  if (["shieldUpper1", "shieldLower1", "shieldUpper2", "shieldCross"].includes(state.phase)) return advanceShield(decision);
  if (state.phase === "knockout") return advanceKnockout(decision);
  if (state.phase === "page") return advancePage(decision);
}

function advanceVersion(decision) {
  const plan = state.versionPlans[state.versionIndex];
  if (!plan.championId) plan.cursor = decision.candidateIds.length;
  else plan.cursor += decision.candidateIds.length - 1;
  plan.championId = decision.winnerId;
  if (plan.cursor < plan.songIds.length) return;
  state.versionWinners[plan.key] = plan.championId;
  state.versionIndex += 1;
  if (state.versionIndex >= state.versionPlans.length) {
    prepareMainDraw(state);
    state.phase = "preliminary";
  }
}

function advancePreliminary(decision) {
  state.preliminaryWinners.push(decision.winnerId);
  state.preliminaryIndex += 1;
  if (state.preliminaryIndex < state.preliminaryGroups.length) return;
  if (!state.bilingualGroups.length) return completeEntrySelection();
  state.phase = "bilingual";
}

function advanceBilingual(decision) {
  state.bilingualWinners.push(decision.winnerId);
  state.bilingualIndex += 1;
  if (state.bilingualIndex < state.bilingualGroups.length) return;
  completeEntrySelection();
}

function completeEntrySelection() {
  state.entrants160 = [...state.preliminaryWinners, ...state.bilingualWinners];
  if (state.entrants160.length !== 160) throw new Error(`Entry field must contain 160 songs; received ${state.entrants160.length}`);
  setupGsl();
}

function setupGsl() {
  state.phase = "gsl";
  state.gsl = {
    groups: balancedFixedGroups(state.entrants160, 40, 4, "G", state.mode),
    groupIndex: 0,
    step: 0,
    results: [],
    winners: [],
    runners: [],
    eliminated: []
  };
}

function advanceGsl(decision) {
  state.gsl.results[state.gsl.step] = decision;
  state.gsl.step += 1;
  if (state.gsl.step < 5) return;
  state.gsl.winners.push(state.gsl.results[2].winnerId);
  state.gsl.runners.push(state.gsl.results[4].winnerId);
  state.gsl.eliminated.push(state.gsl.results[3].loserIds[0], state.gsl.results[4].loserIds[0]);
  state.gsl.groupIndex += 1;
  state.gsl.step = 0;
  state.gsl.results = [];
  if (state.gsl.groupIndex >= state.gsl.groups.length) setupLcq();
}

function setupLcq() {
  state.phase = "lcq";
  state.lcq = {
    groups: balancedFixedGroups(state.gsl.runners, 8, 5, "LCQ", state.mode),
    groupIndex: 0,
    step: 0,
    results: [],
    qualifiers: []
  };
}

function advanceLcq(decision) {
  state.lcq.results[state.lcq.step] = decision;
  state.lcq.step += 1;
  if (state.lcq.step < 3) return;
  const group = state.lcq.groups[state.lcq.groupIndex];
  state.lcq.qualifiers.push(group.songIds[0], state.lcq.results[1].winnerId, state.lcq.results[2].winnerId);
  state.lcq.groupIndex += 1;
  state.lcq.step = 0;
  state.lcq.results = [];
  if (state.lcq.groupIndex >= state.lcq.groups.length) setupShield([...state.gsl.winners, ...state.lcq.qualifiers]);
}

function makePairs(ids, prefix) {
  const draw = selectedMode === "random" ? shuffle(ids) : [...ids];
  return Array.from({ length: draw.length / 2 }, (_, index) => ({ id: `${prefix}-${index + 1}`, label: `${prefix} · 第 ${index + 1} 场`, songIds: draw.slice(index * 2, index * 2 + 2) }));
}

function setSeries(phase, ids, prefix) {
  state.phase = phase;
  state.series = { matches: makePairs(ids, prefix), index: 0, winners: [], losers: [] };
}

function setupShield(ids) {
  if (ids.length !== 64) throw new Error(`64强人数错误：${ids.length}`);
  state.shield = {};
  setSeries("shieldUpper1", ids, "64强胜者区");
}

function advanceShield(decision) {
  state.series.winners.push(decision.winnerId);
  state.series.losers.push(decision.loserIds[0]);
  state.series.index += 1;
  if (state.series.index < state.series.matches.length) return;
  if (state.phase === "shieldUpper1") {
    state.shield.upper1Winners = state.series.winners;
    state.shield.upper1Losers = state.series.losers;
    setSeries("shieldLower1", state.shield.upper1Losers, "败者区生死战");
  } else if (state.phase === "shieldLower1") {
    state.shield.lowerSurvivors = state.series.winners;
    setSeries("shieldUpper2", state.shield.upper1Winners, "32强胜者区");
  } else if (state.phase === "shieldUpper2") {
    state.shield.upper2Winners = state.series.winners;
    state.shield.upper2Losers = state.series.losers;
    const cross = state.shield.upper2Losers.flatMap((id, index) => [id, state.shield.lowerSurvivors[index]]);
    setSeries("shieldCross", cross, "双败汇合战");
  } else {
    setupKnockout([...state.shield.upper2Winners, ...state.series.winners]);
  }
}

function setupKnockout(ids) {
  state.phase = "knockout";
  state.knockout = { roundSize: ids.length, matches: makePairs(ids, `${ids.length}强`), index: 0, winners: [] };
}

function advanceKnockout(decision) {
  state.knockout.winners.push(decision.winnerId);
  state.knockout.index += 1;
  if (state.knockout.index < state.knockout.matches.length) return;
  const winners = state.knockout.winners;
  if (winners.length === 4) {
    state.finalFourIds = [...winners];
    state.phase = "page";
    state.page = { seeds: winners, step: 0, results: [] };
    return;
  }
  setupKnockout(winners);
}

function advancePage(decision) {
  state.page.results[state.page.step] = decision;
  state.page.step += 1;
  if (state.page.step === 4) state.championId = decision.winnerId;
}

function stageMeta() {
  const contest = currentContest();
  if (state.phase === "version") return { kicker: "VERSION TRIAL", title: contest.label, rule: "\u540c\u540d\u6b4c\u66f2\u7684\u6240\u6709\u6709\u6548\u7248\u672c\u5148\u53ea\u7559\u4e00\u9996\uff1b\u5f55\u97f3\u5ba4\u3001\u73b0\u573a\u53ca\u4e0d\u540c\u6536\u5f55\u90fd\u5728\u8fd9\u91cc\u51b3\u51fa\u552f\u4e00\u4ee3\u8868\u3002", index: state.versionIndex, total: state.versionPlans.length };
  if (state.phase === "version") return { kicker: "VERSION TRIAL", title: contest.label, rule: "同一语言、同一首歌，先选出你真正想保留的版本。", index: state.versionIndex, total: state.versionPlans.length };
  if (state.phase === "preliminary") return { kicker: "SELECT ONE OF THREE", title: contest.label, rule: `${contest.songIds.length} 首只能保留 1 首；其余版本立即离开本届比赛。`, index: state.preliminaryIndex, total: state.preliminaryGroups.length };
  if (state.phase === "bilingual") return { kicker: "LANGUAGE JUDGEMENT", title: contest.label, rule: "两个语种已经分别选出最强版本，现在只能留下一个。", index: state.bilingualIndex, total: state.bilingualGroups.length };
  if (state.phase === "gsl") return { kicker: "GSL GROUP", title: contest.label, rule: "两胜晋级、两负出局；小组第一直通，第二进入最后机会赛。", index: state.gsl.groupIndex * 5 + state.gsl.step, total: 200 };
  if (state.phase === "lcq") return { kicker: "LAST CHANCE", title: contest.label, rule: "Page生存组：此前表现决定顺位，本场决定最后的64强席位。", index: state.lcq.groupIndex * 3 + state.lcq.step, total: 24 };
  if (state.phase.startsWith("shield")) return { kicker: "LIMITED DOUBLE ELIMINATION", title: contest.label, rule: state.phase.includes("Lower") || state.phase === "shieldCross" ? "已经没有退路，败者永久淘汰。" : "胜者留在上区，败者仍有一次生存机会。", index: state.series.index, total: state.series.matches.length };
  if (state.phase === "knockout") return { kicker: "SINGLE ELIMINATION", title: contest.label, rule: "从现在开始没有败者区，也没有第二次机会。", index: state.knockout.index, total: state.knockout.matches.length };
  return { kicker: "PAGE FINAL FOUR", title: contest.label, rule: "最终四强按Page路径争夺冠军，最后一票不可撤回。", index: state.page.step, total: 4 };
}

function renderStage() {
  const contest = currentContest();
  if (!contest) return;
  const meta = stageMeta();
  $("#stageKicker").textContent = `${meta.kicker} · ${state.mode === "balanced" ? "版本相邻" : "完全随机"}`;
  $("#stageTitle").textContent = meta.title;
  $("#stageRule").textContent = meta.rule;
  $("#stageNumber").textContent = String(meta.index + 1).padStart(2, "0");
  $("#stageTotal").textContent = `/ ${meta.total}`;
  $("#progressBar").style.width = `${((meta.index + 1) / meta.total) * 100}%`;
  $("#remainingText").textContent = PHASE_LABELS[state.phase];
  $("#survivorText").textContent = `${state.decisions.length} 次选择已记录`;
  $("#groupGrid").className = `group-grid size-${contest.songIds.length}`;
  $("#groupGrid").innerHTML = contest.songIds.map(id => songCard(songById.get(id))).join("");
  $("#stageSubmit").disabled = true;
  $("#stageSubmit").textContent = "选出唯一留下的歌";
  $("#undoButton").disabled = !state.history.length || state.phase === "page" && state.page.step === 3;
  $$(".group-card").forEach(card => card.addEventListener("click", event => {
    if (event.target.closest(".preview-button, .store-link")) return;
    chooseCard(card.dataset.songId);
  }));
  bindPreviewButtons();
  prepareFallbackPreviews(contest.songIds);
}

function editionLabel(song) {
  if (/fear and dreams/i.test(song.album)) return "FEAR AND DREAMS · LIVE";
  return { live: "现场版本", remaster: "重制版本", remix: "重混版本", studio: "录音室版本" }[song.edition] || "独立版本";
}

function songCard(song, compact = false) {
  const year = song.year ? ` · ${song.year}` : "";
  return `<article class="group-card${compact ? " compact" : ""}" data-song-id="${escapeHtml(song.id)}">
    <div class="card-cover-wrap"><img class="song-cover" src="${escapeHtml(song.cover)}" alt="${escapeHtml(song.title)} 封面" loading="lazy"><span class="selection-mark">✓</span></div>
    <div class="group-card-copy"><span class="edition-label">${escapeHtml(editionLabel(song))}</span><h3>${escapeHtml(song.title)}</h3><p>${escapeHtml(song.album)}${year}</p></div>
    <div class="preview-bar">${previewButton(song, !compact)}<a class="store-link" href="${escapeHtml(song.spotifyUrl)}" target="_blank" rel="noreferrer">Spotify ↗</a></div>
  </article>`;
}

function previewButton(song) {
  if (!song.preview) return `<button class="preview-button compact" data-preview="" data-song-id="${escapeHtml(song.id)}" data-label="试听" aria-label="自动匹配并试听：${escapeHtml(song.title)}" title="点击后自动匹配并试听"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="play-shape" d="m8 5 11 7-11 7Z"/></svg><span>试听</span></button>`;
  return `<button class="preview-button compact" data-preview="${escapeHtml(song.preview)}" data-label="试听" data-song="${escapeHtml(song.title)}" aria-label="试听：${escapeHtml(song.title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="play-shape" d="m8 5 11 7-11 7Z"/></svg><span>试听</span></button>`;
}

function deezerScore(candidate, song) {
  if (!candidate?.preview || !/陳奕迅|陈奕迅|eason chan/i.test(candidate.artist?.name || "")) return -1000;
  const candidateTitle = candidate.title_short || candidate.title;
  if (comparable(candidateTitle) !== song.titleKey) return -1000;
  const candidateText = `${candidate.title || ""} ${candidate.title_version || ""} ${candidate.album?.title || ""}`;
  if ((song.edition === "live") !== (versionType({ title: candidate.title || "", album: candidateText }) === "live")) return -500;
  let score = 100;
  const sourceAlbum = comparable(song.sourceAlbum || song.album);
  const candidateAlbum = comparable(candidate.album?.title || "");
  if (sourceAlbum === candidateAlbum) score += 80;
  else if (sourceAlbum.includes(candidateAlbum) || candidateAlbum.includes(sourceAlbum)) score += 35;
  return score;
}

function isEasonArtist(value) {
  return /陳奕迅|陈奕迅|eason chan/i.test(String(value || ""));
}

function metingScore(candidate, song) {
  const title = candidate?.title || candidate?.name || "";
  const artist = candidate?.author || (Array.isArray(candidate?.artist) ? candidate.artist.join(" / ") : candidate?.artist) || "";
  if (!candidate?.url || !isEasonArtist(artist) || comparable(title) !== song.titleKey) return -1000;

  const album = candidate.album || candidate.album_name || "";
  const candidateEdition = versionType({ title, album });
  if (candidateEdition !== song.edition) return -500;

  let score = 100;
  const sourceAlbum = comparable(song.sourceAlbum || song.album);
  const candidateAlbum = comparable(album);
  if (candidateAlbum && sourceAlbum === candidateAlbum) score += 100;
  else if (candidateAlbum && (sourceAlbum.includes(candidateAlbum) || candidateAlbum.includes(sourceAlbum))) score += 45;
  return score;
}

async function fetchJsonWithTimeout(url, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error(`试听接口返回 ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveMetingPreview(song) {
  const query = `${song.title} ${song.sourceAlbum || song.album} 陈奕迅`;
  const results = await Promise.all(METING_SERVERS.map(async server => {
    try {
      const separator = METING_API_ENDPOINT.includes("?") ? "&" : "?";
      const url = `${METING_API_ENDPOINT}${separator}server=${server}&type=search&id=${encodeURIComponent(query)}&r=${Date.now()}`;
      const payload = await fetchJsonWithTimeout(url);
      const candidates = Array.isArray(payload) ? payload : [];
      const match = candidates
        .map(candidate => ({ candidate, score: metingScore(candidate, song) }))
        .filter(item => item.score >= 100)
        .sort((a, b) => b.score - a.score)[0];
      return match ? { result: { url: match.candidate.url, source: `meting-${server}` }, score: match.score } : null;
    } catch {
      return null;
    }
  }));
  return results.filter(Boolean).sort((a, b) => b.score - a.score)[0]?.result || null;
}

function appleSearchScore(candidate, song) {
  if (!candidate?.previewUrl || !isEasonArtist(candidate.artistName)) return -1000;
  if (comparable(candidate.trackName) !== song.titleKey) return -1000;
  const candidateEdition = versionType({ title: candidate.trackName, album: candidate.collectionName });
  if (candidateEdition !== song.edition) return -500;

  const sourceAlbum = comparable(song.sourceAlbum || song.album);
  const candidateAlbum = comparable(candidate.collectionName);
  if (!candidateAlbum) return -1000;
  let score = 100;
  if (candidateAlbum === sourceAlbum) score += 120;
  else if (candidateAlbum.includes(sourceAlbum) || sourceAlbum.includes(candidateAlbum)) score += 60;
  return score;
}

async function resolveAppleSearchPreview(song) {
  const query = encodeURIComponent(`${song.title} 陈奕迅`);
  const results = await Promise.all(APPLE_SEARCH_COUNTRIES.map(async country => {
    try {
      const payload = await fetchJsonWithTimeout(`https://itunes.apple.com/search?term=${query}&entity=song&country=${country}&limit=50`, 6000);
      const match = (payload.results || [])
        .map(candidate => ({ candidate, score: appleSearchScore(candidate, song) }))
        .filter(item => item.score >= 160)
        .sort((a, b) => b.score - a.score)[0];
      return match ? { result: { url: match.candidate.previewUrl, source: "apple-search", storeUrl: match.candidate.trackViewUrl }, score: match.score } : null;
    } catch {
      return null;
    }
  }));
  return results.filter(Boolean).sort((a, b) => b.score - a.score)[0]?.result || null;
}

function bestApiCandidate(candidates, song, mapper) {
  return candidates
    .map(candidate => ({ candidate, mapped: mapper(candidate) }))
    .map(item => ({ ...item, score: metingScore({ ...item.mapped, url: "pending" }, song) }))
    .filter(item => item.score >= 100 && item.mapped.id)
    .sort((a, b) => b.score - a.score)[0] || null;
}

async function resolveNeteaseApiPreview(song) {
  if (!NETEASE_API_ENDPOINT) return null;
  const query = encodeURIComponent(`${song.title} ${song.sourceAlbum || song.album} 陈奕迅`);
  const payload = await fetchJsonWithTimeout(`${NETEASE_API_ENDPOINT}/search?keywords=${query}&limit=30`);
  const match = bestApiCandidate(payload?.result?.songs || [], song, candidate => ({
    id: candidate.id,
    title: candidate.name,
    artist: (candidate.ar || candidate.artists || []).map(artist => artist.name).join(" / "),
    album: candidate.al?.name || candidate.album?.name || ""
  }));
  if (!match) return null;

  const urlPayload = await fetchJsonWithTimeout(`${NETEASE_API_ENDPOINT}/song/url/v1?id=${encodeURIComponent(match.mapped.id)}&level=standard`);
  const url = urlPayload?.data?.find(item => String(item.id) === String(match.mapped.id))?.url || urlPayload?.data?.[0]?.url;
  return url ? { url, source: "netease-api" } : null;
}

async function resolveQqMusicApiPreview(song) {
  if (!QQMUSIC_API_ENDPOINT) return null;
  const query = encodeURIComponent(`${song.title} ${song.sourceAlbum || song.album} 陈奕迅`);
  const payload = await fetchJsonWithTimeout(`${QQMUSIC_API_ENDPOINT}/search?key=${query}&pageNo=1&pageSize=30`);
  const candidates = payload?.data?.list || payload?.data?.song?.list || [];
  const match = bestApiCandidate(candidates, song, candidate => ({
    id: candidate.songmid || candidate.songMid || candidate.mid,
    title: candidate.songname || candidate.songName || candidate.name || candidate.title,
    artist: (candidate.singer || candidate.singers || []).map(artist => artist.name || artist.title).join(" / "),
    album: candidate.albumname || candidate.albumName || candidate.album?.name || candidate.album?.title || ""
  }));
  if (!match) return null;

  const urlPayload = await fetchJsonWithTimeout(`${QQMUSIC_API_ENDPOINT}/vkey?id=${encodeURIComponent(match.mapped.id)}`);
  const url = urlPayload?.data?.url || urlPayload?.url;
  return url ? { url, source: "qqmusic-api" } : null;
}

async function resolveConfiguredApiPreview(song) {
  for (const resolver of [resolveNeteaseApiPreview, resolveQqMusicApiPreview]) {
    try {
      const result = await resolver(song);
      if (result) return result;
    } catch {
      // Optional self-hosted services fail independently from the remaining providers.
    }
  }
  return null;
}

function deezerJsonp(url) {
  return new Promise((resolve, reject) => {
    const callback = `deezerPreview_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeout = setTimeout(() => finish(new Error("Deezer试听请求超时")), 10000);
    const finish = (error, value) => {
      clearTimeout(timeout);
      delete window[callback];
      script.remove();
      error ? reject(error) : resolve(value);
    };
    window[callback] = payload => finish(null, payload);
    script.onerror = () => finish(new Error("Deezer试听暂时不可用"));
    script.src = `${url}${url.includes("?") ? "&" : "?"}output=jsonp&callback=${callback}`;
    document.head.appendChild(script);
  });
}

async function resolveFallbackPreview(song) {
  if (fallbackPreviewCache.has(song.id)) return fallbackPreviewCache.get(song.id);
  if (persistentPreviewCache.has(song.id)) return persistentPreviewCache.get(song.id);
  const promise = (async () => {
    const apple = await resolveAppleSearchPreview(song);
    if (apple) return apple;
    const meting = await resolveMetingPreview(song);
    if (meting) return meting;
    const configuredApi = await resolveConfiguredApiPreview(song);
    if (configuredApi) return configuredApi;
    const query = encodeURIComponent(`artist:"Eason Chan" track:"${song.title}"`);
    const payload = await deezerJsonp(`https://api.deezer.com/search?q=${query}&limit=25`);
    const match = (payload.data || []).map(candidate => ({ candidate, score: deezerScore(candidate, song) })).filter(item => item.score >= 100).sort((a, b) => b.score - a.score)[0];
    return match ? { url: match.candidate.preview, source: "deezer" } : null;
  })().then(result => {
    if (result?.source === "apple-search") {
      persistentPreviewCache.set(song.id, result);
      try { localStorage.setItem(RESOLVED_PREVIEW_CACHE_KEY, JSON.stringify(Object.fromEntries(persistentPreviewCache))); }
      catch { /* Keep the resolved preview in memory. */ }
    }
    return result;
  }).catch(() => null);
  fallbackPreviewCache.set(song.id, promise);
  return promise;
}

function prepareFallbackPreviews(songIds) {
  if (!document.head) return;
  songIds.map(id => songById.get(id)).filter(song => song && !song.preview).forEach(async song => {
    const resolved = await resolveFallbackPreview(song);
    const button = $(`#groupGrid .preview-button[data-song-id="${song.id}"]`);
    if (!button) return;
    if (!resolved) {
      button.outerHTML = `<span class="preview-unavailable">暂无试听</span>`;
      return;
    }
    const sourceNames = {
      "apple-search": "Apple Music",
      "netease-api": "网易云音乐",
      "qqmusic-api": "QQ音乐",
      deezer: "Deezer"
    };
    const sourceName = resolved.source.startsWith("meting-") ? "Meting" : (sourceNames[resolved.source] || "试听");
    button.dataset.preview = resolved.url;
    button.dataset.previewSource = resolved.source;
    button.disabled = false;
    button.setAttribute("aria-label", `${sourceName}试听：${song.title}`);
    button.title = sourceName === "Deezer" ? "Deezer 30秒试听" : `${sourceName}试听`;
    button.querySelector("span").textContent = "试听";
  });
}

function renderLibrary() {
  const query = $("#librarySearch").value.trim().toLowerCase();
  const filter = $("#libraryFilters .active")?.dataset.filter || "all";
  const filtered = songs.filter(song => {
    const typeOk = filter === "all" || (filter === "fear" ? /fear and dreams/i.test(song.album) : song.edition === filter);
    const textOk = !query || `${song.title} ${song.album} ${song.artist}`.toLowerCase().includes(query);
    return typeOk && textOk;
  });
  $("#libraryGrid").innerHTML = filtered.map(song => songCard(song, true)).join("") || "<p class='empty-state'>没有找到相符版本。</p>";
  bindPreviewButtons();
}

function bindPreviewButtons() {
  $$(".preview-button").forEach(button => button.addEventListener("click", event => {
    event.stopPropagation();
    togglePreview(button);
  }));
}

async function togglePreview(button) {
  const audio = $("#previewAudio");
  if (!button.dataset.preview) {
    const song = songById.get(button.dataset.songId);
    if (!song || button.dataset.resolving === "true") return;
    button.dataset.resolving = "true";
    button.disabled = true;
    button.querySelector("span").textContent = "匹配试听";
    const resolved = await resolveFallbackPreview(song);
    button.dataset.resolving = "false";
    button.disabled = false;
    if (!resolved) {
      fallbackPreviewCache.delete(song.id);
      button.querySelector("span").textContent = "暂无试听";
      button.setAttribute("aria-label", `暂未找到试听：${song.title}`);
      return;
    }
    button.dataset.preview = resolved.url;
    button.dataset.previewSource = resolved.source;
    button.dataset.label = "试听";
    button.querySelector("span").textContent = "试听";
    button.setAttribute("aria-label", `试听：${song.title}`);
    button.title = resolved.source === "apple-search" ? "Apple Music 试听" : "已找到试听，正在播放";
  }
  if (playingButton === button && !audio.paused) {
    audio.pause(); setPreviewState(button, false); playingButton = null; return;
  }
  if (playingButton?.isConnected) setPreviewState(playingButton, false);
  playingButton = button;
  audio.src = button.dataset.preview;
  audio.play().then(() => setPreviewState(button, true)).catch(() => { playingButton = null; showToast("试听暂时无法播放"); });
}

function setPreviewState(button, active) {
  button.classList.toggle("playing", active);
  button.querySelector("span").textContent = active ? "暂停" : (button.dataset.label || "试听");
  button.querySelector(".play-shape").setAttribute("d", active ? "M7 5h4v14H7zm6 0h4v14h-4z" : "m8 5 11 7-11 7Z");
}

function stopPreview() {
  const audio = $("#previewAudio");
  audio.pause(); audio.removeAttribute("src"); audio.load();
  if (playingButton?.isConnected) setPreviewState(playingButton, false);
  playingButton = null;
}

function buildPostGameStory() {
  const championId = state.championId;
  const championDecisions = state.decisions.filter(decision => decision.winnerId === championId);
  const road = championDecisions
    .flatMap(decision => decision.loserIds.map(songId => ({ songId, decision })))
    .filter(item => songById.has(item.songId))
    .slice(-10);
  const tension = [...state.decisions]
    .filter(decision => decision.loserIds.length)
    .sort((left, right) => right.durationMs - left.durationMs)
    .map(decision => ({
      decision,
      winner: songById.get(decision.winnerId),
      loser: songById.get(decision.loserIds[0])
    }))
    .filter(item => item.winner && item.loser)
    .slice(0, 6);
  return {
    champion: songById.get(championId),
    championWins: championDecisions.length,
    road,
    tension,
    finalists: state.finalFourIds.filter(id => id !== championId).map(id => songById.get(id)).filter(Boolean)
  };
}

function renderPostGameStory() {
  const story = buildPostGameStory();
  if (!story.champion) return;
  $("#storyChampion").innerHTML = `
    <img src="${escapeHtml(story.champion.cover)}" alt="${escapeHtml(story.champion.title)} 封面">
    <p class="eyebrow">CHAMPION · ${story.championWins} WINS</p>
    <h4>${escapeHtml(story.champion.title)}</h4>
    <p>${escapeHtml(story.champion.album)}</p>`;
  $("#championRoad").innerHTML = story.road.map(({ songId, decision }) => {
    const song = songById.get(songId);
    return `<article class="story-path-item"><img src="${escapeHtml(song.cover)}" alt=""><div><span>${escapeHtml(PHASE_LABELS[decision.phase])}</span><strong>${escapeHtml(song.title)}</strong></div></article>`;
  }).join("") || "<p class='story-empty'>冠军没有留下可回溯的直接对手。</p>";
  $("#emotionalMatches").innerHTML = story.tension.map(({ decision, winner, loser }) => `
    <article class="story-tension-item">
      <div class="story-tension-song"><img src="${escapeHtml(winner.cover)}" alt=""><div><span>${escapeHtml(PHASE_LABELS[decision.phase])}</span><strong>${escapeHtml(winner.title)}</strong></div></div>
      <span class="story-tension-vs">VS</span>
      <div class="story-tension-song"><img src="${escapeHtml(loser.cover)}" alt=""><div><span>${formatDuration(decision.durationMs)}</span><strong>${escapeHtml(loser.title)}</strong></div></div>
    </article>`).join("") || "<p class='story-empty'>还没有足够的投票记录。</p>";
  $("#storyFinals").innerHTML = story.finalists.map((song, index) => `<article class="story-finalist"><img src="${escapeHtml(song.cover)}" alt=""><div><span>${["亚军之争", "最终四强", "最终四强"][index] || "最终四强"}</span><strong>${escapeHtml(song.title)}</strong></div></article>`).join("");
}

function renderChampion() {
  const champion = songById.get(state.championId);
  $("#championTitle").textContent = champion.title;
  $("#championCover").src = champion.cover;
  const wins = state.decisions.filter(decision => decision.winnerId === champion.id).length;
  $("#championPath").textContent = `从${CATALOG_SIZE}个版本中经历 ${wins} 场胜利，成为你的唯一陈奕迅冠军。`;
  $("#finalists").innerHTML = state.finalFourIds.filter(id => id !== champion.id).map(id => `<div class="finalist"><span>最终四强</span><strong>${escapeHtml(songById.get(id).title)}</strong></div>`).join("");
  renderPostGameStory();
  renderSummary();
  $("#undoButton").disabled = true;
}

function renderSummary() {
  const totalMs = state.decisions.reduce((sum, decision) => sum + decision.durationMs, 0);
  const versionVotes = state.decisions.filter(decision => decision.phase === "version");
  const liveWins = versionVotes.filter(decision => songById.get(decision.winnerId).edition === "live").length;
  const championWins = state.decisions.filter(decision => decision.winnerId === state.championId).length;
  $("#summaryStats").innerHTML = [
    [state.decisions.length, "次正式选择"],
    [formatDuration(totalMs), "累计思考"],
    [`${liveWins}/${versionVotes.length || 0}`, "版本战选择现场"],
    [championWins, "冠军胜场"]
  ].map(([value, label]) => `<div><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`).join("");

  const hardest = [...state.decisions].sort((a, b) => b.durationMs - a.durationMs)[0];
  if (hardest) {
    const chosen = songById.get(hardest.winnerId);
    const lost = hardest.loserIds.map(id => songById.get(id).title).join("、");
    $("#summaryHighlight").innerHTML = `<span>最纠结的一票 · ${formatDuration(hardest.durationMs)}</span><h4>${escapeHtml(chosen.title)}</h4><p>你最终留下了它，淘汰了 ${escapeHtml(lost)}。</p>`;
  }

  const phases = [...new Set(state.decisions.map(decision => decision.phase))];
  $("#summaryFilters").innerHTML = `<button class="${summaryFilter === "all" ? "active" : ""}" data-phase="all">全部</button>${phases.map(phase => `<button class="${summaryFilter === phase ? "active" : ""}" data-phase="${phase}">${PHASE_LABELS[phase]}</button>`).join("")}`;
  $$("#summaryFilters button").forEach(button => button.addEventListener("click", () => {
    summaryFilter = button.dataset.phase;
    renderSummary();
  }));
  const decisions = summaryFilter === "all" ? state.decisions : state.decisions.filter(decision => decision.phase === summaryFilter);
  $("#voteTimeline").innerHTML = decisions.map((decision, index) => {
    const winner = songById.get(decision.winnerId);
    const losers = decision.loserIds.map(id => songById.get(id)?.title).filter(Boolean).join("、");
    return `<article class="vote-row"><span class="vote-index">${String(index + 1).padStart(3, "0")}</span><img src="${escapeHtml(winner.cover)}" alt="" loading="lazy"><div><span>${escapeHtml(PHASE_LABELS[decision.phase])} · ${escapeHtml(decision.label)}</span><strong>留下 ${escapeHtml(winner.title)}</strong><p>淘汰 ${escapeHtml(losers)} · ${formatDuration(decision.durationMs)}</p></div></article>`;
  }).join("");
}

function formatDuration(milliseconds) {
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}分${String(seconds % 60).padStart(2, "0")}秒`;
}

function exportVotes() {
  const payload = {
    champion: songById.get(state.championId),
    completedAt: new Date().toISOString(),
    votes: state.decisions.map(decision => ({
      phase: PHASE_LABELS[decision.phase],
      group: decision.label,
      winner: songById.get(decision.winnerId),
      eliminated: decision.loserIds.map(id => songById.get(id)),
      durationMs: decision.durationMs
    }))
  };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `eason-${CATALOG_SIZE}-voting-record.json`);
}

function loadSummaryImage(source) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

function drawRoundedRect(context, x, y, width, height, radius, fill, stroke = null) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
  if (fill) { context.fillStyle = fill; context.fill(); }
  if (stroke) { context.strokeStyle = stroke; context.stroke(); }
}

async function downloadSummaryImage() {
  const story = buildPostGameStory();
  const canvas = document.createElement("canvas");
  canvas.width = 1600; canvas.height = 2240;
  const context = canvas.getContext("2d");
  const allSongs = [story.champion, ...story.road.map(item => songById.get(item.songId)), ...story.tension.flatMap(item => [item.winner, item.loser]), ...story.finalists].filter(Boolean);
  const imageEntries = await Promise.all([...new Map(allSongs.map(song => [song.id, song])).values()].map(async song => [song.id, await loadSummaryImage(song.cover)]));
  const images = new Map(imageEntries);
  const drawCover = (song, x, y, size) => {
    const image = images.get(song.id);
    if (image) context.drawImage(image, x, y, size, size);
    else { context.fillStyle = "#343438"; context.fillRect(x, y, size, size); }
  };
  const drawLabel = (text, x, y, maxWidth, size = 26, color = "#f5f5f7") => {
    context.fillStyle = color; context.font = `600 ${size}px sans-serif`;
    let output = text;
    while (context.measureText(output).width > maxWidth && output.length > 1) output = `${output.slice(0, -1)}…`;
    context.fillText(output, x, y);
  };

  context.fillStyle = "#101011"; context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#29292d"; context.lineWidth = 1;
  for (let y = 160; y < 2050; y += 170) { context.beginPath(); context.moveTo(72, y); context.lineTo(1528, y); context.stroke(); }
  context.fillStyle = "#ff5a67"; context.font = "700 28px sans-serif"; context.fillText("YOUR EASON CHAMPION MAP", 80, 105);
  context.fillStyle = "#f5f5f7"; context.font = "700 76px sans-serif"; context.fillText("陈奕迅 · 私人冠军杯", 80, 190);
  context.fillStyle = "#a1a1a6"; context.font = "28px sans-serif"; context.fillText(`${state.decisions.length} 次选择 · ${CATALOG_SIZE} 个版本 · ${formatDuration(state.decisions.reduce((sum, item) => sum + item.durationMs, 0))}`, 80, 242);

  const centerX = 600; const centerY = 590;
  drawRoundedRect(context, centerX - 20, centerY - 20, 440, 555, 16, "#1d1d1f", "#ff5a67");
  drawCover(story.champion, centerX + 40, centerY + 28, 320);
  context.fillStyle = "#ff5a67"; context.font = "700 20px sans-serif"; context.fillText(`CHAMPION · ${story.championWins} WINS`, centerX + 40, centerY + 395);
  drawLabel(story.champion.title, centerX + 40, centerY + 465, 320, 50);
  context.fillStyle = "#a1a1a6"; context.font = "24px sans-serif"; context.fillText(story.champion.album.slice(0, 22), centerX + 40, centerY + 510);

  context.fillStyle = "#a1a1a6"; context.font = "700 20px sans-serif"; context.fillText("冠军之路", 80, 330);
  story.road.slice(-8).forEach(({ songId, decision }, index) => {
    const song = songById.get(songId); const y = 370 + index * 150;
    context.strokeStyle = "#4c4c51"; context.beginPath(); context.moveTo(420, y + 52); context.lineTo(centerX - 20, centerY + 180); context.stroke();
    drawRoundedRect(context, 80, y, 340, 104, 10, "#1b1b1d", "#38383d"); drawCover(song, 92, y + 12, 80);
    context.fillStyle = "#a1a1a6"; context.font = "16px sans-serif"; context.fillText(PHASE_LABELS[decision.phase], 186, y + 35);
    drawLabel(song.title, 186, y + 76, 210, 25);
  });

  context.fillStyle = "#a1a1a6"; context.font = "700 20px sans-serif"; context.fillText("最难放下", 1140, 330);
  story.tension.forEach(({ decision, winner, loser }, index) => {
    const y = 370 + index * 190;
    context.strokeStyle = "#4c4c51"; context.beginPath(); context.moveTo(1020, centerY + 180); context.lineTo(1180, y + 64); context.stroke();
    drawRoundedRect(context, 1180, y, 340, 128, 10, "#1b1b1d", "#38383d");
    drawCover(winner, 1192, y + 12, 48); drawCover(loser, 1192, y + 68, 48);
    drawLabel(winner.title, 1254, y + 46, 230, 21);
    drawLabel(loser.title, 1254, y + 102, 230, 21, "#a1a1a6");
    context.fillStyle = "#ff5a67"; context.font = "700 14px sans-serif"; context.fillText(formatDuration(decision.durationMs), 1450, y + 21);
  });

  context.fillStyle = "#a1a1a6"; context.font = "700 20px sans-serif"; context.fillText("最终四强", 80, 1870);
  story.finalists.forEach((song, index) => {
    const x = 80 + index * 485;
    drawRoundedRect(context, x, 1910, 440, 120, 10, "#1b1b1d", "#38383d"); drawCover(song, x + 14, 1924, 92);
    context.fillStyle = "#a1a1a6"; context.font = "16px sans-serif"; context.fillText(index === 0 ? "亚军之争" : "最终四强", x + 124, 1958);
    drawLabel(song.title, x + 124, 2007, 280, 28);
  });
  context.fillStyle = "#a1a1a6"; context.font = "20px sans-serif"; context.fillText("你的选择，全部有迹可循。", 80, 2150);
  canvas.toBlob(blob => blob && downloadBlob(blob, `eason-${CATALOG_SIZE}-champion-map.png`), "image/png");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function undoChoice() {
  if (!state?.history?.length) return;
  const previous = state.history.pop();
  const history = state.history;
  state = { ...previous, history };
  selectedSongId = null;
  saveState();
  showScreen("stage");
  renderStage();
  showToast("已撤销上一次选择");
}

function showScreen(name) {
  $("#setupScreen").classList.toggle("hidden", name !== "setup");
  $("#stageScreen").classList.toggle("hidden", name !== "stage");
  $("#championScreen").classList.toggle("hidden", name !== "champion");
}

function switchView(view) {
  stopPreview();
  $$(".view").forEach(section => section.classList.remove("active"));
  $$(".tab-button").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  $(`#${view}View`).classList.add("active");
  if (view === "library") renderLibrary();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetTournament() {
  if (state?.decisions?.length && !window.confirm("保留的赛后档案不会被上传。确定清除当前赛程并重新开始？")) return;
  stopPreview();
  localStorage.removeItem(STORAGE_KEY);
  state = null;
  selectedSongId = null;
  showScreen("setup");
  $("#undoButton").disabled = true;
  updateResumeButton();
}

async function copyResult() {
  const champion = songById.get(state.championId);
  const text = `我的陈奕迅${CATALOG_SIZE}版本冠军杯冠军：${champion.title}（${champion.album}）。`;
  try { await navigator.clipboard.writeText(text); showToast("冠军结果已复制"); }
  catch { showToast("复制失败，请手动记录结果"); }
}

function updateResumeButton() {
  const saved = loadState();
  $("#resumeButton").classList.toggle("hidden", !saved || saved.championId);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function bindEvents() {
  $$(".tab-button").forEach(button => button.addEventListener("click", () => switchView(button.dataset.view)));
  $$(".mode-button").forEach(button => button.addEventListener("click", () => {
    selectedMode = button.dataset.mode;
    $$(".mode-button").forEach(item => item.classList.toggle("active", item === button));
  }));
  $("#startButton").addEventListener("click", () => startTournament());
  $("#resumeButton").addEventListener("click", resumeTournament);
  $("#stageSubmit").addEventListener("click", confirmChoice);
  $("#undoButton").addEventListener("click", undoChoice);
  $("#restartButton").addEventListener("click", resetTournament);
  $("#playAgainButton").addEventListener("click", resetTournament);
  $("#copyButton").addEventListener("click", copyResult);
  $("#downloadSummaryButton").addEventListener("click", downloadSummaryImage);
  $("#exportVotesButton").addEventListener("click", exportVotes);
  $(".brand").addEventListener("click", event => { event.preventDefault(); switchView("game"); });
  $("#librarySearch").addEventListener("input", renderLibrary);
  $$("#libraryFilters button").forEach(button => button.addEventListener("click", () => {
    $$("#libraryFilters button").forEach(item => item.classList.toggle("active", item === button));
    renderLibrary();
  }));
  $("#previewAudio").addEventListener("ended", () => { if (playingButton?.isConnected) setPreviewState(playingButton, false); playingButton = null; });
}

function updateCatalogLabels() {
  document.title = `陈奕迅 ${CATALOG_SIZE} | 私人冠军杯`;
  $$('[data-catalog-size]').forEach(element => { element.textContent = CATALOG_SIZE; });
}

updateCatalogLabels();
bindEvents();
updateResumeButton();
