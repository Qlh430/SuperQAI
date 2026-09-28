"use strict";

const defaultCrypto = require("node:crypto");
const defaultFs = require("node:fs");
const path = require("node:path");

function createRunningHubOutpaintService({
  updateTask,
  imageReferenceToFile,
  fetchImpl,
  normalizeOutpaintPadding,
  outputDir,
  baseUrl,
  apiKey,
  workflowId,
  formatErrorMessage,
  crypto = defaultCrypto,
  fs = defaultFs,
  now = Date.now,
  setTimeoutFn = setTimeout,
} = {}) {
  for (const [name, dependency] of Object.entries({
    updateTask,
    imageReferenceToFile,
    fetchImpl,
    normalizeOutpaintPadding,
    outputDir,
    formatErrorMessage,
  })) {
    if (!dependency) throw new TypeError(`RunningHub outpaint service requires ${name}.`);
  }

  const endpointBase = String(baseUrl || "").replace(/\/+$/, "");
  const key = String(apiKey || "");
  const runningHubWorkflowId = String(workflowId || "").trim();

  function extensionFromContentType(contentType = "") {
    const value = String(contentType || "").toLowerCase();
    if (value.includes("jpeg") || value.includes("jpg")) return "jpg";
    if (value.includes("webp")) return "webp";
    if (value.includes("png")) return "png";
    if (value.includes("gif")) return "gif";
    return "";
  }

  function extensionFromUrl(url) {
    try {
      const extension = path.extname(new URL(url).pathname).replace(".", "").toLowerCase();
      return ["png", "jpg", "jpeg", "webp", "gif"].includes(extension)
        ? (extension === "jpeg" ? "jpg" : extension)
        : "";
    } catch {
      return "";
    }
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 60_000) {
    const timeoutSignal = AbortSignal.timeout(Math.max(1, Number(timeoutMs) || 60_000));
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;
    return fetchImpl(url, { ...options, signal });
  }

  function assertOk(response, data, fallback) {
    const code = data?.code;
    const okCode = code === undefined || code === 0 || code === "0" || code === 200 || code === "200";
    if (!response.ok || !okCode) {
      const codeText = String(code || "");
      const rawMessage = data?.msg || data?.message || data?.error || `${fallback}: ${response.status}`;
      const message = String(rawMessage || "");
      if (/TOKEN_INVALID|invalid token|api.?key/i.test(`${codeText} ${message}`)) {
        throw new Error("RunningHub API Key 无效或不是当前站点的 OpenAPI Key，请在 RunningHub 后台重新生成/复制 OpenAPI Key 后更新 .env。");
      }
      throw new Error(formatErrorMessage(message));
    }
  }

  async function postJson(endpoint, body, timeoutMs = 60_000) {
    const response = await fetchWithTimeout(`${endpointBase}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    }, timeoutMs);
    const data = await response.json().catch(() => ({}));
    assertOk(response, data, `RunningHub API failed: ${endpoint}`);
    return data;
  }

  async function uploadFile(blob, filename) {
    const form = new FormData();
    form.append("file", blob, filename || "image.png");
    const response = await fetchWithTimeout(`${endpointBase}/openapi/v2/media/upload/binary`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
      },
      body: form,
    }, 120_000);
    const data = await response.json().catch(() => ({}));
    assertOk(response, data, "RunningHub upload failed");

    const fileName = data?.data?.fileName || data?.data?.filename || data?.data?.name || data?.fileName || data?.filename;
    if (!fileName) throw new Error("RunningHub upload did not return fileName.");
    return { fileName, raw: data };
  }

  async function checkAccountStatus() {
    return postJson("/uc/openapi/accountStatus", {
      apikey: key,
    }, 30_000);
  }

  async function createTask(nodeInfoList) {
    const response = await postJson("/task/openapi/create", {
      apiKey: key,
      apikey: key,
      workflowId: runningHubWorkflowId,
      nodeInfoList,
    }, 60_000);
    const taskId = response?.data?.taskId
      || response?.data?.id
      || response?.taskId
      || response?.id
      || (typeof response?.data === "string" ? response.data : "");
    if (!taskId) throw new Error("RunningHub create task did not return taskId.");
    return String(taskId);
  }

  async function fetchOutputs(taskId) {
    const candidates = [
      "/task/openapi/outputs",
      "/task/openapi/output",
    ];
    let lastError = null;
    for (const endpoint of candidates) {
      try {
        return await postJson(endpoint, {
          apiKey: key,
          apikey: key,
          taskId,
        }, 60_000);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("RunningHub outputs request failed.");
  }

  async function waitForOutputs(taskId, onStatus = () => {}) {
    const maxPolls = 900;
    for (let index = 0; index < maxPolls; index += 1) {
      const statusData = await postJson("/task/openapi/status", {
        apiKey: key,
        apikey: key,
        taskId,
      }, 30_000);

      const statusText = String(
        statusData?.data?.taskStatus
        || statusData?.data?.status
        || statusData?.data?.state
        || statusData?.taskStatus
        || statusData?.status
        || statusData?.data
        || "",
      ).toUpperCase();
      if (/FAIL|ERROR|CANCEL/.test(statusText)) {
        throw new Error(formatErrorMessage(statusData?.msg || statusData?.message || `RunningHub task failed: ${statusText}`));
      }
      if (/SUCCESS|FINISH|COMPLETED|COMPLETE/.test(statusText)) {
        return fetchOutputs(taskId);
      }

      const progress = Math.min(92, 35 + Math.round((index / maxPolls) * 55));
      onStatus({ progress, message: "RunningHub 正在扩图，可能需要几分钟..." });
      await new Promise((resolve) => setTimeoutFn(resolve, 2_000));
    }
    throw new Error("RunningHub task timed out after 30 minutes.");
  }

  function extractImageUrls(value, urls = []) {
    if (!value) return urls;
    if (typeof value === "string") {
      if (/^https?:\/\/.+\.(png|jpe?g|webp)(\?.*)?$/i.test(value) && !urls.includes(value)) urls.push(value);
      return urls;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => extractImageUrls(item, urls));
      return urls;
    }
    if (typeof value !== "object") return urls;

    const direct = value.fileUrl || value.fileURL || value.url || value.imageUrl || value.imageURL || value.originUrl || value.outputUrl;
    if (typeof direct === "string" && /^https?:\/\//i.test(direct) && !urls.includes(direct)) urls.push(direct);
    Object.values(value).forEach((item) => extractImageUrls(item, urls));
    return urls;
  }

  async function saveOutputImages(data, prefix) {
    const urls = extractImageUrls(data);
    const saved = [];
    for (const [index, url] of urls.entries()) {
      const response = await fetchWithTimeout(url, {}, 120_000);
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") || "image/png";
      const extension = extensionFromContentType(contentType) || extensionFromUrl(url) || "png";
      const filename = `${prefix}${index + 1}_${crypto.randomBytes(4).toString("hex")}.${extension}`;
      fs.writeFileSync(path.join(outputDir, filename), Buffer.from(await response.arrayBuffer()));
      saved.push(`/output/${filename}`);
    }
    return saved;
  }

  async function runOutpaintTask(taskId, payload) {
    if (!key) {
      throw new Error("后端缺少 RUNNINGHUB_API_KEY，请先在 .env 里配置。");
    }

    updateTask(taskId, { status: "running", progress: 8, message: "正在验证 RunningHub API Key..." });
    await checkAccountStatus();

    updateTask(taskId, { progress: 10, message: "正在上传图片到 RunningHub..." });
    const image = await imageReferenceToFile(payload.image, payload.name || "runninghub_outpaint_input.png");
    const uploaded = await uploadFile(image.blob, image.filename);
    const padding = normalizeOutpaintPadding({ ...payload, direction: "custom" });
    const prompt = String(payload.prompt || "").trim()
      || "Extend the image naturally. Keep the original subject, scene, lighting, colors and perspective consistent.";

    updateTask(taskId, { progress: 24, message: "正在提交 RunningHub 扩图工作流..." });
    const nodeInfoList = [
      { nodeId: "141", fieldName: "image", fieldValue: uploaded.fileName },
      { nodeId: "237", fieldName: "left", fieldValue: String(padding.left) },
      { nodeId: "237", fieldName: "top", fieldValue: String(padding.top) },
      { nodeId: "237", fieldName: "right", fieldValue: String(padding.right) },
      { nodeId: "237", fieldName: "bottom", fieldValue: String(padding.bottom) },
      { nodeId: "142", fieldName: "text", fieldValue: prompt },
      { nodeId: "137", fieldName: "seed", fieldValue: String(Number(payload.seed || crypto.randomInt(1, 2147483647))) },
      { nodeId: "285", fieldName: "filename_prefix", fieldValue: `runninghub_outpaint_${now()}` },
    ];
    const runningHubTaskId = await createTask(nodeInfoList);

    updateTask(taskId, {
      progress: 35,
      message: "RunningHub 已接收任务，正在排队或运行...",
      runninghub_task_id: runningHubTaskId,
      padding,
    });

    const outputs = await waitForOutputs(runningHubTaskId, ({ progress, message }) => {
      updateTask(taskId, { progress, message });
    });
    updateTask(taskId, { progress: 94, message: "RunningHub 已完成，正在保存扩图结果..." });

    const images = await saveOutputImages(outputs, `runninghub_outpaint_${now()}_`);
    if (!images.length) throw new Error("RunningHub completed, but no output image was found.");

    updateTask(taskId, {
      status: "success",
      progress: 100,
      message: "RunningHub 扩图完成。",
      images,
      padding,
      runninghub: endpointBase,
    });
  }

  return Object.freeze({
    runOutpaintTask,
    checkAccountStatus,
    uploadFile,
    createTask,
    waitForOutputs,
    saveOutputImages,
    extractImageUrls,
  });
}

module.exports = { createRunningHubOutpaintService };
