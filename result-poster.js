const RESULT_SITE_URL = "https://fangxiaolian.github.io/eason-song-cup/";
const RESULT_POSTER_SIZE = { width: 1400, height: 2400 };
let resultPosterBlob = null;
let resultPosterUrl = null;

function posterFont(weight, size) {
  return `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
}

function posterImage(source) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

function posterRoundData() {
  const knockout = state.decisions.filter(decision => decision.phase === "knockout");
  return {
    round32: knockout.slice(0, 16),
    round16: knockout.slice(16, 24),
    quarterfinals: knockout.slice(24, 28),
    page: state.decisions.filter(decision => decision.phase === "page")
  };
}

function posterTruncate(context, text, maxWidth) {
  const value = String(text || "");
  if (context.measureText(value).width <= maxWidth) return value;
  let output = value;
  while (output.length > 1 && context.measureText(`${output}…`).width > maxWidth) output = output.slice(0, -1);
  return `${output}…`;
}

function posterRoundedRect(context, x, y, width, height, radius, fill, stroke = null, lineWidth = 1) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
  if (fill) { context.fillStyle = fill; context.fill(); }
  if (stroke) { context.strokeStyle = stroke; context.lineWidth = lineWidth; context.stroke(); }
}

function posterCover(context, images, song, x, y, size, radius = 5) {
  context.save();
  posterRoundedRect(context, x, y, size, size, radius, "#26262c");
  context.clip();
  const image = song ? images.get(song.id) : null;
  if (image) context.drawImage(image, x, y, size, size);
  context.restore();
}

function posterSongRow(context, images, song, winnerId, x, y, width, options = {}) {
  const winner = song?.id === winnerId;
  const rowHeight = options.rowHeight || 54;
  const coverSize = options.coverSize || 38;
  const active = winner ? (options.accent || "#d95cff") : "#34343b";
  context.globalAlpha = winner ? 1 : .42;
  posterRoundedRect(context, x, y, width, rowHeight, 7, winner ? "#1e1d25" : "#16161b", active, winner ? 1.8 : 1);
  posterCover(context, images, song, x + 7, y + (rowHeight - coverSize) / 2, coverSize, 4);
  context.fillStyle = winner ? "#f7f5ff" : "#9a98a3";
  context.font = posterFont(winner ? 700 : 500, options.fontSize || 18);
  context.textBaseline = "middle";
  context.fillText(posterTruncate(context, song?.title || "未知歌曲", width - coverSize - 28), x + coverSize + 16, y + rowHeight / 2);
  context.globalAlpha = 1;
}

function posterMatch(context, images, decision, x, y, width, accent) {
  if (!decision) return;
  const candidates = decision.candidateIds.map(id => songById.get(id)).filter(Boolean);
  const gap = 7;
  posterSongRow(context, images, candidates[0], decision.winnerId, x, y, width, { accent });
  posterSongRow(context, images, candidates[1], decision.winnerId, x, y + 61 + gap, width, { accent });
}

function posterWinnerCard(context, images, decision, x, y, width, accent) {
  if (!decision) return;
  const song = songById.get(decision.winnerId);
  const isChampion = decision.winnerId === state.championId;
  posterRoundedRect(context, x, y, width, 66, 7, "#19191f", isChampion ? accent : "#3a3942", isChampion ? 2 : 1);
  posterCover(context, images, song, x + 8, y + 8, 50, 5);
  context.fillStyle = isChampion ? "#f9f6ff" : "#d4d1db";
  context.font = posterFont(isChampion ? 750 : 600, 19);
  context.textBaseline = "middle";
  context.fillText(posterTruncate(context, song?.title || "未知歌曲", width - 78), x + 68, y + 33);
}

function posterConnector(context, fromX, fromY, toX, toY, highlighted = false) {
  const middleX = fromX + (toX - fromX) / 2;
  context.beginPath();
  context.moveTo(fromX, fromY);
  context.lineTo(middleX, fromY);
  context.lineTo(middleX, toY);
  context.lineTo(toX, toY);
  context.strokeStyle = highlighted ? "#aa5cff" : "#35343e";
  context.lineWidth = highlighted ? 3 : 1.4;
  context.stroke();
}

function drawPosterBackground(context, image, width, height) {
  context.fillStyle = "#080706";
  context.fillRect(0, 0, width, height);
  if (image) {
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  }
  const shade = context.createLinearGradient(0, 0, 0, height);
  shade.addColorStop(0, "rgba(4, 3, 2, .58)");
  shade.addColorStop(.45, "rgba(5, 4, 3, .68)");
  shade.addColorStop(1, "rgba(4, 3, 3, .82)");
  context.fillStyle = shade;
  context.fillRect(0, 0, width, height);
}

function drawPosterHeader(context) {
  context.textAlign = "center";
  context.fillStyle = "#a65cff";
  context.font = posterFont(850, 42);
  context.fillText("EASON SONG CUP", 700, 82);
  context.fillStyle = "#f7f5fa";
  context.font = posterFont(800, 58);
  context.fillText("陈奕迅 · 私人歌曲冠军杯", 700, 158);
  context.fillStyle = "#8d8996";
  context.font = posterFont(500, 20);
  context.fillText("从 387 个有效版本中，一次次留下自己的答案", 700, 204);
  context.textAlign = "left";
}

function drawPosterBracket(context, images, rounds) {
  const accent = "#d95cff";
  const r32Width = 260;
  const r16Width = 220;
  const r8Width = 210;
  const leftX = 28;
  const rightX = 1112;
  const leftR16X = 322;
  const rightR16X = 858;
  const leftR8X = 485;
  const rightR8X = 705;
  const baseY = 285;
  const r32Gap = 190;
  const r32Y = Array.from({ length: 8 }, (_, index) => baseY + index * r32Gap);
  const r16Y = Array.from({ length: 4 }, (_, index) => baseY + 95 + index * r32Gap * 2);
  const r8Y = [575, 1515];
  const left32 = rounds.round32.slice(0, 8);
  const right32 = rounds.round32.slice(8, 16);
  const left16 = rounds.round16.slice(0, 4);
  const right16 = rounds.round16.slice(4, 8);
  const left8 = rounds.quarterfinals.slice(0, 2);
  const right8 = rounds.quarterfinals.slice(2, 4);

  left32.forEach((decision, index) => posterConnector(context, leftX + r32Width, r32Y[index] + 61, leftR16X, r16Y[Math.floor(index / 2)] + 33, decision.winnerId === state.championId));
  right32.forEach((decision, index) => posterConnector(context, rightX, r32Y[index] + 61, rightR16X + r16Width, r16Y[Math.floor(index / 2)] + 33, decision.winnerId === state.championId));
  left16.forEach((decision, index) => posterConnector(context, leftR16X + r16Width, r16Y[index] + 33, leftR8X, r8Y[Math.floor(index / 2)] + 33, decision.winnerId === state.championId));
  right16.forEach((decision, index) => posterConnector(context, rightR16X, r16Y[index] + 33, rightR8X + r8Width, r8Y[Math.floor(index / 2)] + 33, decision.winnerId === state.championId));

  context.fillStyle = "#777380";
  context.font = posterFont(700, 16);
  context.fillText("32 强", leftX, 260);
  context.fillText("16 强", leftR16X, 260);
  context.fillText("最终四强", leftR8X, 540);
  context.textAlign = "right";
  context.fillText("32 强", rightX + r32Width, 260);
  context.fillText("16 强", rightR16X + r16Width, 260);
  context.fillText("最终四强", rightR8X + r8Width, 540);
  context.textAlign = "left";

  left32.forEach((decision, index) => posterMatch(context, images, decision, leftX, r32Y[index], r32Width, accent));
  right32.forEach((decision, index) => posterMatch(context, images, decision, rightX, r32Y[index], r32Width, accent));
  left16.forEach((decision, index) => posterWinnerCard(context, images, decision, leftR16X, r16Y[index], r16Width, accent));
  right16.forEach((decision, index) => posterWinnerCard(context, images, decision, rightR16X, r16Y[index], r16Width, accent));
  left8.forEach((decision, index) => posterWinnerCard(context, images, decision, leftR8X, r8Y[index], r8Width, accent));
  right8.forEach((decision, index) => posterWinnerCard(context, images, decision, rightR8X, r8Y[index], r8Width, accent));
}

function drawPosterChampion(context, images, story) {
  const x = 500;
  const y = 875;
  const width = 400;
  const accent = "#d95cff";
  context.shadowColor = "rgba(175, 77, 255, .36)";
  context.shadowBlur = 38;
  posterRoundedRect(context, x, y, width, 500, 18, "#17171d", accent, 3);
  context.shadowBlur = 0;
  posterCover(context, images, story.champion, x + 70, y + 52, 260, 16);
  context.textAlign = "center";
  context.fillStyle = "#f5c85a";
  context.font = posterFont(900, 44);
  context.fillText("♛", 700, y + 52);
  posterRoundedRect(context, x + 65, y + 332, 270, 50, 25, accent);
  context.fillStyle = "#ffffff";
  context.font = posterFont(800, 21);
  context.textBaseline = "middle";
  context.fillText("冠军 · CHAMPION", 700, y + 357);
  context.fillStyle = "#f8f6fb";
  context.font = posterFont(850, 43);
  context.fillText(posterTruncate(context, story.champion.title, 340), 700, y + 425);
  context.fillStyle = "#8f8b97";
  context.font = posterFont(500, 18);
  context.fillText(posterTruncate(context, story.champion.album, 340), 700, y + 466);
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
}

function drawPosterStats(context, story) {
  const totalMs = state.decisions.reduce((sum, decision) => sum + decision.durationMs, 0);
  const hardest = [...state.decisions].sort((left, right) => right.durationMs - left.durationMs)[0];
  const stats = [
    [String(state.decisions.length), "次正式选择"],
    [formatDuration(totalMs), "累计思考"],
    [String(story.championWins), "冠军胜场"],
    [hardest ? formatDuration(hardest.durationMs) : "—", "最纠结一票"]
  ];
  const startX = 290;
  const y = 1855;
  stats.forEach(([value, label], index) => {
    const x = startX + index * 235;
    context.fillStyle = "#f5f3f8";
    context.font = posterFont(750, 28);
    context.textAlign = "center";
    context.fillText(value, x, y);
    context.fillStyle = "#7f7b88";
    context.font = posterFont(500, 15);
    context.fillText(label, x, y + 28);
  });
  context.textAlign = "left";
}

function drawPosterFooter(context, qrImage) {
  context.strokeStyle = "#292832";
  context.lineWidth = 1;
  context.beginPath(); context.moveTo(60, 1970); context.lineTo(1340, 1970); context.stroke();
  posterRoundedRect(context, 112, 2035, 270, 270, 18, "#ffffff");
  if (qrImage) context.drawImage(qrImage, 127, 2050, 240, 240);
  context.fillStyle = "#a65cff";
  context.font = posterFont(850, 38);
  context.fillText("EASON SONG CUP", 445, 2105);
  context.fillStyle = "#f5f3f8";
  context.font = posterFont(700, 25);
  context.fillText("扫码开始你的陈奕迅歌曲冠军杯", 445, 2158);
  context.fillStyle = "#88848f";
  context.font = posterFont(500, 18);
  context.fillText("每个人的选择不同，二维码始终指向同一个入口", 445, 2205);
  context.fillStyle = "#aaa6b1";
  context.font = posterFont(600, 17);
  context.fillText(RESULT_SITE_URL, 445, 2255);
}

async function createResultPosterBlob() {
  const story = buildPostGameStory();
  const rounds = posterRoundData();
  if (!story.champion || rounds.round32.length !== 16 || rounds.round16.length !== 8 || rounds.quarterfinals.length !== 4) {
    throw new Error("结果数据不完整，暂时无法生成32强路线图");
  }
  if (document.fonts?.ready) await document.fonts.ready;
  const songIds = new Set([
    story.champion.id,
    ...rounds.round32.flatMap(decision => decision.candidateIds),
    ...rounds.round16.flatMap(decision => decision.candidateIds),
    ...rounds.quarterfinals.flatMap(decision => decision.candidateIds)
  ]);
  const imageEntries = await Promise.all([...songIds].map(async id => {
    const song = songById.get(id);
    return [id, song ? await posterImage(song.cover) : null];
  }));
  const images = new Map(imageEntries);
  const qrImage = await posterImage("assets/site-qr.png");
  const backgroundImage = await posterImage("assets/branding/result-poster-background.jpg");
  const canvas = document.createElement("canvas");
  canvas.width = RESULT_POSTER_SIZE.width;
  canvas.height = RESULT_POSTER_SIZE.height;
  const context = canvas.getContext("2d");
  drawPosterBackground(context, backgroundImage, canvas.width, canvas.height);
  drawPosterHeader(context);
  drawPosterBracket(context, images, rounds);
  drawPosterChampion(context, images, story);
  drawPosterStats(context, story);
  drawPosterFooter(context, qrImage);
  window.RESULT_POSTER_DIAGNOSTICS = {
    width: canvas.width,
    height: canvas.height,
    qrLoaded: Boolean(qrImage),
    backgroundLoaded: Boolean(backgroundImage),
    coversLoaded: [...images.values()].filter(Boolean).length,
    coversRequested: images.size
  };
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("图片生成失败")), "image/png"));
}

function resultPosterFilename() {
  const champion = songById.get(state.championId);
  const safeTitle = String(champion?.title || "champion").replace(/[\\/:*?"<>|]/g, "-");
  return `陈奕迅冠军杯-${safeTitle}.png`;
}

function closeResultPoster() {
  document.querySelector("#resultPosterModal")?.classList.add("hidden");
  document.body.classList.remove("poster-open");
}

function resetResultPoster() {
  if (resultPosterUrl) URL.revokeObjectURL(resultPosterUrl);
  resultPosterBlob = null;
  resultPosterUrl = null;
  closeResultPoster();
}

function saveResultPoster() {
  if (!resultPosterBlob || !resultPosterUrl) return;
  const anchor = document.createElement("a");
  anchor.href = resultPosterUrl;
  anchor.download = resultPosterFilename();
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  showToast("已请求保存；手机无法下载时请长按图片保存");
}

async function shareResultPoster() {
  if (!resultPosterBlob) return;
  const file = typeof File === "function" ? new File([resultPosterBlob], resultPosterFilename(), { type: "image/png" }) : null;
  if (file && navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    try {
      await navigator.share({ title: "我的陈奕迅歌曲冠军", text: "来选出你的陈奕迅歌曲冠军", files: [file] });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  saveResultPoster();
}

async function openResultPoster() {
  const modal = document.querySelector("#resultPosterModal");
  const preview = document.querySelector("#resultPosterPreview");
  const generating = document.querySelector("#posterGenerating");
  const shareButton = document.querySelector("#sharePosterButton");
  const saveButton = document.querySelector("#savePosterButton");
  modal.classList.remove("hidden");
  document.body.classList.add("poster-open");
  preview.classList.add("hidden");
  generating.classList.remove("hidden");
  shareButton.disabled = true;
  saveButton.disabled = true;
  try {
    if (!resultPosterBlob) resultPosterBlob = await createResultPosterBlob();
    if (resultPosterUrl) URL.revokeObjectURL(resultPosterUrl);
    resultPosterUrl = URL.createObjectURL(resultPosterBlob);
    preview.src = resultPosterUrl;
    preview.dataset.bytes = String(resultPosterBlob.size);
    preview.classList.remove("hidden");
    generating.classList.add("hidden");
    shareButton.disabled = false;
    saveButton.disabled = false;
  } catch (error) {
    generating.innerHTML = `<strong>暂时无法生成结果图</strong><p>${escapeHtml(error.message)}</p>`;
  }
}

function bindResultPosterControls() {
  document.querySelector("#sharePosterButton")?.addEventListener("click", shareResultPoster);
  document.querySelector("#savePosterButton")?.addEventListener("click", saveResultPoster);
  document.querySelector("#closePosterButton")?.addEventListener("click", closeResultPoster);
  document.querySelector("#cancelPosterButton")?.addEventListener("click", closeResultPoster);
  document.querySelector("#resultPosterModal")?.addEventListener("click", event => {
    if (event.target.id === "resultPosterModal") closeResultPoster();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeResultPoster();
  });
}

window.openResultPoster = openResultPoster;
window.bindResultPosterControls = bindResultPosterControls;
window.resetResultPoster = resetResultPoster;
