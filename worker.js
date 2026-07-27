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
    })) : []
  };
  return profile.champion.title && profile.totalDecisions ? profile : null;
}

function normalizeAnalysis(value) {
  const observations = Array.isArray(value?.observations)
    ? value.observations.map(item => cleanText(item, 140)).filter(Boolean).slice(0, 3)
    : [];
  const result = {
    headline: cleanText(value?.headline, 36),
    summary: cleanText(value?.summary, 180),
    observations,
    closing: cleanText(value?.closing, 80)
  };
  return result.headline && result.summary && observations.length === 3 ? result : null;
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
        model: "deepseek-v4-flash",
        messages: [
          {
            role: "system",
            content: "你是陈奕迅歌曲冠军杯的赛后解说。只根据用户提供的匿名选择摘要写中文解析，不要做心理诊断，不要虚构歌词、歌曲背景或用户信息。语气自然、具体、克制，避免空泛夸奖和AI腔。必须输出JSON对象：headline为不超过18字的标题；summary为60到90字总结；observations为恰好3条、每条30到55字的具体观察；closing为不超过35字的收尾。"
          },
          { role: "user", content: JSON.stringify(profile) }
        ],
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
        max_tokens: 600,
        temperature: 0.7,
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

  try {
    const payload = await upstream.json();
    const content = payload?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(String(content || "").replace(/^```(?:json)?\s*|\s*```$/g, ""));
    const analysis = normalizeAnalysis(parsed);
    if (!analysis) throw new Error("invalid response");
    return jsonResponse({ analysis }, 200, origin);
  } catch {
    return jsonResponse({ error: "解析结果格式异常，请重试", code: "INVALID_UPSTREAM_RESPONSE" }, 502, origin);
  }
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
