"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createWindowManager } = require("../desktop-window-manager");

{
  const browser = {};
  browser.globalThis = browser;
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "..", "desktop-window-manager.js"), "utf8"), browser);
  assert.equal(browser.AiOsWindowManager.createWindowManager, browser.DesktopWindowManager.createWindowManager, "browser UMD exposes the shell name and preserves the legacy alias");
}

function createStorage(seed) {
  const values = new Map(Object.entries(seed || {}));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    dump(key) {
      return values.get(key);
    }
  };
}

function createManager(options) {
  const events = [];
  const manager = createWindowManager({
    storage: options && options.storage,
    storageKey: (options && options.storageKey) || "desktop-layout:alice",
    viewport: (options && options.viewport) || { width: 1200, height: 800 },
    onChange(snapshot, event) {
      events.push({ snapshot, event });
    }
  });

  manager.registerApp({
    id: "notes",
    defaultSize: { width: 640, height: 440 },
    minSize: { width: 320, height: 240 }
  });
  manager.registerApp({
    id: "chat",
    defaultSize: { width: 500, height: 360 },
    multiInstance: true
  });
  return { manager, events };
}

{
  const { manager } = createManager();
  const first = manager.open("notes");
  assert.deepEqual(
    { x: first.x, y: first.y, width: first.width, height: first.height },
    { x: 280, y: 180, width: 640, height: 440 },
    "the first window is centered in the viewport"
  );

  const second = manager.open("chat");
  assert.deepEqual(
    { x: second.x, y: second.y },
    { x: 312, y: 212 },
    "each new window cascades from the initial placement"
  );
}

{
  const { manager } = createManager();
  const notes = manager.open("notes");
  manager.setBounds(notes.id, { x: 160, y: 120, width: 480, height: 360 });
  assert.deepEqual(
    { x: manager.getWindow(notes.id).x, y: manager.getWindow(notes.id).y, width: manager.getWindow(notes.id).width, height: manager.getWindow(notes.id).height },
    { x: 160, y: 120, width: 480, height: 360 },
    "setBounds atomically applies position and constrained size"
  );
}

{
  const { manager } = createManager();
  const notes = manager.open("notes");
  manager.open("chat");
  const reopened = manager.open("notes");
  assert.equal(reopened.id, notes.id, "single-instance apps reuse their existing window");
  assert.equal(manager.getSnapshot().windows.length, 2);
  assert.ok(reopened.zIndex > manager.getWindow("chat:1").zIndex, "opening reuses and focuses the window");

  const chatA = manager.open("chat");
  const chatB = manager.open("chat");
  assert.notEqual(chatA.id, chatB.id, "multi-instance apps create distinct windows");
}

{
  const { manager, events } = createManager();
  const notes = manager.open("notes");
  const chat = manager.open("chat");
  const beforeFocus = manager.getSnapshot();
  manager.focus(notes.id);
  const afterFocus = manager.getSnapshot();
  assert.ok(afterFocus.windows.find((window) => window.id === notes.id).zIndex > afterFocus.windows.find((window) => window.id === chat.id).zIndex);
  assert.notEqual(beforeFocus, afterFocus, "each change produces a new snapshot");
  assert.equal(events.at(-1).event.type, "focus");
  assert.throws(() => afterFocus.windows.push({}), TypeError, "snapshots are immutable");
}

{
  const { manager } = createManager();
  const notes = manager.open("notes");
  manager.move(notes.id, -20, 1000);
  assert.deepEqual(
    { x: manager.getWindow(notes.id).x, y: manager.getWindow(notes.id).y },
    { x: -20, y: 1000 },
    "window dragging can pass beyond the left and bottom viewport edges"
  );
  manager.move(notes.id, 1500, -700);
  assert.deepEqual(
    { x: manager.getWindow(notes.id).x, y: manager.getWindow(notes.id).y },
    { x: 1500, y: 0 },
    "window dragging can pass beyond the right edge but stops at the work-area top"
  );
  manager.resize(notes.id, 2000, 100);
  assert.deepEqual(
    { width: manager.getWindow(notes.id).width, height: manager.getWindow(notes.id).height },
    { width: 1200, height: 240 },
    "resizes honor minimums and viewport bounds"
  );
}

{
  const { manager } = createManager();
  const notes = manager.open("notes");
  manager.setBounds(notes.id, { x: -180, y: -50, width: 480, height: 360 });
  assert.deepEqual(
    { x: manager.getWindow(notes.id).x, y: manager.getWindow(notes.id).y },
    { x: -180, y: 0 },
    "setting bounds enforces only the top edge, not the side edges"
  );
  manager.maximize(notes.id);
  manager.restore(notes.id);
  assert.deepEqual(
    { x: manager.getWindow(notes.id).x, y: manager.getWindow(notes.id).y },
    { x: -180, y: 0 },
    "maximize and restore preserve the top-limited, left-overflowing position"
  );
  manager.move(notes.id, -180, 80);
  assert.equal(manager.getWindow(notes.id).y, 80, "a window at the top boundary can be dragged down again");
}

{
  for (const maximized of [false, true]) {
    const bounds = { x: -180, y: -120, width: 640, height: 440 };
    const layout = maximized
      ? { x: 0, y: 0, width: 1200, height: 800, restoreBounds: bounds }
      : bounds;
    const storage = createStorage({ "desktop-layout:alice": JSON.stringify({ windows: { notes: layout } }) });
    const { manager } = createManager({ storage });
    const notes = manager.open("notes");
    if (maximized) manager.restore(notes.id);
    assert.deepEqual(
      { x: manager.getWindow(notes.id).x, y: manager.getWindow(notes.id).y },
      { x: -180, y: 0 },
      "old saved layouts above the top are repaired without changing the horizontal position"
    );
    assert.equal(JSON.parse(storage.dump("desktop-layout:alice")).windows.notes.y, 0);
  }
}

{
  const storage = createStorage();
  const { manager } = createManager({ storage });
  const notes = manager.open("notes");
  manager.move(notes.id, -180, 700);
  manager.focus(notes.id, { reveal: true });
  assert.deepEqual(
    { x: manager.getWindow(notes.id).x, y: manager.getWindow(notes.id).y },
    { x: -180, y: 700 },
    "focusing a reachable partially offscreen window does not pull it inside the edges"
  );
  manager.setViewport({ width: 1100, height: 780 });
  assert.deepEqual(
    { x: manager.getWindow(notes.id).x, y: manager.getWindow(notes.id).y },
    { x: -180, y: 700 },
    "viewport updates do not clamp freely positioned windows"
  );
  manager.maximize(notes.id);
  manager.restore(notes.id);
  assert.deepEqual(
    { x: manager.getWindow(notes.id).x, y: manager.getWindow(notes.id).y },
    { x: -180, y: 700 },
    "restoring from maximized retains offscreen geometry"
  );
  manager.close(notes.id);
  const reopened = createManager({ storage }).manager.open("notes");
  assert.deepEqual(
    { x: reopened.x, y: reopened.y },
    { x: -180, y: 700 },
    "reachable offscreen layouts persist across closing and restarting"
  );
}

{
  for (const [x, y] of [[-900, 100], [1500, 100], [100, 1000]]) {
    const { manager } = createManager();
    const notes = manager.open("notes");
    manager.move(notes.id, x, y);
    manager.focus(notes.id);
    assert.deepEqual(
      { x: manager.getWindow(notes.id).x, y: manager.getWindow(notes.id).y },
      { x, y },
      "normal focus never snaps an offscreen window back"
    );
    manager.focus(notes.id, { reveal: true });
    const recovered = manager.getWindow(notes.id);
    assert.deepEqual(
      { x: recovered.x, y: recovered.y, width: recovered.width, height: recovered.height },
      { x: 280, y: 180, width: 640, height: 440 },
      "explicit reveal recovers an unreachable titlebar without resizing the window"
    );
    assert.equal(manager.isReachable(notes.id), true);
  }
}

{
  const storage = createStorage();
  const { manager } = createManager({ storage });
  const notes = manager.open("notes");
  manager.move(notes.id, 1800, 900);
  assert.equal(manager.isReachable(notes.id), false);
  assert.equal(manager.isReachable("missing"), false);
  const chat = manager.open("chat");
  assert.equal(manager.isReachable(chat.id), true, "new windows cannot cascade entirely offscreen");
  assert.deepEqual(
    { x: manager.getWindow(notes.id).x, y: manager.getWindow(notes.id).y },
    { x: 1800, y: 900 },
    "opening another app does not reposition the offscreen window"
  );
  manager.open("notes");
  assert.equal(manager.isReachable(notes.id), true, "reopening an existing app recovers it");
  manager.move(notes.id, -2000, 120);
  manager.close(notes.id);
  const restarted = createManager({ storage }).manager;
  const reopened = restarted.open("notes");
  assert.equal(restarted.isReachable(reopened.id), true, "fully offscreen saved layouts reopen within reach");
}

{
  const { manager } = createManager();
  const notes = manager.open("notes");
  manager.minimize(notes.id);
  assert.equal(manager.getWindow(notes.id).minimized, true);
  manager.restore(notes.id);
  assert.equal(manager.getWindow(notes.id).minimized, false, "restore returns minimized windows to the desktop");

  manager.move(notes.id, 100, 120);
  manager.maximize(notes.id);
  assert.deepEqual(
    { x: manager.getWindow(notes.id).x, y: manager.getWindow(notes.id).y, width: manager.getWindow(notes.id).width, height: manager.getWindow(notes.id).height },
    { x: 0, y: 0, width: 1200, height: 800 }
  );
  manager.toggleMaximize(notes.id);
  assert.deepEqual(
    { x: manager.getWindow(notes.id).x, y: manager.getWindow(notes.id).y, width: manager.getWindow(notes.id).width, height: manager.getWindow(notes.id).height, maximized: manager.getWindow(notes.id).maximized },
    { x: 100, y: 120, width: 640, height: 440, maximized: false },
    "maximize preserves geometry for restoration"
  );
}

{
  const storage = createStorage();
  const first = createManager({ storage, storageKey: "desktop-layout:alice" }).manager;
  const notes = first.open("notes");
  first.move(notes.id, 80, 70);
  first.maximize(notes.id);

  const second = createManager({ storage, storageKey: "desktop-layout:alice" }).manager;
  const restored = second.open("notes");
  assert.equal(restored.maximized, true, "layout is restored for the same account key");
  second.toggleMaximize(restored.id);
  assert.deepEqual(
    { x: second.getWindow(restored.id).x, y: second.getWindow(restored.id).y },
    { x: 80, y: 70 },
    "only pre-maximize geometry is retained for restoring the layout"
  );
  assert.deepEqual(
    Object.keys(JSON.parse(storage.dump("desktop-layout:alice")).windows.notes).sort(),
    ["height", "restoreBounds", "width", "x", "y"],
    "persistence stores geometry rather than runtime state"
  );

  const otherAccount = createManager({ storage, storageKey: "desktop-layout:bob" }).manager;
  const bobNotes = otherAccount.open("notes");
  assert.equal(bobNotes.x, 280, "account keys do not share saved layouts");
}

{
  const storage = createStorage({ "desktop-layout:alice": "{not valid json" });
  const { manager } = createManager({ storage });
  const notes = manager.open("notes");
  assert.equal(notes.x, 280, "corrupt persisted data falls back to the default layout");
}

{
  for (const windows of [
    null,
    [],
    { notes: null },
    { notes: "bad layout" },
    { notes: {} },
    { notes: { x: "bad", y: null, width: -5, height: 0 } },
    { notes: { x: 80, y: 70, width: 640, height: 440, restoreBounds: "bad" } }
  ]) {
    const storage = createStorage({ "desktop-layout:alice": JSON.stringify({ windows }) });
    const { manager } = createManager({ storage });
    const notes = manager.open("notes");
    assert.equal(notes.x, 280, "parseable but structurally corrupt layouts fall back safely");
  }
}

{
  const storage = createStorage();
  const { manager } = createManager({ storage });
  const notes = manager.open("notes");
  manager.move(notes.id, 80, 70);
  manager.close(notes.id);
  assert.equal(manager.getWindow(notes.id), null, "close removes the live window");
  const reopened = manager.open("notes");
  assert.deepEqual({ x: reopened.x, y: reopened.y }, { x: 80, y: 70 }, "close keeps the latest layout for reopening");
  manager.closeAll();
  assert.equal(manager.getSnapshot().windows.length, 0, "closeAll removes every live window");

  const restarted = createManager({ storage }).manager;
  const restored = restarted.open("notes");
  assert.deepEqual({ x: restored.x, y: restored.y }, { x: 80, y: 70 }, "closed layouts survive a manager restart");
}

{
  const { manager } = createManager({ viewport: { width: 700, height: 500 } });
  const notes = manager.open("notes");
  const chat = manager.open("chat");
  assert.equal(manager.getSnapshot().windows.length, 2, "small viewports retain every open window");
  assert.equal(chat.x, 0);
  assert.equal(chat.y, 0);
  assert.equal(chat.width, 700);
  assert.equal(chat.height, 500);
  assert.equal(manager.getWindow(notes.id).minimized, true, "opening a window temporarily hides the prior small-screen window");
}

{
  const { manager } = createManager();
  const notes = manager.open("notes");
  const firstChat = manager.open("chat");
  const secondChat = manager.open("chat");
  manager.move(notes.id, 90, 75);
  manager.minimize(firstChat.id);
  const before = manager.getSnapshot().windows.map(({ id, x, y, width, height, minimized, maximized }) => ({ id, x, y, width, height, minimized, maximized }));

  manager.setViewport({ width: 822, height: 500 });
  assert.deepEqual(
    manager.getSnapshot().windows.map((window) => window.id),
    [notes.id, firstChat.id, secondChat.id],
    "crossing into the scaled narrow layout must not discard window identities"
  );

  manager.setViewport({ width: 1200, height: 800 });
  const after = manager.getSnapshot().windows.map(({ id, x, y, width, height, minimized, maximized }) => ({ id, x, y, width, height, minimized, maximized }));
  assert.deepEqual(after, before, "100% -> 175% -> 100% restores every window and its original state");
}

{
  const { manager } = createManager();
  const notes = manager.open("notes");
  manager.move(notes.id, 100, 120);
  manager.setViewport({ width: 700, height: 500 });
  assert.deepEqual(
    { x: manager.getWindow(notes.id).x, y: manager.getWindow(notes.id).y, width: manager.getWindow(notes.id).width, height: manager.getWindow(notes.id).height, maximized: manager.getWindow(notes.id).maximized },
    { x: 0, y: 0, width: 700, height: 500, maximized: true },
    "crossing below 860px temporarily fills the small viewport"
  );
  manager.setViewport({ width: 1200, height: 800 });
  assert.deepEqual(
    { x: manager.getWindow(notes.id).x, y: manager.getWindow(notes.id).y, width: manager.getWindow(notes.id).width, height: manager.getWindow(notes.id).height, maximized: manager.getWindow(notes.id).maximized },
    { x: 100, y: 120, width: 640, height: 440, maximized: false },
    "returning to a desktop viewport restores the pre-small-screen geometry"
  );
}

{
  const storage = createStorage();
  const { manager } = createManager({ storage });
  const notes = manager.open("notes");
  manager.move(notes.id, 100, 120);
  manager.setViewport({ width: 700, height: 500 });
  manager.close(notes.id);
  manager.open("notes");
  manager.setViewport({ width: 1200, height: 800 });
  assert.deepEqual(
    { x: manager.getWindow(notes.id).x, y: manager.getWindow(notes.id).y, width: manager.getWindow(notes.id).width, height: manager.getWindow(notes.id).height },
    { x: 100, y: 120, width: 640, height: 440 },
    "closing and reopening on a small screen preserves the saved desktop geometry"
  );
}

console.log("Desktop window manager checks passed.");
