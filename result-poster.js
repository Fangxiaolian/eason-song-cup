const RESULT_SITE_URL = "https://eason-nb.apay.eu.cc/";
const RESULT_POSTER_SIZE = { width: 1400, height: 2400 };
const RESULT_HEADER_FONT = '"PingFangShaoHua"';
const RESULT_DEFAULT_FONT = '"PingFang SC", "Microsoft YaHei", sans-serif';
const RESULT_POSTER_FONT_SAMPLE = "陈奕迅冠军杯 EASON SONG CUP";
let resultPosterBlob = null;
let resultPosterUrl = null;
let resultAnalysis = null;

function posterFont(weight, size, family = RESULT_DEFAULT_FONT) {
  return `${weight} ${size}px ${family}`;
}

async function ensureResultPosterFont() {
  if (!document.fonts?.load) return;
  const loadedFaces = await document.fonts.load(`400 42px ${RESULT_HEADER_FONT}`, RESULT_POSTER_FONT_SAMPLE);
  if (!loadedFaces.length) throw new Error("海报字体加载失败，请检查网络后重试");
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

function posterWrapText(context, text, maxWidth) {
  const characters = Array.from(String(text || ""));
  const lines = [];
  let line = "";
  characters.forEach(character => {
    const candidate = `${line}${character}`;
    if (!line || context.measureText(candidate).width <= maxWidth) {
      line = candidate;
      return;
    }
    const lastSpace = line.lastIndexOf(" ");
    if (lastSpace > 0 && /[A-Za-z0-9]/.test(character) && /[A-Za-z0-9]/.test(line.at(-1))) {
      lines.push(line.slice(0, lastSpace).trimEnd());
      line = `${line.slice(lastSpace + 1)}${character}`;
    } else {
      lines.push(line.trimEnd());
      line = character.trimStart();
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function posterTextLayout(context, text, options) {
  const { maxWidth, maxLines = 2, fontSize = 18, minFontSize = 11, weight = 600, fontFamily = RESULT_DEFAULT_FONT } = options;
  for (let size = fontSize; size >= minFontSize; size -= 1) {
    context.font = posterFont(weight, size, fontFamily);
    const lines = posterWrapText(context, text, maxWidth);
    if (lines.length <= maxLines) return { lines, size };
  }
  context.font = posterFont(weight, minFontSize, fontFamily);
  const wrapped = posterWrapText(context, text, maxWidth);
  const lines = wrapped.slice(0, maxLines);
  if (wrapped.length > maxLines) {
    lines[maxLines - 1] = posterTruncate(context, wrapped.slice(maxLines - 1).join(""), maxWidth);
  }
  return { lines, size: minFontSize };
}

function posterDrawFittedText(context, text, x, centerY, options) {
  const layout = posterTextLayout(context, text, options);
  const lineHeight = layout.size * 1.16;
  const startY = centerY - ((layout.lines.length - 1) * lineHeight) / 2;
  context.font = posterFont(options.weight || 600, layout.size, options.fontFamily);
  context.textAlign = options.align || "left";
  context.textBaseline = "middle";
  layout.lines.forEach((line, index) => context.fillText(line, x, startY + index * lineHeight));
  return layout;
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
  posterDrawFittedText(context, song?.title || "未知歌曲", x + coverSize + 16, y + rowHeight / 2, {
    maxWidth: width - coverSize - 26,
    maxLines: 2,
    fontSize: options.fontSize || 17,
    minFontSize: options.minFontSize || 11,
    weight: winner ? 700 : 500,
    fontFamily: RESULT_DEFAULT_FONT
  });
  context.globalAlpha = 1;
}

function posterMatch(context, images, decision, x, y, width, accent) {
  if (!decision) return;
  const candidates = decision.candidateIds.map(id => songById.get(id)).filter(Boolean);
  const rowHeight = 46;
  const gap = 6;
  posterSongRow(context, images, candidates[0], decision.winnerId, x, y, width, { accent, rowHeight, coverSize: 34, fontSize: 16 });
  posterSongRow(context, images, candidates[1], decision.winnerId, x, y + rowHeight + gap, width, { accent, rowHeight, coverSize: 34, fontSize: 16 });
}

function posterWinnerCard(context, images, decision, x, y, width, accent, options = {}) {
  if (!decision) return;
  const song = songById.get(decision.winnerId);
  const isChampion = decision.winnerId === state.championId;
  const height = options.height || 68;
  const coverSize = options.coverSize || 48;
  posterRoundedRect(context, x, y, width, height, 7, "#19191f", isChampion ? accent : "#3a3942", isChampion ? 2 : 1);
  posterCover(context, images, song, x + 8, y + (height - coverSize) / 2, coverSize, 5);
  context.fillStyle = isChampion ? "#f9f6ff" : "#d4d1db";
  posterDrawFittedText(context, song?.title || "未知歌曲", x + coverSize + 16, y + height / 2, {
    maxWidth: width - coverSize - 24,
    maxLines: 2,
    fontSize: options.fontSize || 17,
    minFontSize: options.minFontSize || 11,
    weight: isChampion ? 750 : 600,
    fontFamily: RESULT_DEFAULT_FONT
  });
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
  context.fillStyle = "#08080a";
  context.fillRect(0, 0, width, height);
  if (image) {
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    context.save();
    context.globalAlpha = .12;
    context.filter = "grayscale(100%)";
    context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    context.restore();
  }
  context.fillStyle = "rgba(6, 6, 8, .38)";
  context.fillRect(0, 0, width, height);
}

function drawPosterHeader(context) {
  const catalogSize = window.EASON_CATALOG_SIZE || 387;
  context.textAlign = "center";
  context.fillStyle = "#a65cff";
  context.font = posterFont(850, 42, RESULT_HEADER_FONT);
  context.fillText("EASON SONG CUP", 700, 82);
  context.fillStyle = "#f7f5fa";
  context.font = posterFont(800, 58, RESULT_HEADER_FONT);
  context.fillText("陈奕迅 · 私人歌曲冠军杯", 700, 158);
  context.fillStyle = "#8d8996";
  context.font = posterFont(500, 20, RESULT_HEADER_FONT);
  context.fillText(`从 ${catalogSize} 个版本里，选出你最舍不得淘汰的那一首`, 700, 204);
  context.textAlign = "left";
}

function drawPosterBracket(context, images, rounds) {
  const accent = "#d95cff";
  const r32Width = 245;
  const r16Width = 215;
  const r8Width = 165;
  const leftX = 30;
  const rightX = 1125;
  const leftR16X = 300;
  const rightR16X = 885;
  const leftR8X = 530;
  const rightR8X = 705;
  const baseY = 300;
  const matchStep = 142;
  const r32Y = Array.from({ length: 8 }, (_, index) => baseY + index * matchStep);
  const r16Y = [386, 670, 954, 1238];
  const r8Y = [528, 1096];
  const left32 = rounds.round32.slice(0, 8);
  const right32 = rounds.round32.slice(8, 16);
  const left16 = rounds.round16.slice(0, 4);
  const right16 = rounds.round16.slice(4, 8);
  const left8 = rounds.quarterfinals.slice(0, 2);
  const right8 = rounds.quarterfinals.slice(2, 4);

  const matchWinnerY = (decision, y) => {
    const winnerIndex = Math.max(0, decision.candidateIds.indexOf(decision.winnerId));
    return y + winnerIndex * 52 + 23;
  };
  left32.forEach((decision, index) => posterConnector(context, leftX + r32Width, matchWinnerY(decision, r32Y[index]), leftR16X, r16Y[Math.floor(index / 2)] + 34, decision.winnerId === state.championId));
  right32.forEach((decision, index) => posterConnector(context, rightX, matchWinnerY(decision, r32Y[index]), rightR16X + r16Width, r16Y[Math.floor(index / 2)] + 34, decision.winnerId === state.championId));
  left16.forEach((decision, index) => posterConnector(context, leftR16X + r16Width, r16Y[index] + 34, leftR8X, r8Y[Math.floor(index / 2)] + 34, decision.winnerId === state.championId));
  right16.forEach((decision, index) => posterConnector(context, rightR16X, r16Y[index] + 34, rightR8X + r8Width, r8Y[Math.floor(index / 2)] + 34, decision.winnerId === state.championId));

  context.fillStyle = "#777380";
  context.font = posterFont(700, 16);
  context.fillText("32 强", leftX, 270);
  context.fillText("16 强", leftR16X, 270);
  context.fillText("四强席位", leftR8X, 500);
  context.textAlign = "right";
  context.fillText("32 强", rightX + r32Width, 270);
  context.fillText("16 强", rightR16X + r16Width, 270);
  context.fillText("四强席位", rightR8X + r8Width, 500);
  context.textAlign = "left";

  left32.forEach((decision, index) => posterMatch(context, images, decision, leftX, r32Y[index], r32Width, accent));
  right32.forEach((decision, index) => posterMatch(context, images, decision, rightX, r32Y[index], r32Width, accent));
  left16.forEach((decision, index) => posterWinnerCard(context, images, decision, leftR16X, r16Y[index], r16Width, accent));
  right16.forEach((decision, index) => posterWinnerCard(context, images, decision, rightR16X, r16Y[index], r16Width, accent));
  left8.forEach((decision, index) => posterWinnerCard(context, images, decision, leftR8X, r8Y[index], r8Width, accent, { coverSize: 38, fontSize: 15, minFontSize: 10 }));
  right8.forEach((decision, index) => posterWinnerCard(context, images, decision, rightR8X, r8Y[index], r8Width, accent, { coverSize: 38, fontSize: 15, minFontSize: 10 }));
}

function drawPosterPage(context, images, decisions) {
  const accent = "#d95cff";
  const labels = ["头名资格赛", "四强淘汰赛", "决赛资格赛", "总决赛"];
  const panelWidth = 300;
  const panelY = 1452;
  context.fillStyle = "#8f8b97";
  context.font = posterFont(750, 17);
  context.textAlign = "left";
  context.fillText("PAGE 四强", 40, 1425);
  decisions.forEach((decision, index) => {
    const x = 40 + index * 330;
    posterRoundedRect(context, x, panelY, panelWidth, 150, 9, "rgba(20, 20, 25, .9)", decision.winnerId === state.championId ? accent : "#34343d", decision.winnerId === state.championId ? 2 : 1);
    context.fillStyle = decision.winnerId === state.championId ? "#d95cff" : "#8f8b97";
    context.font = posterFont(700, 14);
    context.fillText(`${String(index + 1).padStart(2, "0")} · ${labels[index]}`, x + 10, panelY + 24);
    const candidates = decision.candidateIds.map(id => songById.get(id)).filter(Boolean);
    posterSongRow(context, images, candidates[0], decision.winnerId, x + 10, panelY + 38, panelWidth - 20, { accent, rowHeight: 44, coverSize: 32, fontSize: 15, minFontSize: 10 });
    posterSongRow(context, images, candidates[1], decision.winnerId, x + 10, panelY + 92, panelWidth - 20, { accent, rowHeight: 44, coverSize: 32, fontSize: 15, minFontSize: 10 });
  });
}

function drawPosterChampion(context, images, story) {
  const x = 60;
  const y = 1640;
  const width = 1280;
  const height = 250;
  const accent = "#d95cff";
  context.shadowColor = "rgba(175, 77, 255, .36)";
  context.shadowBlur = 28;
  posterRoundedRect(context, x, y, width, height, 16, "#17171d", accent, 2.5);
  context.shadowBlur = 0;
  posterCover(context, images, story.champion, x + 24, y + 24, 202, 12);
  context.textAlign = "left";
  context.fillStyle = "#f5c85a";
  context.font = posterFont(900, 30);
  context.fillText("♛  冠军 · CHAMPION", x + 260, y + 55);
  context.fillStyle = "#f8f6fb";
  posterDrawFittedText(context, story.champion.title, x + 260, y + 118, { maxWidth: 430, maxLines: 2, fontSize: 46, minFontSize: 28, weight: 850, fontFamily: RESULT_DEFAULT_FONT });
  context.fillStyle = "#8f8b97";
  posterDrawFittedText(context, story.champion.album, x + 260, y + 200, { maxWidth: 430, maxLines: 2, fontSize: 20, minFontSize: 14, weight: 500 });

  const totalMs = state.decisions.reduce((sum, decision) => sum + decision.durationMs, 0);
  const hardest = [...state.decisions].sort((left, right) => right.durationMs - left.durationMs)[0];
  const stats = [
    [String(state.decisions.length), "次正式选择"],
    [formatDuration(totalMs), "累计思考"],
    [String(story.championWins), "冠军胜场"],
    [hardest ? formatDuration(hardest.durationMs) : "—", "最纠结一票"]
  ];
  const startX = x + 760;
  stats.forEach(([value, label], index) => {
    const statX = startX + (index % 2) * 245;
    const statY = y + 78 + Math.floor(index / 2) * 98;
    context.fillStyle = "#f5f3f8";
    context.font = posterFont(750, 30);
    context.textAlign = "left";
    context.fillText(value, statX, statY);
    context.fillStyle = "#7f7b88";
    context.font = posterFont(500, 15);
    context.fillText(label, statX, statY + 28);
  });
  context.textAlign = "left";
}

function drawPosterAnalysis(context, analysis) {
  const x = 60;
  const y = 1940;
  const width = 1280;
  const accent = "#a65cff";
  context.fillStyle = accent;
  context.font = posterFont(800, 17);
  context.fillText("DEEPSEEK PRO 赛后解析", x, y + 22);
  context.fillStyle = "#f7f5fa";
  posterDrawFittedText(context, analysis.headline, x, y + 76, { maxWidth: 560, maxLines: 1, fontSize: 34, minFontSize: 24, weight: 800 });
  context.fillStyle = "#aaa6b1";
  posterDrawFittedText(context, analysis.summary, x + 600, y + 73, { maxWidth: 680, maxLines: 3, fontSize: 18, minFontSize: 15, weight: 500 });

  context.strokeStyle = "#36343d";
  context.beginPath(); context.moveTo(x, y + 130); context.lineTo(x + width, y + 130); context.stroke();
  const columnWidth = 400;
  analysis.observations.slice(0, 3).forEach((observation, index) => {
    const columnX = x + index * 440;
    if (index) {
      context.beginPath(); context.moveTo(columnX - 20, y + 154); context.lineTo(columnX - 20, y + 274); context.stroke();
    }
    context.fillStyle = accent;
    context.font = posterFont(750, 14);
    context.fillText(`0${index + 1}`, columnX, y + 170);
    context.fillStyle = "#d8d5dc";
    posterDrawFittedText(context, observation, columnX, y + 226, { maxWidth: columnWidth, maxLines: 4, fontSize: 16, minFontSize: 13, weight: 500 });
  });
}

function drawPosterFooter(context, qrImage, offsetY = 0) {
  context.strokeStyle = "#292832";
  context.lineWidth = 1;
  context.beginPath(); context.moveTo(60, 1970 + offsetY); context.lineTo(1340, 1970 + offsetY); context.stroke();
  posterRoundedRect(context, 112, 2035 + offsetY, 270, 270, 18, "#ffffff");
  if (qrImage) context.drawImage(qrImage, 127, 2050 + offsetY, 240, 240);
  context.fillStyle = "#a65cff";
  context.font = posterFont(850, 38);
  context.fillText("EASON SONG CUP", 445, 2105 + offsetY);
  context.fillStyle = "#f5f3f8";
  context.font = posterFont(700, 25);
  context.fillText("扫码开始你的陈奕迅歌曲冠军杯", 445, 2158 + offsetY);
  context.fillStyle = "#88848f";
  context.font = posterFont(500, 18);
  context.fillText("把二维码发给朋友，看看你们最后会不会选到同一首", 445, 2205 + offsetY);
  context.fillStyle = "#aaa6b1";
  context.font = posterFont(600, 17);
  context.fillText(RESULT_SITE_URL, 445, 2255 + offsetY);
}

function drawEditorialPosterHeader(context) {
  const catalogSize = window.EASON_CATALOG_SIZE || 387;
  context.textAlign = "left";
  context.fillStyle = "#ff5064";
  context.font = posterFont(400, 38, RESULT_HEADER_FONT);
  context.fillText("EASON SONG CUP", 72, 82);
  context.fillStyle = "#f8f7f4";
  context.font = posterFont(400, 60, RESULT_HEADER_FONT);
  context.fillText("陈奕迅 · 私人歌曲冠军杯", 72, 154);
  context.fillStyle = "#a7a3ab";
  context.font = posterFont(400, 20, RESULT_HEADER_FONT);
  context.fillText(`从 ${catalogSize} 个版本里，选出你最舍不得淘汰的那一首`, 72, 202);
  context.strokeStyle = "rgba(255, 255, 255, .16)";
  context.beginPath();
  context.moveTo(72, 228);
  context.lineTo(1328, 228);
  context.stroke();
}

function drawEditorialPosterChampion(context, images, story) {
  const x = 72;
  const y = 270;
  const coverSize = 420;
  posterCover(context, images, story.champion, x, y, coverSize, 10);

  context.fillStyle = "#ff5064";
  context.font = posterFont(800, 20);
  context.fillText("NO. 01  ·  YOUR EASON CHAMPION", 550, y + 30);
  context.fillStyle = "#faf8f5";
  posterDrawFittedText(context, story.champion.title, 550, y + 132, {
    maxWidth: 760,
    maxLines: 2,
    fontSize: 78,
    minFontSize: 44,
    weight: 850
  });
  context.fillStyle = "#aaa6ae";
  posterDrawFittedText(context, story.champion.album, 550, y + 232, {
    maxWidth: 730,
    maxLines: 2,
    fontSize: 24,
    minFontSize: 17,
    weight: 500
  });

  const totalMs = state.decisions.reduce((sum, decision) => sum + decision.durationMs, 0);
  const hardest = [...state.decisions].sort((left, right) => right.durationMs - left.durationMs)[0];
  const stats = [
    [String(state.decisions.length), "次正式选择"],
    [String(story.championWins), "冠军胜场"],
    [formatDuration(totalMs), "累计思考"],
    [hardest ? formatDuration(hardest.durationMs) : "—", "最纠结一票"]
  ];
  context.strokeStyle = "rgba(255, 255, 255, .14)";
  context.beginPath();
  context.moveTo(550, y + 302);
  context.lineTo(1328, y + 302);
  context.stroke();
  stats.forEach(([value, label], index) => {
    const statX = 550 + index * 194;
    context.fillStyle = "#f6f3ef";
    context.font = posterFont(750, 30);
    context.fillText(value, statX, y + 360);
    context.fillStyle = "#85818a";
    context.font = posterFont(500, 15);
    context.fillText(label, statX, y + 390);
  });
  context.fillStyle = "#d1cdd3";
  context.font = posterFont(500, 18);
  context.fillText("一轮轮比较之后，这就是你留下的答案。", 550, y + 444);
}

function drawEditorialPosterFinalFour(context, images, story) {
  const y = 790;
  const finalists = [story.champion, ...story.finalists].slice(0, 4);
  const labels = ["冠军", "亚军", "最终四强", "最终四强"];
  context.fillStyle = "#ff5064";
  context.font = posterFont(800, 17);
  context.fillText("FINAL FOUR  ·  最终四强", 72, y + 24);
  finalists.forEach((song, index) => {
    const x = 72 + index * 316;
    const cardY = y + 56;
    context.strokeStyle = index === 0 ? "#ff5064" : "rgba(255, 255, 255, .18)";
    context.beginPath();
    context.moveTo(x, cardY);
    context.lineTo(x + 286, cardY);
    context.stroke();
    posterCover(context, images, song, x, cardY + 20, 82, 6);
    context.fillStyle = index === 0 ? "#ff6879" : "#8e8992";
    context.font = posterFont(700, 13);
    context.fillText(labels[index], x + 102, cardY + 42);
    context.fillStyle = "#f1eef3";
    posterDrawFittedText(context, song?.title || "未知歌曲", x + 102, cardY + 78, {
      maxWidth: 180,
      maxLines: 2,
      fontSize: 20,
      minFontSize: 14,
      weight: index === 0 ? 750 : 600
    });
  });
}

function drawEditorialPosterRoad(context, images, story) {
  const top = 1060;
  context.fillStyle = "#f7f4f0";
  context.font = posterFont(800, 32);
  context.fillText("这首歌怎么走到了最后", 72, top + 30);
  context.fillStyle = "#8e8992";
  context.font = posterFont(500, 17);
  context.fillText("最后十场直接胜利，按赛程顺序回看", 72, top + 64);

  story.road.slice(0, 10).forEach(({ songId, decision }, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 72 + column * 640;
    const y = top + 104 + row * 130;
    const song = songById.get(songId);
    posterRoundedRect(context, x, y, 600, 108, 7, "rgba(20, 20, 24, .82)", "#37353d", 1);
    posterCover(context, images, song, x + 14, y + 14, 80, 5);
    context.fillStyle = "#ff6073";
    context.font = posterFont(750, 13);
    const stage = PHASE_LABELS[decision.phase] || decision.label || "淘汰赛";
    context.fillText(`${String(index + 1).padStart(2, "0")}  ·  ${stage}`, x + 112, y + 34);
    context.fillStyle = "#f4f1f5";
    posterDrawFittedText(context, song?.title || "未知歌曲", x + 112, y + 70, {
      maxWidth: 466,
      maxLines: 2,
      fontSize: 22,
      minFontSize: 15,
      weight: 650
    });
  });
}

function drawEditorialPosterAnalysis(context, analysis) {
  const x = 72;
  const y = 1850;
  context.strokeStyle = "rgba(255, 255, 255, .16)";
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(1328, y);
  context.stroke();
  context.fillStyle = "#ff5064";
  context.font = posterFont(800, 17);
  context.fillText("DEEPSEEK PRO 赛后解析", x, y + 45);
  context.fillStyle = "#f7f4f0";
  posterDrawFittedText(context, analysis.headline, x, y + 105, {
    maxWidth: 560,
    maxLines: 2,
    fontSize: 38,
    minFontSize: 26,
    weight: 800
  });
  context.fillStyle = "#b9b5bd";
  posterDrawFittedText(context, analysis.summary, x + 630, y + 108, {
    maxWidth: 698,
    maxLines: 4,
    fontSize: 18,
    minFontSize: 15,
    weight: 500
  });

  const comparisons = Array.isArray(analysis.comparisons) ? analysis.comparisons.slice(0, 6) : [];
  const columnWidth = 390;
  if (comparisons.length) {
    comparisons.forEach((comparison, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const columnX = x + column * 432;
      const itemY = y + 190 + row * 154;
      if (row) {
        context.strokeStyle = "rgba(255, 255, 255, .12)";
        context.beginPath(); context.moveTo(columnX, itemY - 18); context.lineTo(columnX + columnWidth, itemY - 18); context.stroke();
      }
      context.fillStyle = "#ff6073";
      context.font = posterFont(800, 13);
      context.fillText(`0${index + 1}  ·  关键对比`, columnX, itemY);
      context.fillStyle = "#f2eff3";
      posterDrawFittedText(context, comparison.matchup, columnX, itemY + 38, {
        maxWidth: columnWidth,
        maxLines: 2,
        fontSize: 17,
        minFontSize: 13,
        weight: 750
      });
      context.fillStyle = "#aaa6ae";
      posterDrawFittedText(context, comparison.insight, columnX, itemY + 86, {
        maxWidth: columnWidth,
        maxLines: 3,
        fontSize: 14,
        minFontSize: 11,
        weight: 500
      });
    });
    return;
  }
  analysis.observations.slice(0, 3).forEach((observation, index) => {
    const columnX = x + index * 432;
    const itemY = y + 195;
    context.fillStyle = "#ff6073";
    context.font = posterFont(800, 14);
    context.fillText(`0${index + 1}`, columnX, itemY);
    context.fillStyle = "#ddd9df";
    posterDrawFittedText(context, observation, columnX, itemY + 67, {
      maxWidth: columnWidth,
      maxLines: 5,
      fontSize: 17,
      minFontSize: 13,
      weight: 500
    });
  });
}

function drawEditorialPosterFooter(context, qrImage, y) {
  context.strokeStyle = "rgba(255, 255, 255, .16)";
  context.beginPath();
  context.moveTo(72, y);
  context.lineTo(1328, y);
  context.stroke();
  posterRoundedRect(context, 72, y + 42, 214, 214, 12, "#ffffff");
  if (qrImage) context.drawImage(qrImage, 84, y + 54, 190, 190);
  context.fillStyle = "#ff5064";
  context.font = posterFont(800, 30);
  context.fillText("EASON SONG CUP", 330, y + 94);
  context.fillStyle = "#f5f2f6";
  context.font = posterFont(700, 24);
  context.fillText("扫码开始你的陈奕迅歌曲冠军杯", 330, y + 140);
  context.fillStyle = "#96919a";
  context.font = posterFont(500, 17);
  context.fillText("把结果发给朋友，看看你们最后会不会选到同一首", 330, y + 182);
  context.fillStyle = "#c0bbc3";
  context.font = posterFont(600, 16);
  context.fillText(RESULT_SITE_URL, 330, y + 222);
}

async function createResultPosterBlob() {
  const story = buildPostGameStory();
  if (!story.champion) throw new Error("结果数据不完整，暂时无法生成冠军结果图");
  if (document.fonts?.ready) await document.fonts.ready;
  await ensureResultPosterFont();
  const songIds = new Set([
    story.champion.id,
    ...story.finalists.map(song => song.id),
    ...story.road.map(item => item.songId)
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
  canvas.height = resultAnalysis ? 2720 : RESULT_POSTER_SIZE.height;
  const context = canvas.getContext("2d");
  drawPosterBackground(context, backgroundImage, canvas.width, canvas.height);
  drawEditorialPosterHeader(context);
  drawEditorialPosterChampion(context, images, story);
  drawEditorialPosterFinalFour(context, images, story);
  drawEditorialPosterRoad(context, images, story);
  if (resultAnalysis) drawEditorialPosterAnalysis(context, resultAnalysis);
  drawEditorialPosterFooter(context, qrImage, resultAnalysis ? 2380 : 1990);
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
  resultAnalysis = null;
  closeResultPoster();
}

function setResultAnalysis(analysis) {
  if (resultPosterUrl) URL.revokeObjectURL(resultPosterUrl);
  resultPosterBlob = null;
  resultPosterUrl = null;
  resultAnalysis = analysis;
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
window.setResultAnalysis = setResultAnalysis;
