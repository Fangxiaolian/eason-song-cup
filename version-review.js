const REVIEW_STORAGE_KEY = "eason-392-version-review-v2";
const catalog = window.SPOTIFY_CATALOG || [];
const catalogExclusions = new Set([...(window.REVIEW_EXCLUSIONS || []), ...(window.VERSION_REVIEW_EXCLUSIONS || [])]);
const mediaByAlbum = window.SPOTIFY_MEDIA || {};
const legacyMedia = window.MUSIC_DATA || {};
const previewsByTrack = window.TRACK_PREVIEWS || {};
const fallbackCover = "assets/eason-bilibili-cover.png";
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

let activeFilter = "all";
let playingButton = null;
let toastTimer = null;
const excludedIds = new Set(loadExcludedIds());

function comparable(value) {
  return String(value || "").normalize("NFKC").toLowerCase()
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
  return Object.entries(legacyMedia).find(([key]) => !key.startsWith("fear:") && comparable(key) === target)?.[1] || null;
}

function fearLegacyFor(title) {
  const target = comparable(title);
  return Object.entries(legacyMedia).find(([key, media]) => {
    if (!key.startsWith("fear:") || !media.storeUrl) return false;
    try {
      const parts = new URL(media.storeUrl).pathname.split("/").filter(Boolean);
      const slug = decodeURIComponent(parts[2] || "").replace(/-live$/i, "").replace(/-/g, " ");
      return comparable(slug) === target;
    } catch { return false; }
  })?.[1] || null;
}

function mediaFor(item, edition) {
  const mapped = previewsByTrack[item.spotifyTrackId] || null;
  const exact = /fear and dreams/i.test(item.album) ? fearLegacyFor(item.title) : (edition === "studio" ? legacyFor(item.title) : null);
  const albumMedia = mediaByAlbum[item.spotifyAlbumId] || {};
  return {
    cover: albumMedia.cover || legacyFor(item.title)?.cover || fallbackCover,
    preview: mapped?.preview || exact?.preview || null
  };
}

const reviewSongs = catalog.map(item => {
  const edition = versionType(item);
  return { ...item, edition, key: comparable(item.title), ...mediaFor(item, edition) };
}).filter(song => song.edition !== "remaster" && !catalogExclusions.has(song.id));

const groups = Object.values(reviewSongs.reduce((result, song) => {
  (result[song.key] ||= []).push(song);
  return result;
}, {})).filter(items => items.length > 1).map(items => ({
  key: items[0].key,
  title: [...items].sort((a, b) => editionOrder(a.edition) - editionOrder(b.edition) || a.title.length - b.title.length)[0].title,
  items: [...items].sort((a, b) => editionOrder(a.edition) - editionOrder(b.edition) || a.album.localeCompare(b.album, "zh-HK"))
})).sort((a, b) => a.title.localeCompare(b.title, "zh-HK"));

function editionOrder(edition) { return { studio: 0, live: 1, remix: 2 }[edition] ?? 3; }
function editionLabel(edition) { return { studio: "录音室", live: "现场", remix: "重混" }[edition] || "特别版本"; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]); }

function loadExcludedIds() {
  try { const value = JSON.parse(localStorage.getItem(REVIEW_STORAGE_KEY) || "[]"); return Array.isArray(value) ? value : []; }
  catch { return []; }
}

function saveReview() { localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify([...excludedIds])); }

function groupMatches(group, query) {
  if (!query) return true;
  return `${group.title} ${group.items.map(item => `${item.album} ${item.spotifyTrackId}`).join(" ")}`.toLowerCase().includes(query);
}

function filterMatches(group) {
  if (activeFilter === "excluded") return group.items.some(item => excludedIds.has(item.id));
  if (activeFilter === "mixed") return new Set(group.items.map(item => item.edition)).size > 1;
  if (activeFilter === "same-album") return new Set(group.items.map(item => comparable(item.album))).size < group.items.length;
  return true;
}

function rowTemplate(song) {
  const excluded = excludedIds.has(song.id);
  const preview = song.preview
    ? `<button class="icon-action preview-action" data-preview="${escapeHtml(song.preview)}" aria-label="试听：${escapeHtml(song.title)}" title="试听">▶</button>`
    : `<span class="no-preview">待补试听</span>`;
  return `<div class="version-row${excluded ? " excluded" : ""}" data-song-id="${escapeHtml(song.id)}">
    <img class="version-cover" src="${escapeHtml(song.cover)}" alt="" loading="lazy">
    <div class="version-main"><span class="edition ${escapeHtml(song.edition)}">${editionLabel(song.edition)}</span><strong>${escapeHtml(song.title)}</strong><small>${escapeHtml(song.artist)}</small></div>
    <div class="version-album"><strong>${escapeHtml(song.album)}</strong><small>Spotify Track ID · ${escapeHtml(song.spotifyTrackId)}</small></div>
    <div class="row-actions"><div class="media-actions">${preview}<a class="spotify-link" href="https://open.spotify.com/track/${escapeHtml(song.spotifyTrackId)}" target="_blank" rel="noreferrer">Spotify ↗</a></div><label class="keep-toggle"><input type="checkbox" data-keep-id="${escapeHtml(song.id)}" ${excluded ? "" : "checked"}><span>保留</span></label><button class="keep-only" data-keep-only="${escapeHtml(song.id)}">只留此版</button></div>
  </div>`;
}

function groupTemplate(group) {
  const excluded = group.items.filter(item => excludedIds.has(item.id)).length;
  return `<section class="version-group" data-group-key="${escapeHtml(group.key)}"><header class="group-head"><div><h2>${escapeHtml(group.title)}</h2><p class="group-meta">${group.items.length} 个版本 · ${excluded} 个已排除</p></div><button class="group-reset" data-keep-all="${escapeHtml(group.key)}">全部保留</button></header>${group.items.map(rowTemplate).join("")}</section>`;
}

function render() {
  const query = $("#reviewSearch").value.trim().toLowerCase();
  const visible = groups.filter(group => groupMatches(group, query) && filterMatches(group));
  $("#reviewList").innerHTML = visible.map(groupTemplate).join("") || `<p class="empty">没有符合条件的同名版本。</p>`;
  updateStats(); bindRows();
}

function updateStats() {
  $("#groupCount").textContent = groups.length;
  $("#versionCount").textContent = groups.reduce((sum, group) => sum + group.items.length, 0);
  $("#excludedCount").textContent = excludedIds.size;
}

function bindRows() {
  $$('[data-keep-id]').forEach(input => input.addEventListener("change", () => {
    input.checked ? excludedIds.delete(input.dataset.keepId) : excludedIds.add(input.dataset.keepId);
    saveReview(); render();
  }));
  $$('[data-keep-only]').forEach(button => button.addEventListener("click", () => {
    const group = groups.find(item => item.items.some(song => song.id === button.dataset.keepOnly));
    group.items.forEach(song => song.id === button.dataset.keepOnly ? excludedIds.delete(song.id) : excludedIds.add(song.id));
    saveReview(); render();
  }));
  $$('[data-keep-all]').forEach(button => button.addEventListener("click", () => {
    groups.find(item => item.key === button.dataset.keepAll)?.items.forEach(song => excludedIds.delete(song.id));
    saveReview(); render();
  }));
  $$(".preview-action").forEach(button => button.addEventListener("click", () => togglePreview(button)));
}

function togglePreview(button) {
  const audio = $("#reviewAudio");
  if (playingButton === button && !audio.paused) { audio.pause(); setPlaying(button, false); playingButton = null; return; }
  if (playingButton?.isConnected) setPlaying(playingButton, false);
  playingButton = button; audio.src = button.dataset.preview;
  audio.play().then(() => setPlaying(button, true)).catch(() => { playingButton = null; showToast("试听暂时无法播放"); });
}

function setPlaying(button, active) { button.classList.toggle("playing", active); button.textContent = active ? "Ⅱ" : "▶"; }

function exportReview() {
  const payload = {
    generatedAt: new Date().toISOString(), catalogSize: reviewSongs.length, duplicateGroups: groups.length, excludedIds: [...excludedIds],
    groups: groups.map(group => ({ title: group.title, versions: group.items.map(song => ({ spotifyTrackId: song.spotifyTrackId, title: song.title, album: song.album, edition: song.edition, decision: excludedIds.has(song.id) ? "exclude" : "keep" })) }))
  };
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" }));
  link.download = "eason-version-review.json"; link.click(); URL.revokeObjectURL(link.href); showToast("审查结果已导出");
}

function showToast(message) {
  clearTimeout(toastTimer); $("#reviewToast").textContent = message; $("#reviewToast").classList.add("show");
  toastTimer = setTimeout(() => $("#reviewToast").classList.remove("show"), 1800);
}

$("#reviewSearch").addEventListener("input", render);
$$("#reviewFilters button").forEach(button => button.addEventListener("click", () => {
  $$("#reviewFilters button").forEach(item => item.classList.toggle("active", item === button)); activeFilter = button.dataset.filter; render();
}));
$("#exportReview").addEventListener("click", exportReview);
$("#resetReview").addEventListener("click", () => {
  if (!excludedIds.size || confirm("清除全部排除选择？")) { excludedIds.clear(); saveReview(); render(); }
});
$("#reviewAudio").addEventListener("ended", () => { if (playingButton?.isConnected) setPlaying(playingButton, false); playingButton = null; });
render();
