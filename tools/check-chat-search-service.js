"use strict";

const assert = require("node:assert/strict");
const { createChatSearchService } = require("../chat-search-service");

function response(body, { type = "text/html", ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: { get: (name) => String(name).toLowerCase() === "content-type" ? type : "" },
    text: async () => String(body || ""),
    json: async () => typeof body === "string" ? JSON.parse(body) : body,
  };
}

const duckDuckGoHtml = `
  <div class="result results_links">
    <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fmatch">世界杯 &amp; 比分更新</a>
    <div class="result__snippet">葡萄牙 2-1 对手，比赛已经结束。</div>
  </div>
</div>`;

(async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const value = String(url);
    calls.push(value);
    if (value.includes("weather.com.cn")) {
      return response("<html><p>西安天气：晴 当前温度：28°C 湿度：40% 风：东风</p></html>");
    }
    if (value.includes("tianqi.com")) {
      return response("<html><p>西安天气：多云 温度：27°C 空气：优 穿衣：短袖</p></html>");
    }
    if (value.includes("api.open-meteo.com/v1/forecast")) {
      return response(JSON.stringify({
        current: {
          time: "2026-09-24T12:00",
          temperature_2m: 28,
          apparent_temperature: 30,
          relative_humidity_2m: 40,
          precipitation: 0,
          weather_code: 0,
          wind_speed_10m: 8,
          wind_direction_10m: 90,
        },
        current_units: {
          temperature_2m: "°C",
          apparent_temperature: "°C",
          relative_humidity_2m: "%",
          precipitation: "mm",
          wind_speed_10m: "km/h",
          wind_direction_10m: "°",
        },
        daily: {
          time: ["2026-09-24", "2026-09-25"],
          weather_code: [0, 1],
          temperature_2m_min: [21, 20],
          temperature_2m_max: [31, 30],
          precipitation_probability_max: [5, 10],
        },
      }), { type: "application/json" });
    }
    if (value === "https://example.com/match") {
      return response("<html><head><title>比赛结果</title></head><body><p>葡萄牙 2-1 对手，世界杯小组赛已经结束，最新积分如下。</p></body></html>");
    }
    if (value.includes("duckduckgo.com/html")) return response(duckDuckGoHtml);
    throw new Error(`Unexpected request: ${value}`);
  };

  const service = createChatSearchService({ fetchImpl, fetchPages: 0, maxResults: 5 });
  const results = await service.performWebSearch("西安今天天气");
  assert.equal(results.length, 4);
  assert.match(results[0].title, /中国天气网/);
  assert.match(results[1].snippet, /27°C/);
  assert.match(results[2].snippet, /当前温度：28°C/);
  assert.equal(results[3].url, "https://example.com/match");
  assert.ok(calls.some((url) => url.includes("duckduckgo.com/html")));

  const answer = service.buildDirectWeatherAnswer("西安今天天气", results);
  assert.match(answer, /西安今天的天气/);
  assert.match(answer, /当前温度：\*\*28°C\*\*/);
  assert.match(answer, /数据来源：/);

  assert.equal(service.extractWeatherLocation("帮我查一下北京市今天天气"), "北京市");
  assert.deepEqual(service.parseDuckDuckGoResults(duckDuckGoHtml), [{
    title: "世界杯 & 比分更新",
    url: "https://example.com/match",
    snippet: "葡萄牙 2-1 对手，比赛已经结束。",
  }]);

  const pageText = service.extractRelevantPageText(`
    <html><head><title>比赛结果</title></head><body>
      <p>葡萄牙 2-1 对手，世界杯小组赛已经结束，最新积分如下。</p>
      <script>ignored()</script>
    </body></html>`,
  "葡萄牙 世界杯 比分");
  assert.match(pageText, /葡萄牙 2-1 对手/);
  assert.doesNotMatch(pageText, /ignored/);

  const enrichmentService = createChatSearchService({ fetchImpl, fetchPages: 1, maxResults: 5, pageChars: 1200 });
  const enriched = await enrichmentService.performWebSearch("世界杯 葡萄牙 比分");
  assert.equal(enriched.length, 1);
  assert.match(enriched[0].snippet, /比赛结果/);
  assert.match(enriched[0].snippet, /葡萄牙 2-1 对手/);
  assert.ok(enriched[0].snippet.length <= 1200);

  console.log("Chat search service checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
