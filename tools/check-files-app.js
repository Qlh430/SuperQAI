"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "account-management-ui.js"), "utf8");
const openCalls = [];
const previewCalls = [];
const listeners = new Map();
const windowRef = {
  AiOsDesktop: { openApp(appId, params) { openCalls.push({ appId, params }); } },
  AiOsMediaPreview: {
    openImage(payload) {
      previewCalls.push(payload);
      return true;
    },
  },
  addEventListener(type, handler) { listeners.set(type, handler); },
};
const documentRef = {
  querySelector() { return null; },
  querySelectorAll() { return []; },
};
const context = vm.createContext({
  window: windowRef,
  document: documentRef,
  console,
  fetch: async () => ({ ok: true, json: async () => ({}) }),
  navigator: {},
  setTimeout,
  clearTimeout,
});
vm.runInContext(source, context, { filename: "account-management-ui.js" });

const management = windowRef.AiOsManagement;
assert.ok(management, "file app exposes its management bridge");
assert.equal(
  JSON.stringify(management.summarizeResources([
    { resource: { id: "mine-canvas", type: "canvas", ownerUserId: "alice" }, access: { permission: "owner", locked: false } },
    { resource: { id: "shared-image", type: "image", ownerUserId: "bob" }, access: { permission: "read", locked: false } },
    { resource: { id: "locked-chat", type: "chat", ownerUserId: "bob" }, access: { permission: "read", locked: true } },
    { resource: { id: "mine-video", type: "video", ownerUserId: "alice" }, access: { permission: "owner", locked: false } },
    { resource: { id: "shared-audio", type: "audio", ownerUserId: "bob" }, access: { permission: "read", locked: false } },
  ], "alice")),
  JSON.stringify({ all: 5, owned: 2, shared: 3, canvas: 1, image: 1, video: 1, audio: 1, chat: 1 }),
  "resource summary separates owned and shared resources and counts types"
);

const resources = [
  { resource: { id: "mine", type: "image", ownerUserId: "alice" }, access: { permission: "owner", locked: false } },
  { resource: { id: "shared", type: "image", ownerUserId: "bob" }, access: { permission: "edit", locked: false } },
];
assert.deepEqual(management.filterResources(resources, "owned", "alice").map((entry) => entry.resource.id), ["mine"]);
assert.deepEqual(management.filterResources(resources, "shared", "alice").map((entry) => entry.resource.id), ["shared"]);
assert.deepEqual(management.filterResources(resources, "all", "alice").map((entry) => entry.resource.id), ["mine", "shared"]);
assert.deepEqual(management.filterResources([
  ...resources,
  { resource: { id: "video", type: "video", ownerUserId: "alice" } },
  { resource: { id: "audio", type: "audio", ownerUserId: "alice" } },
], "video", "alice").map((entry) => entry.resource.id), ["video"]);
assert.equal(typeof management.openAssetShareDialog, "function", "asset library can reuse the account-aware share dialog");

management.openResource({ resource: { id: "canvas-1", type: "canvas", title: "Board" }, access: { locked: false } });
management.openResource({ resource: { id: "chat-1", type: "chat", title: "Chat" }, access: { locked: false } });
management.openResource({
  resource: { id: "image-1", type: "image", title: "Image" },
  preview: { kind: "image", url: "/output/image-1.png" },
  access: { locked: false },
});
management.openResource({ resource: { id: "file-1", type: "file", title: "File" }, access: { locked: false } });
assert.equal(JSON.stringify(openCalls), JSON.stringify([
  { appId: "canvas", params: { resourceId: "canvas-1" } },
  { appId: "chat", params: { resourceId: "chat-1" } },
  { appId: "shared", params: { resourceId: "file-1" } },
]), "non-media resources pass their id to the matching desktop app");
assert.equal(JSON.stringify(previewCalls), JSON.stringify([
  { url: "/output/image-1.png", title: "Image" },
]), "image resources open in the shared media preview instead of the image generator");

const rendered = management.renderResourceCard({
  resource: { id: "shared-image", type: "image", title: "Shared" },
  access: { permission: "read", locked: false },
}, "alice");
assert.match(rendered, /data-open-resource="shared-image"/);
assert.doesNotMatch(rendered, /data-share-resource=/, "non-owners do not receive a share control");
const ownerRendered = management.renderResourceCard({
  resource: { id: "mine-image", type: "image", title: "Mine", ownerUserId: "alice" },
  access: { permission: "owner", locked: false },
}, "alice");
assert.match(ownerRendered, /data-share-resource="mine-image"/, "owners receive a share control");

console.log("Files app checks passed.");
