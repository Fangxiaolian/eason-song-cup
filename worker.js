const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const ALLOWED_ORIGINS = new Set([
  "https://eason-nb.apay.eu.cc",
  "https://eason-song-cup.fangxiaolian1115.workers.dev",
  "https://fangxiaolian.github.io"
]);

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  } catch {
    return false;
  }
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function jsonResponse(payload, status, origin) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin) }
  });
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeProfile(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const profile = {
    champion: {
      title: cleanText(input.champion?.title, 100),
      album: cleanText(input.champion?.album, 120),
      edition: cleanText(input.champion?.edition, 20),
      year: Number.isInteger(input.champion?.year) ? input.champion.year : null
    },
    finalFour: Array.isArray(input.finalFour) ? input.finalFour.slice(0, 4).map(item => ({
      title: cleanText(item?.title, 100),
      album: cleanText(item?.album, 120),
      edition: cleanText(item?.edition, 20),
      year: Number.isInteger(item?.year) ? item.year : null
    })) : [],
    mode: cleanText(input.mode, 20),
    totalDecisions: Math.max(0, Math.min(1000, Number(input.totalDecisions) || 0)),
    durationSeconds: Math.max(0, Math.min(86400, Number(input.durationSeconds) || 0)),
    versionPreference: {
      live: Math.max(0, Math.min(1000, Number(input.versionPreference?.live) || 0)),
      studio: Math.max(0, Math.min(1000, Number(input.versionPreference?.studio) || 0)),
      other: Math.max(0, Math.min(1000, Number(input.versionPreference?.other) || 0))
    },
    bilingualOutcomes: Array.isArray(input.bilingualOutcomes) ? input.bilingualOutcomes.slice(0, 8).map(item => ({
      matchup: cleanText(item?.matchup, 100),
      winner: cleanText(item?.winner, 100),
      eliminated: cleanText(item?.eliminated, 100)
    })) : [],
    frequentWinners: Array.isArray(input.frequentWinners) ? input.frequentWinners.slice(0, 8).map(item => ({
      title: cleanText(item?.title, 100),
      wins: Math.max(0, Math.min(1000, Number(item?.wins) || 0))
    })) : [],
    decadeDistribution: Array.isArray(input.decadeDistribution) ? input.decadeDistribution.slice(0, 10).map(item => ({
      decade: cleanText(item?.decade, 20),
      wins: Math.max(0, Math.min(1000, Number(item?.wins) || 0))
    })) : [],
    hardestChoices: Array.isArray(input.hardestChoices) ? input.hardestChoices.slice(0, 5).map(item => ({
      phase: cleanText(item?.phase, 30),
      chosen: cleanText(item?.chosen, 100),
      eliminated: Array.isArray(item?.eliminated) ? item.eliminated.slice(0, 3).map(value => cleanText(value, 100)) : [],
      durationSeconds: Math.max(0, Math.min(3600, Number(item?.durationSeconds) || 0))
    })) : [],
    keyComparisons: Array.isArray(input.keyComparisons) ? input.keyComparisons.slice(0, 12).map(item => ({
      phase: cleanText(item?.phase, 30),
      chosen: {
        title: cleanText(item?.chosen?.title, 100),
        album: cleanText(item?.chosen?.album, 120),
        edition: cleanText(item?.chosen?.edition, 20),
        year: Number.isInteger(item?.chosen?.year) ? item.chosen.year : null
      },
      eliminated: Array.isArray(item?.eliminated) ? item.eliminated.slice(0, 3).map(song => ({
        title: cleanText(song?.title, 100),
        album: cleanText(song?.album, 120),
        edition: cleanText(song?.edition, 20),
        year: Number.isInteger(song?.year) ? song.year : null
      })) : [],
      durationSeconds: Math.max(0, Math.min(3600, Number(item?.durationSeconds) || 0))
    })).filter(item => item.chosen.title && item.eliminated.some(song => song.title)) : []
  };
  return profile.champion.title && profile.totalDecisions ? profile : null;
}

function normalizeAnalysis(value) {
  const observations = Array.isArray(value?.observations)
    ? value.observations.map(item => cleanText(item, 220)).filter(Boolean).slice(0, 3)
    : [];
  const comparisons = Array.isArray(value?.comparisons)
    ? value.comparisons.map(item => ({
      matchup: cleanText(item?.matchup, 180),
      insight: cleanText(item?.insight, 220)
    })).filter(item => item.matchup && item.insight).slice(0, 6)
    : [];
  const result = {
    headline: cleanText(value?.headline, 36),
    summary: cleanText(value?.summary, 320),
    observations,
    comparisons,
    closing: cleanText(value?.closing, 120)
  };
  return result.headline && result.summary && observations.length === 3 && comparisons.length >= 4 ? result : null;
}

async function handleAnalyze(request, env, origin) {
  if (!env.DEEPSEEK_API_KEY) {
    return jsonResponse({ error: "DeepSeek 尚未配置", code: "DEEPSEEK_NOT_CONFIGURED" }, 503, origin);
  }
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > 16000) return jsonResponse({ error: "请求内容过大", code: "PAYLOAD_TOO_LARGE" }, 413, origin);

  let body;
  try {
    const raw = await request.text();
    if (raw.length > 16000) return jsonResponse({ error: "请求内容过大", code: "PAYLOAD_TOO_LARGE" }, 413, origin);
    body = JSON.parse(raw);
  } catch {
    return jsonResponse({ error: "请求格式无效", code: "INVALID_JSON" }, 400, origin);
  }
  const profile = normalizeProfile(body?.profile);
  if (!profile) return jsonResponse({ error: "选择摘要不完整", code: "INVALID_PROFILE" }, 400, origin);

  let upstream;
  try {
    upstream = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-v4-pro",
        messages: [
          {
            role: "system",
            content: [
              "你是陈奕迅歌曲冠军杯的赛后解说。请先综合思考，再输出中文赛后解析。",
              "只能使用用户提供的匿名选择摘要和关键对局，不要虚构歌词、曲风、歌曲背景、创作意图或用户信息，也不要做心理诊断。",
              "重点分析用户在具体歌曲之间如何取舍：优先冠军之路、四强、后期淘汰赛、停留时间较长的选择，以及录音室/现场、年代和语言版本的重复倾向。",
              "每个comparisons条目必须明确写出被选择和被淘汰的真实歌名，并说明这场取舍对整体偏好意味着什么。证据不足时用“更像是”“可能”表达，不要把推测写成事实。",
              "避免逐项复述数据；要把多场选择串成可以互相印证或彼此矛盾的偏好线索。语气自然、具体、克制，不要空泛夸奖，不要AI腔。",
              "必须输出JSON对象：headline为不超过18字的标题；summary为100到160字的总括；observations为恰好3条、每条45到80字的跨对局观察；comparisons为恰好6个对象，每个对象包含matchup和insight，matchup写“《选择曲》胜过《淘汰曲》”，insight为35到70字的具体比较；closing为不超过45字的收尾。"
            ].join("\n")
          },
          { role: "user", content: JSON.stringify(profile) }
        ],
        thinking: { type: "enabled" },
        reasoning_effort: "high",
        response_format: { type: "json_object" },
        max_tokens: 8000,
        stream: false
      })
    });
  } catch {
    return jsonResponse({ error: "暂时无法连接 DeepSeek", code: "UPSTREAM_UNAVAILABLE" }, 502, origin);
  }

  if (!upstream.ok) {
    const code = upstream.status === 429 ? "RATE_LIMITED" : "UPSTREAM_ERROR";
    const message = upstream.status === 429 ? "请求较多，请稍后再试" : "DeepSeek 暂时没有返回结果";
    return jsonResponse({ error: message, code }, upstream.status === 429 ? 429 : 502, origin);
  }

  let payload;
  try {
    payload = await upstream.json();
  } catch {
    return jsonResponse({ error: "DeepSeek 返回内容无法读取，请重试", code: "INVALID_UPSTREAM_JSON" }, 502, origin);
  }

  const content = String(payload?.choices?.[0]?.message?.content || "").trim();
  if (!content) {
    return jsonResponse({ error: "DeepSeek 思考完成但没有生成正文，请重试", code: "EMPTY_UPSTREAM_CONTENT" }, 502, origin);
  }

  let parsed;
  try {
    const withoutFence = content.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    try {
      parsed = JSON.parse(withoutFence);
    } catch {
      const start = withoutFence.indexOf("{");
      const end = withoutFence.lastIndexOf("}");
      if (start < 0 || end <= start) throw new Error("missing JSON object");
      parsed = JSON.parse(withoutFence.slice(start, end + 1));
    }
  } catch {
    return jsonResponse({ error: "DeepSeek 的解析正文没有完整生成，请重试", code: "INVALID_UPSTREAM_JSON" }, 502, origin);
  }

  const analysis = normalizeAnalysis(parsed);
  if (!analysis) {
    return jsonResponse({ error: "DeepSeek 返回的解析字段不完整，请重试", code: "INVALID_UPSTREAM_RESPONSE" }, 502, origin);
  }
  return jsonResponse({ analysis, model: "deepseek-v4-pro" }, 200, origin);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/analyze") {
      return new Response("Eason Song Cup API", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    const origin = request.headers.get("Origin") || "";
    if (!isAllowedOrigin(origin)) return jsonResponse({ error: "不允许的来源", code: "ORIGIN_NOT_ALLOWED" }, 403, "null");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== "POST") return jsonResponse({ error: "只支持 POST 请求", code: "METHOD_NOT_ALLOWED" }, 405, origin);
    if (!String(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) {
      return jsonResponse({ error: "只接受 JSON", code: "INVALID_CONTENT_TYPE" }, 415, origin);
    }
    return handleAnalyze(request, env, origin);
  }
};
