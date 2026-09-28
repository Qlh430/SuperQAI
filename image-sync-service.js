const crypto = require("node:crypto");
const dns = require("node:dns").promises;
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const DEFAULT_MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const MAX_REDIRECTS = 5;

const IMAGE_SIGNATURES = Object.freeze([
  { extension: "png", mimeType: "image/png", matches: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { extension: "jpg", mimeType: "image/jpeg", matches: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  { extension: "gif", mimeType: "image/gif", matches: (buffer) => ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii")) },
  { extension: "webp", mimeType: "image/webp", matches: (buffer) => buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP" },
  { extension: "bmp", mimeType: "image/bmp", matches: (buffer) => buffer.subarray(0, 2).toString("ascii") === "BM" },
  { extension: "avif", mimeType: "image/avif", matches: (buffer) => buffer.subarray(4, 8).toString("ascii") === "ftyp" && ["avif", "avis"].includes(buffer.subarray(8, 12).toString("ascii")) },
]);

function validateImageBuffer(buffer, contentType = "") {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return { ok: false, reason: "empty_or_short" };
  const signature = IMAGE_SIGNATURES.find((entry) => entry.matches(buffer));
  if (!signature || /(?:text\/html|application\/(?:json|xml))/i.test(String(contentType || ""))) {
    return { ok: false, reason: "not_an_image" };
  }
  return { ok: true, extension: signature.extension, mimeType: signature.mimeType };
}

function createRemoteImageUrlValidator({ lookup = dns.lookup } = {}) {
  return async function validateRemoteImageUrl(value) {
    let parsed;
    try {
      parsed = new URL(String(value || ""));
    } catch {
      throw remoteImageUrlError("Remote image URL is invalid.");
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw remoteImageUrlError("Remote image URL must use HTTP or HTTPS.");
    }
    if (parsed.username || parsed.password) {
      throw remoteImageUrlError("Remote image URL credentials are not allowed.");
    }
    const expectedPort = parsed.protocol === "https:" ? "443" : "80";
    if (parsed.port && parsed.port !== expectedPort) {
      throw remoteImageUrlError("Remote image URL uses a disallowed port.");
    }
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
      throw remoteImageUrlError("Remote image URL resolves to a private or local address.");
    }
    const literalFamily = net.isIP(hostname);
    const addresses = literalFamily
      ? [{ address: hostname, family: literalFamily }]
      : await lookup(hostname, { all: true, verbatim: true });
    const normalizedAddresses = Array.isArray(addresses) ? addresses : [addresses];
    if (!normalizedAddresses.length || normalizedAddresses.some((item) => isPrivateNetworkAddress(item?.address))) {
      throw remoteImageUrlError("Remote image URL resolves to a private or local address.");
    }
    return parsed;
  };
}

function remoteImageUrlError(message) {
  const error = new Error(message);
  error.code = "remote_image_private_address";
  return error;
}

function isPrivateNetworkAddress(value) {
  const address = String(value || "").toLowerCase().split("%")[0];
  const family = net.isIP(address);
  if (family === 4) {
    const parts = address.split(".").map(Number);
    const [a, b] = parts;
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }
  if (family === 6) {
    if (address === "::" || address === "::1") return true;
    const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateNetworkAddress(mapped[1]);
    const mappedHex = address.match(/(?:^|:)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
      const high = Number.parseInt(mappedHex[1], 16);
      const low = Number.parseInt(mappedHex[2], 16);
      return isPrivateNetworkAddress(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
    }
    return /^(?:fc|fd|fe8|fe9|fea|feb)/.test(address)
      || address.startsWith("fec")
      || address.startsWith("fed")
      || address.startsWith("fee")
      || address.startsWith("fef")
      || address.startsWith("ff")
      || address.startsWith("2001:db8:");
  }
  return true;
}

function createImageSyncService({
  outputDir,
  fetchImpl = globalThis.fetch,
  delaysMs = [0, 250, 1000],
  fetchTimeoutMs = 180_000,
  maxImageBytes = DEFAULT_MAX_IMAGE_BYTES,
  validateRemoteUrl = null,
  inspectBuffer = null,
} = {}) {
  const resolvedOutputDir = path.resolve(String(outputDir || ""));
  if (!resolvedOutputDir) throw new Error("Image sync output directory is required.");
  if (typeof fetchImpl !== "function") throw new Error("Image sync fetch implementation is required.");
  const retryDelays = (Array.isArray(delaysMs) && delaysMs.length ? delaysMs : [0])
    .map((value) => Math.max(0, Number(value) || 0));
  const effectiveMaxImageBytes = Math.max(1, Number(maxImageBytes) || DEFAULT_MAX_IMAGE_BYTES);
  const fileWritePromises = new Map();
  fs.mkdirSync(resolvedOutputDir, { recursive: true });

  async function writeAtomically(buffer, extension, stableKey) {
    const safeExtension = String(extension || "png").replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
    const digest = crypto.createHash("sha256").update(String(stableKey || "")).digest("hex").slice(0, 32);
    const filename = `image_${digest}.${safeExtension}`;
    const finalPath = path.join(resolvedOutputDir, filename);
    if (fileWritePromises.has(finalPath)) return fileWritePromises.get(finalPath);
    const pending = writeFileOnce(buffer, filename, finalPath);
    fileWritePromises.set(finalPath, pending);
    try {
      return await pending;
    } finally {
      if (fileWritePromises.get(finalPath) === pending) fileWritePromises.delete(finalPath);
    }
  }

  async function writeFileOnce(buffer, filename, finalPath) {
    try {
      const existing = await fs.promises.readFile(finalPath);
      if (validateImageBuffer(existing).ok && existing.equals(buffer)) {
        return { filename, finalPath, url: `/output/${filename}`, created: false };
      }
      await fs.promises.rm(finalPath, { force: true });
    } catch {
      // A missing or invalid cached result is replaced atomically below.
    }
    const temporaryPath = `${finalPath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    let handle;
    try {
      handle = await fs.promises.open(temporaryPath, "wx");
      await handle.writeFile(buffer);
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.promises.rename(temporaryPath, finalPath);
    } catch (error) {
      await handle?.close().catch(() => {});
      await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
      throw error;
    }
    return { filename, finalPath, url: `/output/${filename}`, created: true };
  }

  async function fetchRemoteBuffer(sourceUrl, { signal, onAttempt } = {}) {
    let lastError;
    for (let index = 0; index < retryDelays.length; index += 1) {
      throwIfAborted(signal);
      if (retryDelays[index]) await abortableDelay(retryDelays[index], signal);
      try {
        const downloaded = await fetchRemoteImageWithDeadline(sourceUrl, {
          signal,
          fetchImpl,
          timeoutMs: fetchTimeoutMs,
          maxBytes: effectiveMaxImageBytes,
          validateRemoteUrl,
        });
        const validation = validateImageBuffer(downloaded.buffer, downloaded.contentType);
        if (!validation.ok) throw new Error(`Invalid image result: ${validation.reason}`);
        return { buffer: downloaded.buffer, validation };
      } catch (error) {
        if (signal?.aborted) throw signal.reason || error;
        if (error?.code === "remote_image_private_address") throw error;
        lastError = error;
        onAttempt?.({ attempt: index + 1, error, sourceUrl });
      }
    }
    throw lastError || new Error("Image download failed.");
  }

  async function syncItem(item, options = {}) {
    throwIfAborted(options.signal);
    const remoteUrl = getRemoteImageUrl(item);
    let buffer;
    let validation;
    if (item?.b64_json) {
      buffer = decodeBase64Image(item.b64_json);
      if (buffer.length > effectiveMaxImageBytes) {
        throw new Error(`Image payload exceeds ${effectiveMaxImageBytes} bytes.`);
      }
      validation = validateImageBuffer(buffer, "");
      if (!validation.ok) throw new Error(`Invalid image result: ${validation.reason}`);
    } else if (remoteUrl) {
      ({ buffer, validation } = await fetchRemoteBuffer(remoteUrl, options));
    } else {
      throw new Error("Generated image result has no image payload.");
    }
    const stableKey = remoteUrl || `base64:${crypto.createHash("sha256").update(buffer).digest("hex")}`;
    const file = await writeAtomically(buffer, validation.extension, stableKey);
    const dimensions = typeof inspectBuffer === "function" ? inspectBuffer(buffer) : null;
    return {
      file,
      item: {
        ...item,
        ...(remoteUrl && !item.url ? { remote_url: remoteUrl } : {}),
        local_url: file.url,
        ...(dimensions || {}),
      },
      saved: {
        filename: file.filename,
        url: file.url,
        ...(dimensions || {}),
      },
    };
  }

  async function syncResponse(source, options = {}) {
    throwIfAborted(options.signal);
    const items = Array.isArray(source?.data) ? source.data : [];
    if (!items.length) throw new Error("Generated image response contains no images.");
    const records = [];
    try {
      for (let index = 0; index < items.length; index += 1) {
        records.push(await syncItem(items[index], options));
      }
    } catch (error) {
      await Promise.all(records
        .filter((record) => record.file.created)
        .map((record) => fs.promises.rm(record.file.finalPath, { force: true }).catch(() => {})));
      throw error;
    }
    const data = records.map((record) => record.item);
    data.forEach((item, index) => {
      Object.assign(items[index], item);
    });
    return {
      ok: true,
      data,
      savedImages: records.map((record) => record.saved),
    };
  }

  async function recover(items, options = {}) {
    return syncResponse({ data: Array.isArray(items) ? items : [] }, options);
  }

  return Object.freeze({ syncResponse, recover, validateImageBuffer });
}

function getRemoteImageUrl(item) {
  for (const value of [item?.url, item?.remote_url, item?.local_url]) {
    if (/^https?:\/\//i.test(String(value || ""))) return String(value);
  }
  return "";
}

function decodeBase64Image(value) {
  const normalized = String(value || "").replace(/^data:[^;,]+;base64,/i, "").trim();
  return Buffer.from(normalized, "base64");
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason || new Error("The operation was aborted.");
}

function abortableDelay(delayMs, signal) {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason || new Error("The operation was aborted."));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function fetchRemoteImageWithDeadline(sourceUrl, {
  signal,
  fetchImpl,
  timeoutMs,
  maxBytes,
  validateRemoteUrl,
}) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason || new Error("The operation was aborted."));
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = Number(timeoutMs) > 0
    ? setTimeout(() => controller.abort(new Error("Image download timed out.")), Number(timeoutMs))
    : null;
  let currentUrl = String(sourceUrl || "");
  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      throwIfAborted(controller.signal);
      if (typeof validateRemoteUrl === "function") await validateRemoteUrl(currentUrl);
      const response = await fetchImpl(currentUrl, {
        signal: controller.signal,
        redirect: "manual",
        outbound: {
          mode: "auto",
          requestClass: "idempotent",
          purpose: "image-download",
          maxBytes,
        },
      });
      if (response?.status >= 300 && response?.status < 400) {
        const location = response.headers?.get?.("location") || "";
        if (!location) throw new Error("Image redirect has no location.");
        if (redirectCount >= MAX_REDIRECTS) throw new Error("Image download exceeded the redirect limit.");
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      if (!response?.ok) throw new Error(`Image download failed: ${Number(response?.status) || 0}`);
      const buffer = await readResponseBuffer(response, maxBytes, controller.signal);
      return {
        buffer,
        contentType: response.headers?.get?.("content-type") || "",
      };
    }
    throw new Error("Image download exceeded the redirect limit.");
  } catch (error) {
    if (signal?.aborted) throw signal.reason || error;
    if (controller.signal.aborted) throw controller.signal.reason || error;
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function readResponseBuffer(response, maxBytes, signal) {
  const declaredLength = Number(response.headers?.get?.("content-length") || 0);
  if (declaredLength > maxBytes) throw new Error(`Image download exceeds ${maxBytes} bytes.`);
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        throwIfAborted(signal);
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        total += chunk.length;
        if (total > maxBytes) throw new Error(`Image download exceeds ${maxBytes} bytes.`);
        chunks.push(chunk);
      }
    } finally {
      reader.releaseLock?.();
    }
    return Buffer.concat(chunks, total);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) throw new Error(`Image download exceeds ${maxBytes} bytes.`);
  return buffer;
}

module.exports = {
  DEFAULT_MAX_IMAGE_BYTES,
  createImageSyncService,
  createRemoteImageUrlValidator,
  isPrivateNetworkAddress,
  validateImageBuffer,
};
