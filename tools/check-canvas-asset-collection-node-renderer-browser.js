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
  const root = path.resolve(__dirname, "..");
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.setContent(`
      <!doctype html>
      <html>
        <body>
          <div id="canvasEditorScreen" data-canvas-theme="paper">
            <div id="canvasPlane"></div>
          </div>
          <input id="canvasNodeAssetInput" type="file" hidden>
        </body>
      </html>
    `);
    await page.addStyleTag({ path: path.join(root, "canvas-tokens.css") });
    await page.addStyleTag({ path: path.join(root, "styles.css") });
    await page.addStyleTag({ path: path.join(root, "canvas-bendo.css") });
    await page.addScriptTag({ path: path.join(root, "canvas-asset-collection-rules.js") });
    await page.addScriptTag({ path: path.join(root, "canvas-asset-collection-node-renderer.js") });

    const result = await page.evaluate(() => {
      const renderer = globalThis.CanvasAssetCollectionNodeRenderer;
      const plane = document.querySelector("#canvasPlane");
      const picker = document.querySelector("#canvasNodeAssetInput");
      const picked = [];
      picker.click = () => picked.push(picker.dataset.nodeId || "");

      function createNode(id) {
        const node = document.createElement("section");
        node.className = "canvas-node canvas-node-asset-collection";
        node.dataset.id = id;
        plane.append(node);
        return node;
      }

      function createPort(kind, options = {}) {
        const port = document.createElement("span");
        port.className = `canvas-port canvas-port-${kind}`;
        port.dataset.canvasPort = kind;
        if (options.handle) port.dataset.handle = options.handle;
        return port;
      }

      function createContext() {
        return {
          document,
          applyCanvasNodeSize() {},
          createCanvasNodeBar(label, options = {}) {
            const bar = document.createElement("div");
            bar.className = "canvas-node-bar";
            bar.textContent = label;
            bar.dataset.editable = String(Boolean(options.editable));
            return bar;
          },
          createCanvasPort: createPort,
          createCanvasResizeHandle() {
            const handle = document.createElement("span");
            handle.className = "canvas-resize-handle";
            return handle;
          },
          ensureCanvasNodeChrome(node) {
            const footer = document.createElement("div");
            footer.className = "canvas-node-footer";
            const status = document.createElement("span");
            status.className = "canvas-node-status";
            status.textContent = "等待素材";
            footer.append(status);
            node.querySelector(".canvas-resize-handle")?.before(footer);
          },
          fillCanvasAssetCollectionFromFile() {},
          hasCanvasNodeIncomingConnection: () => false,
          openPreview() {},
          registerCanvasDetailImage(image, source) {
            image.src = source;
          },
          removeCanvasAssetCollectionMember() {},
          scheduleCanvasConnectionRender() {},
          scheduleCanvasSave() {},
          selectCanvasNode() {},
          setCanvasAssetCollectionStatus(node) {
            const status = node.querySelector(".canvas-node-status");
            if (status) status.textContent = "已就绪 · 共 1 个素材";
          },
        };
      }

      const context = createContext();
      const imageMember = {
        id: "image-1",
        kind: "image",
        name: "封面.png",
        src: "/output/cover.png",
        savedUrl: "/output/cover.png",
        createdAt: "2026-09-24T00:00:00.000Z",
      };
      const videoMember = {
        id: "video-1",
        kind: "video",
        name: "镜头.mp4",
        src: "/output/shot.mp4",
        savedUrl: "/output/shot.mp4",
        mimeType: "video/mp4",
        createdAt: "2026-09-24T00:00:01.000Z",
      };
      const audioMember = {
        id: "audio-1",
        kind: "audio",
        name: "配音.mp3",
        src: "/output/voice.mp3",
        savedUrl: "/output/voice.mp3",
        mimeType: "audio/mpeg",
        createdAt: "2026-09-24T00:00:02.000Z",
      };

      const empty = createNode("empty");
      renderer.render(empty, { title: "素材", mode: "single", members: [] }, context);
      const emptyWidth = empty.getBoundingClientRect().width;

      const image = createNode("image");
      renderer.render(image, { title: "素材", mode: "single", members: [imageMember] }, context);

      const video = createNode("video");
      renderer.render(video, { title: "素材", mode: "single", members: [videoMember] }, context);
      video.querySelector(".canvas-assets-upload").click();

      const audio = createNode("audio");
      renderer.render(audio, { title: "素材", mode: "single", members: [audioMember] }, context);

      const collection = createNode("collection");
      renderer.render(collection, {
        title: "素材合集",
        mode: "collection",
        members: [imageMember, videoMember],
      }, context);

      return {
        picked,
        empty: {
          width: emptyWidth,
          height: empty.getBoundingClientRect().height,
          frameless: empty.classList.contains("canvas-node-frameless"),
          emptyState: Boolean(empty.querySelector(".canvas-assets-empty")),
          footer: Boolean(empty.querySelector(":scope > .canvas-node-footer")),
        },
        image: {
          frameless: image.classList.contains("canvas-node-frameless"),
          variant: image.classList.contains("canvas-node-asset-single-image"),
          picture: image.querySelector(".canvas-image-upload.has-image img")?.getAttribute("src"),
          footer: Boolean(image.querySelector(":scope > .canvas-node-footer")),
          memberPort: Boolean(image.querySelector(".canvas-assets-member-port")),
          barEditable: image.querySelector(".canvas-node-bar")?.dataset.editable,
          replaceOverlay: Boolean(image.querySelector(".canvas-assets-actions")),
          addButton: Boolean(image.querySelector(".canvas-assets-upload")),
        },
        video: {
          variant: video.classList.contains("canvas-node-asset-single-video"),
          mediaClass: video.classList.contains("canvas-node-media"),
          legacyVideoClass: video.classList.contains("canvas-node-video"),
          shell: Boolean(video.querySelector(".canvas-media-shell-video.has-media video")),
          previewLabel: video.querySelector(".canvas-media-preview-label")?.textContent,
          actions: [...video.querySelectorAll(".canvas-media-actions > *")].map((item) => item.textContent || item.className),
          actionsInBar: Boolean(video.querySelector(":scope > .canvas-node-bar .canvas-media-actions")),
          directActions: Boolean(video.querySelector(":scope > .canvas-media-actions")),
          status: video.querySelector(":scope > .canvas-node-status")?.textContent,
          footer: Boolean(video.querySelector(":scope > .canvas-node-footer")),
          source: video.dataset.videoSrc,
        },
        audio: {
          variant: audio.classList.contains("canvas-node-asset-single-audio"),
          mediaClass: audio.classList.contains("canvas-node-media"),
          legacyAudioClass: audio.classList.contains("canvas-node-audio"),
          shell: Boolean(audio.querySelector(".canvas-media-shell-audio.has-media audio")),
          previewLabel: audio.querySelector(".canvas-media-preview-label")?.textContent,
          actionsInBar: Boolean(audio.querySelector(":scope > .canvas-node-bar .canvas-media-actions")),
          directActions: Boolean(audio.querySelector(":scope > .canvas-media-actions")),
          source: audio.dataset.audioSrc,
        },
        collection: {
          frameless: collection.classList.contains("canvas-node-frameless"),
          items: collection.querySelectorAll(".canvas-assets-item").length,
          memberPorts: collection.querySelectorAll(".canvas-assets-member-port").length,
          footer: Boolean(collection.querySelector(":scope > .canvas-node-footer")),
        },
      };
    });

    assert.equal(result.empty.frameless, false);
    assert.equal(result.empty.emptyState, true);
    assert.equal(result.empty.footer, true);
    assert.equal(Math.round(result.empty.width), 292, "the empty material node keeps the standard node width");
    assert.ok(result.empty.height >= 280 && result.empty.height <= 286,
      `the empty material node keeps the standard node height, received ${result.empty.height}`);
    assert.equal(result.image.frameless, true);
    assert.equal(result.image.variant, true);
    assert.equal(result.image.picture, "/output/cover.png");
    assert.equal(result.image.footer, false, "a single picture uses the frameless picture-node shell");
    assert.equal(result.image.memberPort, false, "a single material exposes only the main output");
    assert.equal(result.image.barEditable, "true");
    assert.equal(result.image.replaceOverlay, false, "a single picture does not show the add-material overlay");
    assert.equal(result.image.addButton, false, "the toolbar replace action is the only picture replacement entry");
    assert.equal(result.video.variant, true);
    assert.equal(result.video.mediaClass, true);
    assert.equal(result.video.legacyVideoClass, false);
    assert.equal(result.video.shell, true);
    assert.equal(result.video.previewLabel, "视频预览");
    assert.equal(result.video.actionsInBar, true);
    assert.equal(result.video.directActions, false);
    assert.equal(result.video.status, "已就绪 · 共 1 个素材");
    assert.equal(result.video.footer, false, "a single media node keeps the legacy in-body status line");
    assert.equal(result.video.source, "/output/shot.mp4");
    assert.deepEqual(result.picked, ["video"], "the media add control keeps targeting the material picker");
    assert.equal(result.audio.variant, true);
    assert.equal(result.audio.mediaClass, true);
    assert.equal(result.audio.legacyAudioClass, false);
    assert.equal(result.audio.shell, true);
    assert.equal(result.audio.previewLabel, "音频预览");
    assert.equal(result.audio.actionsInBar, true);
    assert.equal(result.audio.directActions, false);
    assert.equal(result.audio.source, "/output/voice.mp3");
    assert.equal(result.collection.frameless, false);
    assert.equal(result.collection.items, 2);
    assert.equal(result.collection.memberPorts, 2);
    assert.equal(result.collection.footer, true);
    console.log("Canvas asset collection single-media renderer checks passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
