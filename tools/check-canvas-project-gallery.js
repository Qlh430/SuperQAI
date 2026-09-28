"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

[
  "canvas-gallery-sidebar",
  "canvasProjectList",
  "data-canvas-scope=\"all\"",
  "data-canvas-scope=\"shared\"",
  "全部画布",
  "协同文件",
  "renderCanvasProjectList",
  "promptCreateCanvasProject",
  "promptRenameCanvasProject",
  "promptMoveCanvasBoard",
  "canvasProjectMovePanel",
  "board.isOwner !== false",
  "/api/canvas/projects",
].forEach((needle) => assert.ok(script.includes(needle), `missing gallery integration: ${needle}`));
[
  ".canvas-gallery-shell",
  ".canvas-gallery-sidebar",
  ".canvas-gallery-project-item",
  ".canvas-gallery-project-action",
  ".canvas-project-select",
  ".canvas-board-project-badge",
].forEach((needle) => assert.ok(styles.includes(needle), `missing gallery style: ${needle}`));

console.log("Canvas project gallery checks passed.");
