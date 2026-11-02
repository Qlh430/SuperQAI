"use strict";

const SEARCH_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";

function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}

function createChatSearchService({
  fetchImpl = globalThis.fetch,
  maxResults = process.env.WEB_SEARCH_MAX_RESULTS || 5,
  fetchPages = process.env.WEB_SEARCH_FETCH_PAGES || 3,
  pageChars = process.env.WEB_SEARCH_PAGE_CHARS || 2200,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Chat search service requires a fetch implementation.");
  const searchMaxResults = boundedInteger(maxResults, 5, 1, 8);
  const searchFetchPages = boundedInteger(fetchPages, 3, 0, 5);
  const searchPageChars = boundedInteger(pageChars, 2200, 600, 6000);

  async function fetchWithTimeout(url, options = {}, timeoutMs = 60_000) {
    const timeoutSignal = AbortSignal.timeout(Math.max(1, Number(timeoutMs) || 60_000));
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;
    return fetchImpl(url, { ...options, signal });
  }

  function buildDirectWeatherAnswer(query, webSearchResults = []) {
    if (!/(天气|气温|温度|下雨|降雨|风力|weather)/i.test(query || "")) return "";
    const weatherSources = webSearchResults.filter((item) => item?.snippet && /天气|温度|气温|降水|风|湿度/i.test(item.snippet));
    if (!weatherSources.length) return "";
    const data = mergeWeatherSnippets(weatherSources);
    const primarySource = weatherSources.find((item) => /中国天气网|天气网/.test(item.title || "")) || weatherSources[0];
    const combinedSnippet = weatherSources.map((item) => item.snippet || "").join("\n");
    const city = data["地点"] || extractWeatherLocation(query) || "当地";
    const weather = data["当前天气"] || pickWeatherText(combinedSnippet) || "天气信息见来源";
    const currentTemp = data["当前温度"] || data["温度"] || "";
    const feelsLike = data["体感温度"] || "";
    const humidity = data["相对湿度"] || data["湿度"] || "";
    const wind = data["风速"] || pickLine(combinedSnippet, /风/);
    const range = data["今日范围"] || pickLine(combinedSnippet, /最高|最低|范围|气温/);
    const rain = data["今日最高降水概率"] || pickLine(combinedSnippet, /降水|降雨|下雨/);
    const updated = data["更新时间"] || "";
    const sourceName = weatherSources
      .map((item) => item.title || "天气来源")
      .filter(Boolean)
      .slice(0, 3)
      .join("、");

    const lines = [`**${city}今天的天气** ${weatherEmoji(weather)}`];
    const bullets = [
      currentTemp && `当前温度：**${currentTemp}**`,
      feelsLike && `体感温度：**${feelsLike}**`,
      humidity && `湿度：**${humidity}**`,
      wind && `风况：${wind}`,
      range && `今日气温范围：**${range}**`,
      rain && `降水：${rain}`,
    ].filter(Boolean);
    lines.push(...bullets.map((item) => `- ${item}`));

    const hotText = `${currentTemp} ${feelsLike} ${range}`;
    const hot = /3[2-9]|4\d/.test(hotText);
    const rainy = /雨|降水|阵雨|雷/.test(`${weather} ${rain}`);
    const advice = [];
    if (hot) advice.push("白天偏热，出门注意防晒、补水。");
    if (rainy) advice.push("有降雨可能，建议带伞。");
    if (!advice.length) advice.push("按日常出行准备即可，临出门前可再看一眼实时变化。");
    lines.push("");
    lines.push(`**出行建议**：${advice.join(" ")}`);
    lines.push("");
    lines.push(`数据来源：${sourceName || primarySource.title || "天气来源"}${updated ? `（更新时间：${updated}）` : ""}`);
    return lines.join("\n");
  }

  function parseWeatherSnippet(snippet) {
    const data = {};
    String(snippet || "").split(/\n+/).forEach((line) => {
      const clean = line.trim();
      const index = clean.indexOf("：");
      if (index > 0) data[clean.slice(0, index).trim()] = clean.slice(index + 1).trim();
    });
    return data;
  }

  function mergeWeatherSnippets(sources) {
    const merged = {};
    for (const source of sources) {
      const data = parseWeatherSnippet(source.snippet);
      for (const [key, value] of Object.entries(data)) {
        if (!merged[key] && value && value !== "未知") merged[key] = value;
      }
    }
    return merged;
  }

  function pickLine(text, pattern) {
    return String(text || "").split(/\n+/).map((line) => line.trim()).find((line) => pattern.test(line)) || "";
  }

  function pickWeatherText(text) {
    const line = pickLine(text, /晴|云|阴|雨|雪|雾|雷/);
    return line.replace(/^.*?天气[：: ]?/, "").slice(0, 28);
  }

  function weatherEmoji(text) {
    if (/雷/.test(text)) return "⛈️";
    if (/雨/.test(text)) return "🌧️";
    if (/雪/.test(text)) return "❄️";
    if (/晴/.test(text)) return "☀️";
    if (/云|阴/.test(text)) return "⛅";
    return "🌤️";
  }

  async function performWebSearch(query) {
    const cleanQuery = String(query || "").trim();
    if (!cleanQuery) return [];
    const weatherResults = await searchWeatherIfNeeded(cleanQuery);
    const webResults = await searchDuckDuckGo(cleanQuery).catch(() => []);
    const enrichedResults = await enrichWebSearchResults(webResults, cleanQuery);
    return [...weatherResults, ...enrichedResults].slice(0, searchMaxResults);
  }

  async function searchWeatherIfNeeded(query) {
    if (!/(天气|气温|温度|下雨|降雨|风力|weather)/i.test(query)) return [];
    const location = extractWeatherLocation(query);
    if (!location) return [];
    const preferredResults = await searchPreferredWeatherSites(location, query);
    const point = getKnownWeatherLocation(location) || await geocodeWeatherLocation(location);
    const fallbackResults = [];
    if (point) {
      const weather = await fetchOpenMeteoWeather(point).catch(() => null);
      if (weather) {
        fallbackResults.push({
          title: `${point.name}天气模型数据（Open-Meteo，非官方实况）`,
          url: "https://open-meteo.com/",
          snippet: formatWeatherSnippet(point, weather),
        });
      }
    }
    return [...preferredResults, ...fallbackResults];
  }

  async function searchPreferredWeatherSites(location, query) {
    const config = getPreferredWeatherSiteConfig(location, query);
    if (!config) return [];
    const results = [];
    const pages = await Promise.allSettled(config.sources.map(async (source) => {
      const html = await fetchWeatherPageText(source.url);
      const snippet = extractWeatherPageSnippet(html, source.kind);
      return snippet ? { title: source.title, url: source.url, snippet } : null;
    }));
    for (const page of pages) {
      if (page.status === "fulfilled" && page.value) results.push(page.value);
    }
    return results;
  }

  function getPreferredWeatherSiteConfig(location, query = "") {
    const value = `${location || ""} ${query || ""}`.toLowerCase();
    if (!value.includes("西安") && !value.includes("xian") && !value.includes("xi'an")) return null;
    return {
      name: "西安",
      sources: [
        {
          kind: "weatherCn",
          title: "中国天气网：西安天气预报",
          url: "https://www.weather.com.cn/weathern/101110101.shtml",
        },
        {
          kind: "tianqi",
          title: "天气网：西安今日天气",
          url: "https://www.tianqi.com/xian/today/",
        },
      ],
    };
  }

  async function fetchWeatherPageText(url) {
    const response = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": SEARCH_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    }, 12_000);
    if (!response.ok) throw new Error(`Weather page failed: ${response.status}`);
    return response.text();
  }

  function extractWeatherPageSnippet(html, kind) {
    const text = normalizeWeatherPageText(html);
    if (!text) return "";
    const keywords = kind === "tianqi"
      ? ["天气", "温度", "湿度", "风", "空气", "紫外线", "穿衣", "洗车", "感冒", "运动", "旅游"]
      : ["天气", "温度", "风", "空气", "生活指数", "穿衣", "紫外线", "洗车", "感冒", "运动"];
    const segments = text
      .split(/[。；;\n\r]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 4 && item.length <= 90)
      .filter((item) => keywords.some((keyword) => item.includes(keyword)));
    const unique = [];
    for (const item of segments) {
      if (!unique.some((existing) => existing === item || existing.includes(item) || item.includes(existing))) unique.push(item);
      if (unique.length >= 14) break;
    }
    return unique.join("\n");
  }

  function normalizeWeatherPageText(html) {
    return stripHtml(String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " "))
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractWeatherLocation(query) {
    const value = String(query || "").replace(/\s+/g, "");
    const patterns = [
      /(.+?)(?:今天|今日|现在|实时|明天|未来)?(?:的)?天气/,
      /(.+?)(?:今天|今日|现在|实时|明天|未来)?(?:的)?(?:气温|温度|降雨|下雨|风力)/,
    ];
    for (const pattern of patterns) {
      const match = value.match(pattern);
      if (match?.[1]) return match[1]
        .replace(/^(查一下|查询一下|查询|看看|看一下|看下|帮我看看|帮我看|帮我查一下|帮我查|我想知道|告诉我)/, "")
        .trim();
    }
    return "";
  }

  function getKnownWeatherLocation(name) {
    const key = String(name || "").replace(/市$/, "");
    const known = {
      西安: { name: "西安", latitude: 34.3416, longitude: 108.9398, timezone: "Asia/Shanghai" },
      北京: { name: "北京", latitude: 39.9042, longitude: 116.4074, timezone: "Asia/Shanghai" },
      上海: { name: "上海", latitude: 31.2304, longitude: 121.4737, timezone: "Asia/Shanghai" },
      广州: { name: "广州", latitude: 23.1291, longitude: 113.2644, timezone: "Asia/Shanghai" },
      深圳: { name: "深圳", latitude: 22.5431, longitude: 114.0579, timezone: "Asia/Shanghai" },
      杭州: { name: "杭州", latitude: 30.2741, longitude: 120.1551, timezone: "Asia/Shanghai" },
      成都: { name: "成都", latitude: 30.5728, longitude: 104.0668, timezone: "Asia/Shanghai" },
      重庆: { name: "重庆", latitude: 29.563, longitude: 106.5516, timezone: "Asia/Shanghai" },
      武汉: { name: "武汉", latitude: 30.5928, longitude: 114.3055, timezone: "Asia/Shanghai" },
      南京: { name: "南京", latitude: 32.0603, longitude: 118.7969, timezone: "Asia/Shanghai" },
    };
    return known[key] || null;
  }

  async function geocodeWeatherLocation(name) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=zh&format=json`;
    const response = await fetchWithTimeout(url, {}, 10_000);
    if (!response.ok) return null;
    const data = await response.json().catch(() => ({}));
    const item = Array.isArray(data.results) ? data.results[0] : null;
    if (!item) return null;
    return {
      name: item.name || name,
      latitude: item.latitude,
      longitude: item.longitude,
      timezone: item.timezone || "Asia/Shanghai",
    };
  }

  async function fetchOpenMeteoWeather(point) {
    const params = new URLSearchParams({
      latitude: String(point.latitude),
      longitude: String(point.longitude),
      timezone: point.timezone || "Asia/Shanghai",
      forecast_days: "3",
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    });
    const response = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?${params}`, {}, 10_000);
    if (!response.ok) return null;
    return response.json().catch(() => null);
  }

  function formatWeatherSnippet(point, data) {
    const current = data.current || {};
    const currentUnits = data.current_units || {};
    const daily = data.daily || {};
    const todayCode = daily.weather_code?.[0] ?? current.weather_code;
    const lines = [
      `地点：${point.name}`,
      "数据性质：Open-Meteo 预报模型/插值数据，适合日常参考，不等同于中国气象局官方气象站实况。",
      `更新时间：${current.time || "未知"}`,
      `当前天气：${weatherCodeToText(todayCode)}`,
      `当前温度：${formatWeatherValue(current.temperature_2m, currentUnits.temperature_2m || "°C")}`,
      `体感温度：${formatWeatherValue(current.apparent_temperature, currentUnits.apparent_temperature || "°C")}`,
      `相对湿度：${formatWeatherValue(current.relative_humidity_2m, currentUnits.relative_humidity_2m || "%")}`,
      `降水量：${formatWeatherValue(current.precipitation, currentUnits.precipitation || "mm")}`,
      `风速：${formatWeatherValue(current.wind_speed_10m, currentUnits.wind_speed_10m || "km/h")}，风向 ${formatWeatherValue(current.wind_direction_10m, currentUnits.wind_direction_10m || "°")}`,
    ];
    if (daily.time?.[0]) {
      lines.push(`今日范围：${formatWeatherValue(daily.temperature_2m_min?.[0], "°C")}~${formatWeatherValue(daily.temperature_2m_max?.[0], "°C")}`);
      lines.push(`今日最高降水概率：${formatWeatherValue(daily.precipitation_probability_max?.[0], "%")}`);
    }
    if (daily.time?.[1]) {
      lines.push(`明日天气：${weatherCodeToText(daily.weather_code?.[1])}，${formatWeatherValue(daily.temperature_2m_min?.[1], "°C")}~${formatWeatherValue(daily.temperature_2m_max?.[1], "°C")}，最高降水概率 ${formatWeatherValue(daily.precipitation_probability_max?.[1], "%")}`);
    }
    return lines.join("\n");
  }

  function formatWeatherValue(value, unit) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "未知";
    return `${value}${unit || ""}`;
  }

  function weatherCodeToText(code) {
    const map = {
      0: "晴",
      1: "大部晴朗",
      2: "局部多云",
      3: "阴/多云",
      45: "雾",
      48: "雾凇",
      51: "小毛毛雨",
      53: "中等毛毛雨",
      55: "较强毛毛雨",
      61: "小雨",
      63: "中雨",
      65: "大雨",
      71: "小雪",
      73: "中雪",
      75: "大雪",
      80: "阵雨",
      81: "较强阵雨",
      82: "强阵雨",
      95: "雷暴",
      96: "雷暴伴小冰雹",
      99: "雷暴伴大冰雹",
    };
    return map[Number(code)] || `天气代码 ${code}`;
  }

  async function enrichWebSearchResults(results, query) {
    if (!searchFetchPages) return results;
    const targets = results
      .filter((item) => /^https?:\/\//i.test(item.url || ""))
      .slice(0, searchFetchPages);
    const enriched = await Promise.allSettled(targets.map((item) => fetchSearchResultPage(item, query)));
    const byUrl = new Map(results.map((item) => [item.url, { ...item }]));
    for (const result of enriched) {
      if (result.status !== "fulfilled" || !result.value) continue;
      const existing = byUrl.get(result.value.url) || {};
      byUrl.set(result.value.url, { ...existing, ...result.value });
    }
    return Array.from(byUrl.values()).map((item) => ({
      ...item,
      snippet: [item.snippet, item.pageText].filter(Boolean).join("\n\n").slice(0, searchPageChars),
    }));
  }

  async function fetchSearchResultPage(result, query) {
    const response = await fetchWithTimeout(result.url, {
      headers: {
        "User-Agent": SEARCH_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,text/plain",
      },
    }, 12_000);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|text\/plain|application\/xhtml/i.test(contentType)) return null;
    const html = await response.text();
    const pageText = extractRelevantPageText(html, query);
    return pageText ? { ...result, pageText } : null;
  }

  function extractRelevantPageText(html, query) {
    const cleanHtml = String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<(nav|header|footer|aside|svg)[\s\S]*?<\/\1>/gi, " ");
    const title = stripHtml((cleanHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
    const segments = [];
    const segmentPattern = /<(h[1-3]|p|li|figcaption)[^>]*>([\s\S]*?)<\/\1>/gi;
    for (const match of cleanHtml.matchAll(segmentPattern)) {
      const text = stripHtml(match[2]);
      if (text.length >= 24 && text.length <= 520) segments.push(text);
    }
    if (!segments.length) {
      const fallback = stripHtml(cleanHtml).slice(0, searchPageChars);
      return [title, fallback].filter(Boolean).join("\n");
    }
    const terms = getSearchTerms(query);
    const scored = segments
      .map((text, index) => ({ text, index, score: scoreSearchSegment(text, terms) }))
      .filter((item) => item.score > 0 || item.index < 6)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, 14)
      .sort((a, b) => a.index - b.index)
      .map((item) => item.text);
    return [title, ...dedupeTextSegments(scored)].filter(Boolean).join("\n").slice(0, searchPageChars);
  }

  function getSearchTerms(query) {
    const text = String(query || "");
    const terms = new Set();
    for (const match of text.matchAll(/[\u4e00-\u9fa5]{2,}|[A-Za-z0-9][A-Za-z0-9'-]{1,}/g)) {
      terms.add(match[0].toLowerCase());
    }
    if (text.includes("葡萄牙")) terms.add("portugal");
    if (text.includes("世界杯")) terms.add("world cup");
    if (text.includes("刚果")) {
      terms.add("congo");
      terms.add("dr congo");
    }
    return Array.from(terms).slice(0, 12);
  }

  function scoreSearchSegment(text, terms) {
    const lower = String(text || "").toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (lower.includes(term)) score += term.length > 4 ? 3 : 2;
    }
    if (/\b\d+\s*[-–]\s*\d+\b/.test(lower)) score += 3;
    if (/today|yesterday|live|latest|group|standings|score|result|match|世界杯|小组|积分|战况|比分|赛果/.test(lower)) score += 2;
    return score;
  }

  function dedupeTextSegments(segments) {
    const output = [];
    for (const segment of segments) {
      if (!output.some((item) => item === segment || item.includes(segment) || segment.includes(item))) output.push(segment);
    }
    return output;
  }

  async function searchDuckDuckGo(query) {
    const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": SEARCH_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    }, 12_000);
    if (!response.ok) throw new Error(`联网搜索失败：${response.status}`);
    const html = await response.text();
    return parseDuckDuckGoResults(html).slice(0, searchMaxResults);
  }

  function parseDuckDuckGoResults(html) {
    const results = [];
    const blockPattern = /<div[^>]+class="[^"]*result[^"]*"[\s\S]*?<\/div>\s*<\/div>/gi;
    const blocks = String(html || "").match(blockPattern) || [];
    for (const block of blocks) {
      const linkMatch = block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;
      const url = normalizeDuckDuckGoUrl(decodeHtml(linkMatch[1]));
      if (!url || results.some((item) => item.url === url)) continue;
      const snippetMatch = block.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>|<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      results.push({
        title: stripHtml(linkMatch[2]),
        url,
        snippet: stripHtml(snippetMatch?.[1] || snippetMatch?.[2] || ""),
      });
    }
    return results;
  }

  function normalizeDuckDuckGoUrl(value) {
    try {
      const url = new URL(value, "https://duckduckgo.com");
      const uddg = url.searchParams.get("uddg");
      return uddg ? decodeURIComponent(uddg) : url.href;
    } catch {
      return "";
    }
  }

  function stripHtml(value) {
    return decodeHtml(String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  }

  function decodeHtml(value) {
    return String(value || "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }

  return Object.freeze({
    buildDirectWeatherAnswer,
    extractWeatherLocation,
    parseDuckDuckGoResults,
    extractRelevantPageText,
    performWebSearch,
  });
}

module.exports = { createChatSearchService };
