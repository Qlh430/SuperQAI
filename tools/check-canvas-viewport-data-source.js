const assert = require("node:assert/strict");
const { CanvasViewportDataSource } = require("../canvas-viewport-data-source");
const { ENGINE_VERSION } = require("../canvas-engine-contract");

function createDeferredResponse(marker, extra = {}) {
  let resolveRequest;
  return {
    start(url, options) {
      this.url = url;
      this.signal = options.signal;
      return new Promise((resolve) => {
        resolveRequest = () => resolve({
          ok: true,
          status: 200,
          json: async () => ({
            marker,
            engineVersion: ENGINE_VERSION,
            mode: "detail",
            boardRevision: 5,
            nodes: [],
            connections: [],
            ...extra,
          }),
        });
      });
    },
    resolve() {
      resolveRequest();
    },
  };
}

(async () => {
  const pages = [];
  const statuses = [];
  const firstResponse = createDeferredResponse("first");
  const secondResponse = createDeferredResponse("second");
  const responses = [firstResponse, secondResponse];
  let responseIndex = 0;
  const store = {
    boardRevision: 5,
    applyViewportPage(page) {
      pages.push(page);
      this.boardRevision = page.boardRevision;
    },
  };
  const source = new CanvasViewportDataSource({
    fetchImpl: (url, options) => responses[responseIndex++].start(url, options),
    store,
    endpointBase: "/api/canvas/boards",
    getBoardId: () => "board-1",
    overscanFactor: 1.5,
    onStatus: (status) => statuses.push(status),
  });
  const makeViewport = (left) => ({
    left,
    top: 0,
    right: left + 1000,
    bottom: 800,
    scale: 1,
  });

  const first = source.request(makeViewport(0));
  const second = source.request(makeViewport(1000));
  assert.equal(firstResponse.signal.aborted, true);
  secondResponse.resolve();
  await second;
  firstResponse.resolve();
  await first;
  assert.deepEqual(pages.map((page) => page.marker), ["second"]);
  assert.equal(pages[0].generation, "2");
  assert.ok(secondResponse.url.includes("generation=2"));
  assert.ok(statuses.some((status) => status.state === "aborted" && status.generation === "1"));

  let fetchCount = 0;
  const stablePages = [];
  const stableStore = {
    boardRevision: 8,
    applyViewportPage(page) {
      stablePages.push(page);
      this.boardRevision = page.boardRevision;
    },
  };
  const stableSource = new CanvasViewportDataSource({
    fetchImpl: async () => {
      fetchCount += 1;
      if (fetchCount === 2) return { ok: false, status: 503, json: async () => ({}) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          mode: "detail",
          engineVersion: ENGINE_VERSION,
          boardRevision: 8,
          nodes: [{ id: "kept", kind: "text", x: 0, y: 0 }],
          connections: [],
        }),
      };
    },
    store: stableStore,
    endpointBase: "/api/canvas/boards/",
    getBoardId: () => "board/with space",
    overscanFactor: 1.5,
    onStatus: (status) => statuses.push(status),
  });
  await stableSource.request(makeViewport(0));
  const skipped = await stableSource.request({
    left: 100,
    top: 100,
    right: 900,
    bottom: 700,
    scale: 1,
  });
  assert.equal(skipped.skipped, true);
  assert.equal(fetchCount, 1, "contained same-revision detail requests should reuse overscan");

  const skippedAcrossScale = await stableSource.request({
    left: 100,
    top: 100,
    right: 900,
    bottom: 700,
    scale: 0.11,
  });
  assert.equal(skippedAcrossScale.skipped, true);
  assert.equal(fetchCount, 1, "scale changes must not create a visible LOD request band");

  stableStore.boardRevision = 9;
  await assert.rejects(() => stableSource.request(makeViewport(0)), /503/);
  assert.equal(stablePages.length, 1, "failed requests must retain the existing page");
  assert.ok(statuses.some((status) => status.state === "error"));

  stableStore.boardRevision = 8;
  const staleSource = new CanvasViewportDataSource({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        mode: "lod",
        boardRevision: 8,
        nodes: [],
        connections: [],
        lodNodes: [{ id: "legacy-region" }],
        engineVersion: "canvas-semantic-zoom-v1",
      }),
    }),
    store: stableStore,
    getBoardId: () => "board-1",
    onStatus: (status) => statuses.push(status),
  });
  await assert.rejects(
    () => staleSource.request(makeViewport(0)),
    (error) => error?.code === "canvas_engine_version_mismatch",
  );
  assert.equal(stablePages.length, 1, "stale engine responses must retain the existing page");

  stableSource.cancel();
  stableSource.dispose();
  assert.equal(stableSource.disposed, true);

  console.log("Canvas viewport data source checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
