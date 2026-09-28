"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

let playwright;
try {
  playwright = require(process.env.AI_OS_TEST_PLAYWRIGHT_MODULE || "playwright");
} catch {
  playwright = require(path.join(
    process.env.USERPROFILE || "",
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ));
}

(async () => {
  const executablePath = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    process.env.PLAYWRIGHT_CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find((candidate) => candidate && fs.existsSync(candidate));
  const browser = await playwright.chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <!doctype html>
      <html>
        <body>
          <input id="canvasNodeImageInput">
          <input id="canvasNodeVideoInput">
          <input id="canvasNodeAudioInput">
        </body>
      </html>
    `);
    await page.addScriptTag({
      path: path.resolve(__dirname, "..", "canvas-media-node-renderer.js"),
    });
    const result = await page.evaluate(() => {
      const renderer = globalThis.CanvasMediaNodeRenderer;
      const selections = [];
      const videoInput = document.querySelector("#canvasNodeVideoInput");
      videoInput.click = () => {
        videoInput.clicked = true;
      };
      const context = {
        document,
        applyCanvasNodeSize() {},
        createCanvasNodeBar(label, options = {}) {
          const bar = document.createElement("div");
          bar.className = "canvas-node-bar";
          bar.textContent = label;
          bar.dataset.editable = String(Boolean(options.editable));
          return bar;
        },
        createCanvasPort(kind) {
          const port = document.createElement("span");
          port.className = "canvas-port";
          port.dataset.kind = kind;
          return port;
        },
        createCanvasResizeHandle() {
          const handle = document.createElement("span");
          handle.className = "canvas-resize-handle";
          return handle;
        },
        hasCanvasNodeIncomingConnection: () => true,
        registerCanvasDetailImage(image, src) {
          image.src = src;
          image.dataset.registeredSrc = src;
        },
        scheduleCanvasConnectionRender() {},
        scheduleCanvasSave() {},
        selectCanvasNode(node) {
          selections.push(node.dataset.id);
        },
        uniqueCanvasImageName(_node, fallback) {
          return `${fallback}-1`;
        },
      };

      const upload = document.createElement("section");
      upload.dataset.id = "upload";
      renderer.renderUpload(upload, { src: "blob:upload", name: "照片" }, context);
      const uploadImage = upload.querySelector(".canvas-image-upload img");

      const emptyUpload = document.createElement("section");
      emptyUpload.dataset.id = "empty-upload";
      renderer.renderUpload(emptyUpload, { src: "", name: "" }, context);

      const video = document.createElement("section");
      video.dataset.id = "video";
      renderer.renderMedia(video, "video", { src: "", name: "" }, context);
      video.querySelector(".canvas-media-shell").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

      const audio = document.createElement("section");
      audio.dataset.id = "audio";
      renderer.renderMedia(audio, "audio", {
        src: "blob:audio",
        name: "旁白",
        mimeType: "audio/mpeg",
        duration: 12,
      }, context);

      return {
        selections,
        upload: {
          frameless: upload.classList.contains("canvas-node-frameless"),
          uploadOnly: upload.dataset.uploadOnly,
          imageSrc: uploadImage?.getAttribute("src"),
          registeredSrc: uploadImage?.dataset.registeredSrc,
          hasInputPort: Boolean(upload.querySelector('.canvas-port[data-kind="input"]')),
          barEditable: upload.querySelector(".canvas-node-bar")?.dataset.editable,
        },
        emptyUpload: {
          emptyState: Boolean(emptyUpload.querySelector(".canvas-media-empty")),
          emptyLabel: emptyUpload.querySelector(".canvas-media-empty span:last-child")?.textContent,
          barText: emptyUpload.querySelector(".canvas-node-bar")?.textContent,
          barEditable: emptyUpload.querySelector(".canvas-node-bar")?.dataset.editable,
        },
        video: {
          hasInputFileClicked: videoInput.clicked === true,
          classes: video.className,
          shellClass: video.querySelector(".canvas-media-shell")?.className,
          emptyLabel: video.querySelector(".canvas-media-empty span:last-child")?.textContent,
          actionsInBar: Boolean(video.querySelector(":scope > .canvas-node-bar .canvas-media-actions")),
          directActions: Boolean(video.querySelector(":scope > .canvas-media-actions")),
          status: video.querySelector(".canvas-node-status")?.textContent,
          selections: [...selections],
        },
        audio: {
          classes: audio.className,
          source: audio.dataset.audioSrc,
          duration: audio.dataset.mediaDuration,
          preview: Boolean(audio.querySelector("audio.canvas-audio-preview")),
          previewLabel: audio.querySelector(".canvas-media-preview-label")?.textContent,
          actionsInBar: Boolean(audio.querySelector(":scope > .canvas-node-bar .canvas-media-actions")),
          directActions: Boolean(audio.querySelector(":scope > .canvas-media-actions")),
          download: audio.querySelector(".canvas-media-actions a")?.download,
          status: audio.querySelector(".canvas-node-status")?.textContent,
        },
      };
    });

    assert.equal(result.upload.frameless, true);
    assert.equal(result.upload.uploadOnly, "true");
    assert.equal(result.upload.imageSrc, "blob:upload");
    assert.equal(result.upload.registeredSrc, "blob:upload");
    assert.equal(result.upload.hasInputPort, true);
    assert.equal(result.upload.barEditable, "true");
    assert.equal(result.emptyUpload.emptyState, true);
    assert.equal(result.emptyUpload.emptyLabel, "上传或拖入图片");
    assert.equal(result.emptyUpload.barText, "图片");
    assert.equal(result.emptyUpload.barEditable, "false");
    assert.equal(result.video.hasInputFileClicked, true);
    assert.match(result.video.classes, /canvas-node-media/);
    assert.match(result.video.classes, /canvas-node-media-video/);
    assert.match(result.video.shellClass, /canvas-media-shell-video/);
    assert.equal(result.video.emptyLabel, "上传或拖入视频");
    assert.equal(result.video.actionsInBar, true);
    assert.equal(result.video.directActions, false);
    assert.equal(result.video.status, "上传或连接媒体");
    assert.deepEqual(result.video.selections, ["video"]);
    assert.match(result.audio.classes, /canvas-node-media/);
    assert.match(result.audio.classes, /canvas-node-media-audio/);
    assert.equal(result.audio.source, "blob:audio");
    assert.equal(result.audio.duration, "12");
    assert.equal(result.audio.preview, true);
    assert.equal(result.audio.previewLabel, "音频预览");
    assert.equal(result.audio.actionsInBar, true);
    assert.equal(result.audio.directActions, false);
    assert.equal(result.audio.download, "旁白");
    assert.equal(result.audio.status, "已就绪 · 可预览和输出");
    console.log("Canvas media node renderer browser checks passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
