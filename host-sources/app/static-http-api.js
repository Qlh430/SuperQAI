"use strict";

const defaultFs = require("node:fs");
const path = require("node:path");

function requestPathname(req) {
  try {
    return new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`).pathname;
  } catch {
    return "/";
  }
}

function createStaticHttpApi({
  publicDir,
  outputDir,
  mimeTypes,
  authDisabled = false,
  getAuthDisabledUser,
  publicUser,
  requireAuth,
  assertOutputMediaRead,
  sendJson,
  sendAuthError,
  cacheMode = process.env.AI_OS_STATIC_CACHE_MODE || "production",
  fs = defaultFs,
} = {}) {
  for (const [name, dependency] of Object.entries({
    publicDir,
    outputDir,
    mimeTypes,
    getAuthDisabledUser,
    publicUser,
    requireAuth,
    assertOutputMediaRead,
    sendJson,
    sendAuthError,
  })) {
    if (!dependency) throw new TypeError(`Static HTTP API requires ${name}.`);
  }

  const resolvedPublicDir = path.resolve(publicDir);
  const resolvedOutputDir = path.resolve(outputDir);
  const developmentCache = String(cacheMode || "").toLowerCase() === "development";

  function resolveOutputPath(urlPath) {
    let relative;
    try {
      relative = decodeURIComponent(String(urlPath || "").replace(/^\/output\//, "")).replace(/\\/g, "/");
    } catch {
      return "";
    }
    const filePath = path.resolve(resolvedOutputDir, relative);
    const prefix = `${resolvedOutputDir}${path.sep}`;
    if (!filePath.startsWith(prefix)) return "";
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return filePath;
    } catch {
      return "";
    }

    // Older canvas records stored the provider filename directly, while the
    // synchronized image writer now appends a timestamp and content suffix.
    // Resolve that legacy basename on demand so existing boards keep working.
    if (relative.includes("/") || !relative) return "";
    const extension = path.extname(relative);
    const basename = path.basename(relative, extension);
    if (!basename || !extension) return "";
    let matches;
    try {
      matches = fs.readdirSync(resolvedOutputDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => name.startsWith(`${basename}_`) && path.extname(name).toLowerCase() === extension.toLowerCase())
        .map((name) => {
          const candidate = path.join(resolvedOutputDir, name);
          return { candidate, mtimeMs: fs.statSync(candidate).mtimeMs };
        })
        .sort((left, right) => right.mtimeMs - left.mtimeMs);
    } catch {
      return "";
    }
    return matches[0]?.candidate || "";
  }

  function serveFile(req, res, filePath, stats, headers) {
    const total = stats.size;
    const rangeHeader = String(req?.headers?.range || "");
    const ifRange = String(req?.headers?.["if-range"] || "");
    const modified = Math.floor(stats.mtimeMs / 1000) * 1000;
    // Weak ETags cannot validate If-Range. A mismatch requests the whole file.
    const rangeAllowed = !ifRange || (!ifRange.startsWith('"') && !ifRange.startsWith('W/')
      && Date.parse(ifRange) >= modified);
    const match = rangeAllowed ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader) : null;
    let start = 0;
    let end = total - 1;
    let partial = false;
    if (match && (match[1] || match[2])) {
      partial = true;
      if (match[1]) {
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), end) : end;
      } else {
        const suffix = Number(match[2]);
        start = suffix > 0 ? Math.max(0, total - suffix) : total;
      }
      if (total === 0 || start >= total || end < start) {
        res.writeHead(416, { ...headers, "Accept-Ranges": "bytes", "Content-Range": `bytes */${total}`, "Content-Length": 0 });
        res.end();
        return;
      }
    }
    res.writeHead(partial ? 206 : 200, {
      ...headers,
      "Accept-Ranges": "bytes",
      "Content-Length": partial ? end - start + 1 : total,
      ...(partial ? { "Content-Range": `bytes ${start}-${end}/${total}` } : {}),
    });
    if (total === 0) { res.end(); return; }
    const stream = fs.createReadStream(filePath, { start, end });
    stream.on("error", () => res.destroy());
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  }

  function serveOutput(urlPath, res, req = {}) {
    const filePath = resolveOutputPath(urlPath);
    if (!filePath) {
      sendJson(res, 403, { error: "Forbidden" });
      return;
    }

    fs.stat(filePath, (error, stats) => {
      if (error || !stats.isFile()) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      const ext = path.extname(filePath);
      serveFile(req, res, filePath, stats, {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
      });
    });
  }

  function serveStatic(req, res) {
    let cleanPath;
    try {
      cleanPath = decodeURIComponent(requestPathname(req));
    } catch {
      sendJson(res, 400, { error: "Invalid URL" });
      return;
    }
    if (cleanPath.startsWith("/output/")) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    if (cleanPath.startsWith("/data/") || cleanPath.startsWith("/tmp/") || cleanPath.startsWith("/.") || cleanPath === "/server.js") {
      sendJson(res, 403, { error: "Forbidden" });
      return;
    }

    const requestedPath = cleanPath === "/" ? "/index.html" : cleanPath;
    const filePath = path.normalize(path.join(resolvedPublicDir, requestedPath));
    if (!filePath.startsWith(resolvedPublicDir)) {
      sendJson(res, 403, { error: "Forbidden" });
      return;
    }

    fs.stat(filePath, (statError, stats) => {
      if (statError || !stats.isFile()) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }

      const ext = path.extname(filePath);
      // The HTML entry point must always be fresh. Scripts and stylesheets are
      // revalidated with ETag/Last-Modified instead of being downloaded again
      // on every launch; development mode keeps the old no-store behavior so
      // an edit is visible as soon as the renderer reloads.
      const isHtml = ext === ".html";
      const isCode = ext === ".js" || ext === ".css";
      const cacheControl = isHtml || (developmentCache && isCode)
        ? "no-store, max-age=0"
        : "no-cache";
      const etag = `W/"${stats.size.toString(16)}-${Math.round(stats.mtimeMs).toString(16)}"`;
      const lastModified = stats.mtime.toUTCString();
      const ifNoneMatch = String(req.headers["if-none-match"] || "");
      const ifModifiedSince = Date.parse(String(req.headers["if-modified-since"] || ""));
      const unchanged = ifNoneMatch
        ? ifNoneMatch.split(",").some((tag) => tag.trim() === etag)
        : Number.isFinite(ifModifiedSince)
          && Math.floor(stats.mtimeMs / 1000) * 1000 <= ifModifiedSince;

      if (unchanged) {
        res.writeHead(304, {
          "Cache-Control": cacheControl,
          ETag: etag,
          "Last-Modified": lastModified,
        });
        res.end();
        return;
      }

      if (/^(video|audio)\//.test(mimeTypes[ext] || "")) {
        serveFile(req, res, filePath, stats, {
          "Content-Type": mimeTypes[ext],
          "Cache-Control": cacheControl,
          ETag: etag,
          "Last-Modified": lastModified,
        });
        return;
      }

      fs.readFile(filePath, (error, content) => {
        if (error) {
          sendJson(res, 404, { error: "Not found" });
          return;
        }
        res.writeHead(200, {
          "Content-Type": mimeTypes[ext] || "application/octet-stream",
          "Cache-Control": cacheControl,
          ETag: etag,
          "Last-Modified": lastModified,
        });
        res.end(content);
      });
    });
  }

  async function handlePublic(req, res) {
    const requestPath = requestPathname(req);
    if (!requestPath.startsWith("/output/")) return false;
    try {
      const auth = authDisabled
        ? { user: publicUser(getAuthDisabledUser()), sessionId: "authentication-disabled" }
        : await requireAuth(req, res);
      if (!auth) return true;
      await assertOutputMediaRead(auth.user.id, requestPath);
      if (req.method !== "GET") {
        sendJson(res, 405, { error: "Method not allowed" });
        return true;
      }
      serveOutput(requestPath, res, req);
    } catch (error) {
      sendAuthError(res, error);
    }
    return true;
  }

  async function handle(req, res) {
    if (req?.method !== "GET") return false;
    const requestPath = requestPathname(req);
    if (requestPath.startsWith("/api/") || requestPath.startsWith("/output/")) return false;
    serveStatic(req, res);
    return true;
  }

  return Object.freeze({
    handle,
    publicHandle: handlePublic,
    resolveOutputPath,
    serveOutput,
    serveStatic,
  });
}

module.exports = { createStaticHttpApi };
