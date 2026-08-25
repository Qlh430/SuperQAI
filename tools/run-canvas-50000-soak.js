const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createCanvasRepository } = require("../canvas-repository");
const {
  BOARD_ID,
  DATABASE_FILE,
  MANIFEST_FILE,
  PRESSURE_ROOT,
  generateFixture,
  removePressureRoot,
} = require("./generate-canvas-50000-fixture");
const METRICS_FILE = path.join(PRESSURE_ROOT, "performance.json");

function percentile(values, percentileValue) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1);
  return Number(sorted[index].toFixed(2));
}

function readMinutes(argv) {
  const inline = argv.find((item) => item.startsWith("--minutes="));
  const separateIndex = argv.indexOf("--minutes");
  const value = inline ? inline.slice("--minutes=".length) : argv[separateIndex + 1];
  const minutes = value === undefined ? 10 : Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) throw new Error("Soak minutes must be a positive number.");
  return minutes;
}

function average(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

async function runSoak({ minutes = readMinutes(process.argv.slice(2)) } = {}) {
  if (!fs.existsSync(MANIFEST_FILE) || !fs.existsSync(DATABASE_FILE)) await generateFixture();
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));
  const performanceMetrics = fs.existsSync(METRICS_FILE)
    ? JSON.parse(fs.readFileSync(METRICS_FILE, "utf8"))
    : null;
  const repository = createCanvasRepository({ dbPath: DATABASE_FILE, requestTimeoutMs: 30_000 });
  const durationMs = minutes * 60_000;
  const stableAfterMs = Math.min(60_000, durationMs * 0.2);
  const startedAt = Date.now();
  let nextReportAt = startedAt + 30_000;
  let iteration = 0;
  let mutation = 0;
  const latencies = [];
  const memorySamples = [];
  let blankNodeCount = 0;
  const viewports = [
    { left: -4_000, top: -2_200, right: 4_000, bottom: 2_200, scale: 1 },
    { left: 1_999_000, top: 1_999_000, right: 2_002_000, bottom: 2_002_000, scale: 0.2 },
    { left: -2_001_000, top: -2_001_000, right: -1_994_000, bottom: -1_994_000, scale: 0.12 },
    { left: -900_001_000, top: -900_001_000, right: -891_000_000, bottom: -891_000_000, scale: 0.08 },
    { left: 999_999_000, top: 999_999_000, right: 1_000_001_000, bottom: 1_000_001_000, scale: 1 },
    { left: -1_000_001_000, top: -1_000_001_000, right: -999_999_000, bottom: -999_999_000, scale: 1 },
  ];
  try {
    await repository.ready();
    assert.equal(manifest.nodeCount, 50_000);
    assert.equal(manifest.connectionCount, 100_000);
    while (Date.now() - startedAt < durationMs) {
      const viewport = viewports[iteration % viewports.length];
      const queryStartedAt = process.hrtime.bigint();
      const page = await repository.queryViewport({
        boardId: BOARD_ID,
        ...viewport,
        nodeLimit: 800,
        connectionLimit: 1_200,
      });
      latencies.push(Number(process.hrtime.bigint() - queryStartedAt) / 1e6);
      blankNodeCount += page.nodes.filter((node) => !node.id || !node.kind).length;
      assert.ok(page.nodes.length <= 800);
      assert.ok(page.connections.length <= 1_200);
      if (iteration % 60 === 0) {
        const meta = await repository.getBoardMeta(BOARD_ID);
        const operationId = `soak-${startedAt}-${mutation}`;
        const update = await repository.applyOperations({
          boardId: BOARD_ID,
          baseRevision: meta.revision,
          operations: [{
            operationId,
            type: "node.upsert",
            entityId: "node-0",
            after: { id: "node-0", kind: "text", text: `soak mutation ${mutation}` },
          }],
        });
        assert.equal(update.results[0].status, "applied");
        const duplicate = await repository.applyOperations({
          boardId: BOARD_ID,
          baseRevision: update.boardRevision,
          operations: [{
            operationId,
            type: "node.upsert",
            entityId: "node-0",
            after: { id: "node-0", kind: "text", text: `soak mutation ${mutation}` },
          }],
        });
        assert.equal(duplicate.results[0].status, "duplicate");
        mutation += 1;
      }
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs >= stableAfterMs) {
        memorySamples.push({ elapsedMs, rssMB: process.memoryUsage().rss / 1024 / 1024 });
      }
      iteration += 1;
      if (Date.now() >= nextReportAt) {
        console.log(`soak ${Math.floor(elapsedMs / 1000)}s/${Math.round(durationMs / 1000)}s, iterations=${iteration}, rss=${process.memoryUsage().rss / 1024 / 1024 | 0}MB`);
        nextReportAt += 30_000;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const windowSize = Math.max(1, Math.min(20, Math.floor(memorySamples.length / 2)));
    const initialRssMB = average(memorySamples.slice(0, windowSize).map((item) => item.rssMB));
    const finalRssMB = average(memorySamples.slice(-windowSize).map((item) => item.rssMB));
    const memoryGrowthPercent = initialRssMB > 0
      ? ((finalRssMB - initialRssMB) / initialRssMB) * 100
      : 0;
    const meta = await repository.getBoardMeta(BOARD_ID);
    assert.equal(meta.nodeCount, 50_000);
    assert.equal(meta.connectionCount, 100_000);
    assert.deepEqual(await repository.quickCheck(), { ok: true, result: "ok" });
    const metrics = {
      minutes,
      elapsedMs: Date.now() - startedAt,
      iterations: iteration,
      mutations: mutation,
      queryP95Ms: percentile(latencies, 0.95),
      queryP99Ms: percentile(latencies, 0.99),
      maximumQueryMs: Number(Math.max(...latencies).toFixed(2)),
      initialStableRssMB: Number(initialRssMB.toFixed(2)),
      finalStableRssMB: Number(finalRssMB.toFixed(2)),
      memoryGrowthPercent: Number(memoryGrowthPercent.toFixed(2)),
      blankNodeCount,
      nodeCount: meta.nodeCount,
      connectionCount: meta.connectionCount,
    };
    assert.ok(metrics.queryP95Ms <= 75, JSON.stringify(metrics));
    assert.ok(metrics.memoryGrowthPercent <= 15, JSON.stringify(metrics));
    assert.equal(metrics.blankNodeCount, 0, JSON.stringify(metrics));
    console.log(`Canvas 50,000 soak checks passed: ${JSON.stringify({ performance: performanceMetrics, soak: metrics })}`);
    return metrics;
  } finally {
    await repository.close().catch(() => {});
    removePressureRoot();
    assert.equal(fs.existsSync(PRESSURE_ROOT), false, "pressure-test canvas directory was not removed");
    console.log(`Pressure-test canvas data removed: ${path.relative(path.join(__dirname, ".."), PRESSURE_ROOT)}`);
  }
}

if (require.main === module) {
  runSoak().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { readMinutes, runSoak };
