const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { initializeSchema } = require("../canvas-schema");

const workerSource = fs.readFileSync(path.join(__dirname, "..", "canvas-db-worker.js"), "utf8");
assert.match(workerSource, /FROM node_spatial s\s+CROSS JOIN nodes n ON n\.pk = s\.pk/g);
assert.match(workerSource, /FROM connection_spatial s\s+CROSS JOIN connections c ON c\.pk = s\.pk/);

const database = new DatabaseSync(":memory:");
initializeSchema(database);

function assertSpatialFirst(sql, params) {
  const plan = database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params);
  assert.match(plan[0]?.detail || "", /SCAN s VIRTUAL TABLE INDEX/);
  assert.match(plan[1]?.detail || "", /SEARCH [nc] USING INTEGER PRIMARY KEY/);
  assert.equal(plan.some((item) => /USE TEMP B-TREE/.test(item.detail)), false);
}

assertSpatialFirst(`
  SELECT COUNT(*)
    FROM node_spatial s
    CROSS JOIN nodes n ON n.pk = s.pk
   WHERE s.max_x >= ? AND s.min_x <= ?
     AND s.max_y >= ? AND s.min_y <= ?
     AND n.board_pk = ?
     AND n.x + n.width >= ? AND n.x <= ?
     AND n.y + n.height >= ? AND n.y <= ?
`, [0, 1, 0, 1, 1, 0, 1, 0, 1]);

assertSpatialFirst(`
  SELECT c.*
    FROM connection_spatial s
    CROSS JOIN connections c ON c.pk = s.pk
   WHERE s.max_x >= ? AND s.min_x <= ?
     AND s.max_y >= ? AND s.min_y <= ?
     AND c.board_pk = ?
   LIMIT ?
`, [0, 1, 0, 1, 1, 1_201]);

database.close();
console.log("Canvas spatial query plan checks passed.");
