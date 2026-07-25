const report = document.querySelector("#report");
const escapeHtml = (value) => String(value ?? "").replace(/[&<>\"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" })[char]);
const formatDuration = (ms) => {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, "0")}秒`;
};
const cover = (song) => escapeHtml(song?.cover || "assets/covers/1831490372.jpg");
const songName = (song) => escapeHtml(song?.title || "未知曲目");

function roadCard(vote) {
  const opponent = vote.eliminated[0];
  return `<article class="road"><img src="${cover(opponent)}" alt=""><div><span>${escapeHtml(vote.phase)} · ${formatDuration(vote.durationMs)}</span><strong>胜 ${songName(opponent)}</strong></div></article>`;
}
function tensionCard(vote) {
  const opponent = vote.eliminated[0];
  return `<article class="tension"><div class="tension-song"><img src="${cover(vote.winner)}" alt=""><div><span>留下 · ${formatDuration(vote.durationMs)}</span><strong>${songName(vote.winner)}</strong></div></div><b class="vs">VS</b><div class="tension-song"><img src="${cover(opponent)}" alt=""><div><span>离开</span><strong>${songName(opponent)}</strong></div></div></article>`;
}

fetch("eason-392-voting-record.json")
  .then(response => response.ok ? response.json() : Promise.reject(new Error("找不到投票记录")))
  .then(record => {
    const votes = record.votes || [];
    const champion = record.champion;
    const championRoad = votes.filter(vote => vote.winner?.id === champion.id).slice(-10);
    const tenseVotes = [...votes].sort((a, b) => b.durationMs - a.durationMs).slice(0, 6);
    const pageVotes = votes.filter(vote => vote.phase === "四强Page审判");
    const finalists = [...new Map(pageVotes.flatMap(vote => [vote.winner, ...vote.eliminated]).map(song => [song.id, song])).values()].filter(song => song.id !== champion.id).slice(0, 3);
    const totalDuration = votes.reduce((total, vote) => total + vote.durationMs, 0);
    const versionVotes = votes.filter(vote => vote.phase === "版本预选");
    const liveWins = versionVotes.filter(vote => vote.winner?.edition === "live").length;
    const phaseCounts = Object.entries(votes.reduce((counts, vote) => ({ ...counts, [vote.phase]: (counts[vote.phase] || 0) + 1 }), {}));
    const finalVote = pageVotes.at(-1);

    report.innerHTML = `
      <section class="hero"><div class="hero-art"><img src="${cover(champion)}" alt="${songName(champion)} 封面"></div><div class="hero-copy"><p class="eyebrow">YOUR EASON CHAMPION · 2026</p><h1>${songName(champion)}</h1><p>从 392 个独立版本、499 次选择中走到最后。它不是一首被推荐的冠军，而是你亲手一次次留下的答案。</p><div class="hero-meta"><span>${escapeHtml(champion.album)}</span><span>${champion.edition === "live" ? "现场版本" : "录音室版本"}</span><span>${record.completedAt.slice(0, 10)} 完赛</span></div></div></section>
      <section class="stats"><article><strong>${votes.length}</strong><span>次正式选择</span></article><article><strong>${formatDuration(totalDuration)}</strong><span>累计思考</span></article><article><strong>${liveWins}/${versionVotes.length}</strong><span>版本战选择现场</span></article><article><strong>${championRoad.length}</strong><span>冠军胜场</span></article></section>
      <section class="map"><div class="map-head"><div><p class="eyebrow">YOUR CHAMPION MAP</p><h2>这首歌，是怎么走到最后的</h2></div><p>左边是冠军亲手淘汰的 10 首歌；右边是你停留最久的 6 个瞬间。中间不是通用的淘汰树，而是这一次真实发生过的选择。</p></div><div class="map-grid"><div class="lane"><p class="lane-title">冠军之路 · 10 场</p>${championRoad.map(roadCard).join("")}</div><article class="champion"><img src="${cover(champion)}" alt="${songName(champion)} 封面"><p class="eyebrow">THE ONE</p><h3>${songName(champion)}</h3><p>${finalVote ? `总决赛 · ${formatDuration(finalVote.durationMs)} 才定下` : "你的最终冠军"}</p></article><div class="lane"><p class="lane-title">最难放下 · 6 场</p>${tenseVotes.map(tensionCard).join("")}</div></div><div class="finals">${finalists.map((song, index) => `<div class="finalist"><img src="${cover(song)}" alt=""><div><span>${index === 0 ? "总决赛对手" : "最终四强"}</span><strong>${songName(song)}</strong></div></div>`).join("")}</div></section>
      <section class="archive"><p class="eyebrow">THE FULL RECORD STAYS</p><h2>你的选择，全部有迹可循。</h2><p>这部分仍然是原来的完整档案：每一场投票、每个阶段筛选和导出记录都不会被这张冠军命运图替代。以下是本次赛程的阶段构成。</p><div class="phase-list">${phaseCounts.map(([phase, count]) => `<div><strong>${escapeHtml(phase)}</strong><span>${count} 票</span></div>`).join("")}</div></section>`;
  })
  .catch(error => { report.innerHTML = `<p class="loading">无法读取这份投票记录：${escapeHtml(error.message)}</p>`; });
