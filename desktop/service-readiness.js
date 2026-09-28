"use strict";

const http = require("node:http");

function requestServiceReady(localUrl, { timeoutMs = 1_500 } = {}) {
  return new Promise((resolve, reject) => {
    const readyUrl = new URL("/api/system/ready", localUrl);
    const request = http.get(readyUrl, { timeout: Math.max(100, Number(timeoutMs) || 1_500) }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        let body;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        } catch (error) {
          reject(error);
          return;
        }
        if (response.statusCode === 200 && body.ok === true) {
          resolve(body);
          return;
        }
        reject(new Error(`Readiness check returned ${response.statusCode}.`));
      });
    });
    request.once("timeout", () => request.destroy(new Error("Readiness check timed out.")));
    request.once("error", reject);
  });
}

async function waitForServiceReady({
  localUrl,
  timeoutMs = 30_000,
  requestTimeoutMs = 1_500,
  retryDelayMs = 300,
  isServiceRunning = () => true,
  getStoppedError = () => new Error("AI OS service stopped during startup."),
} = {}) {
  const deadline = Date.now() + Math.max(1, Number(timeoutMs) || 30_000);
  let lastError = null;
  while (Date.now() < deadline) {
    if (!isServiceRunning()) throw getStoppedError();
    try {
      return await requestServiceReady(localUrl, { timeoutMs: requestTimeoutMs });
    } catch (error) {
      lastError = error;
    }
    const remaining = deadline - Date.now();
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(Math.max(10, retryDelayMs), remaining)));
    }
  }
  throw lastError || new Error("AI OS service did not become ready.");
}

module.exports = { requestServiceReady, waitForServiceReady };
