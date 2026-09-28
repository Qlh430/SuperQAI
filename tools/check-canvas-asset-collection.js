"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Rules = require("../canvas-asset-collection-rules");

assert.equal(Rules.detectKind({ mimeType: "video/mp4" }), "video");
assert.equal(Rules.detectKind({ mimeType: "audio/mpeg" }), "audio");
assert.equal(Rules.detectKind({ mimeType: "image/png" }), "image");

const members = Rules.normalizeMembers([
  { id: "old", kind: "image", src: "/output/old.png", createdAt: "2026-09-23T00:00:00.000Z" },
  { id: "new", kind: "video", src: "/output/new.mp4", createdAt: "2026-09-23T00:00:01.000Z" },
]);
assert.deepEqual(members.map((member) => member.id), ["new", "old"]);
assert.equal(Rules.appendMember(members, {
  kind: "video",
  src: "/output/new.mp4",
  savedUrl: "/output/new.mp4",
}).length, 2);
assert.deepEqual(Rules.getOutput(members).assets.map((asset) => asset.kind), ["video", "image"]);
assert.equal(Rules.canConnect("audio", "image"), false);
assert.equal(Rules.canConnect("audio", "video-generator"), true);
assert.equal(Rules.canConnect("image", "asset-collection"), true);
assert.equal(Rules.canConnect("video", "asset-collection"), true);
assert.equal(Rules.canConnect("video", "image"), false);

// De-duplication keys on the source + address pair: the same generator must not
// push one result twice, while the very same file arriving from two different
// nodes stays two independent materials.
const sameSource = Rules.normalizeMembers([
  { id: "a", kind: "image", src: "/output/shared.png", sourceNodeId: "gen-1", createdAt: "2026-09-23T00:00:00.000Z" },
]);
assert.equal(Rules.appendMember(sameSource, {
  kind: "image", src: "/output/shared.png", sourceNodeId: "gen-1",
}).length, 1, "one source must not append its own result twice");
assert.equal(Rules.appendMember(sameSource, {
  kind: "image", src: "/output/shared.png", sourceNodeId: "gen-2",
}).length, 2, "two sources producing the same address stay separate materials");

// Stable ordering: newest first, ties keep their insertion order.
const ordered = Rules.normalizeMembers([
  { id: "first", kind: "image", src: "/output/1.png", createdAt: "2026-09-23T00:00:00.000Z" },
  { id: "second", kind: "video", src: "/output/2.mp4", createdAt: "2026-09-23T00:00:00.000Z" },
  { id: "third", kind: "audio", src: "/output/3.mp3", createdAt: "2026-09-23T00:00:02.000Z" },
]);
assert.deepEqual(ordered.map((member) => member.id), ["third", "first", "second"]);
assert.equal(Rules.normalizeMembers([
  { id: "no-source", kind: "image", src: "" },
]).length, 0, "members without a usable address are dropped");
assert.equal(Rules.detectKind({ name: "voice.mp3" }), "audio");
assert.equal(Rules.detectKind({ name: "clip.mov" }), "video");
assert.equal(Rules.detectKind({ name: "notes.txt" }), "");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
function assertContains(needle) {
  assert.ok(script.includes(needle), `script.js should contain ${needle}`);
}

assertContains("asset-collection");
assertContains("addCanvasAssetCollection");
assertContains("getCanvasAssetCollectionOutput");

console.log("canvas asset collection rules: ok");
