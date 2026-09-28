"use strict";

const assert = require("node:assert/strict");
const ui = require("../canvas-llm-preset-ui.js");
const nodeRenderer = require("../canvas-llm-node-renderer.js");

assert.equal(typeof nodeRenderer.render, "function", "the LLM node renderer must expose render");

class FakeClassList {
  constructor(element) {
    this.element = element;
    this.tokens = new Set();
  }

  add(...tokens) {
    tokens.forEach((token) => this.tokens.add(token));
    this.sync();
  }

  remove(...tokens) {
    tokens.forEach((token) => this.tokens.delete(token));
    this.sync();
  }

  contains(token) {
    return this.tokens.has(token);
  }

  toggle(token, force) {
    const enabled = force === undefined ? !this.tokens.has(token) : Boolean(force);
    if (enabled) this.tokens.add(token);
    else this.tokens.delete(token);
    this.sync();
    return enabled;
  }

  sync() {
    this.element._className = [...this.tokens].join(" ");
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName || "").toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.attributes = Object.create(null);
    this.listeners = new Map();
    this.hidden = false;
    this.value = "";
    this.textContent = "";
    this.title = "";
    this.type = "";
    this._className = "";
    this.classList = new FakeClassList(this);
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this._className = String(value || "").trim();
    this.classList.tokens = new Set(this._className.split(/\s+/).filter(Boolean));
  }

  set innerHTML(value) {
    if (value !== "") throw new Error("FakeElement only supports clearing innerHTML.");
    this.children.forEach((child) => {
      child.parentElement = null;
    });
    this.children = [];
  }

  append(...nodes) {
    nodes.filter(Boolean).forEach((node) => {
      node.parentElement = this;
      this.children.push(node);
    });
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event) {
    const payload = event || {};
    payload.target = payload.target || this;
    payload.type = payload.type || "event";
    (this.listeners.get(payload.type) || []).forEach((listener) => listener(payload));
    return true;
  }

  click() {
    return this.dispatchEvent({
      type: "click",
      stopPropagation() {
        this.propagationStopped = true;
      },
    });
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  focus() {
    this.focused = true;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const className = String(selector || "").startsWith(".")
      ? String(selector).slice(1)
      : "";
    const visit = (element) => {
      element.children.forEach((child) => {
        if (className && child.classList.contains(className)) matches.push(child);
        visit(child);
      });
    };
    visit(this);
    return matches;
  }
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName);
  }
}

function createClock() {
  let nextId = 1;
  const timers = new Map();
  return {
    setTimeout(callback, delay) {
      const id = nextId++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    timers,
  };
}

const document = new FakeDocument();
const clock = createClock();
const list = document.createElement("div");
list.append(Object.assign(document.createElement("button"), { className: "canvas-llm-preset-add" }));
const applied = [];
const deleted = [];
const statuses = [];

ui.renderPresetChips({
  document,
  list,
  presets: [
    { label: "默认", text: "default prompt", source: "default" },
    { label: "自定义", text: "custom prompt", source: "custom" },
  ],
  onApply: (preset) => applied.push(preset.label),
  onDelete: (preset) => deleted.push(preset.label),
  onStatus: (message) => statuses.push(message),
  confirmDelay: 500,
  setTimeout: clock.setTimeout,
  clearTimeout: clock.clearTimeout,
});

assert.equal(list.children.length, 3, "two chips and the add toggle should remain");
assert.equal(list.children.at(-1).classList.contains("canvas-llm-preset-add"), true);
const firstItem = list.children[0];
firstItem.querySelector(".canvas-llm-preset-chip").click();
assert.deepEqual(applied, ["默认"]);

const firstDelete = firstItem.querySelector(".canvas-llm-preset-delete");
firstDelete.click();
assert.equal(firstItem.classList.contains("is-confirming"), true);
assert.equal(firstDelete.textContent, "确认");
assert.equal(clock.timers.size, 1);
firstDelete.click();
assert.deepEqual(deleted, ["默认"]);
assert.equal(clock.timers.size, 0);

const saves = [];
const editor = ui.createPresetEditor({
  document,
  onStatus: (message) => statuses.push(message),
  onSave: (preset) => saves.push(preset),
});
const save = editor.querySelector(".canvas-llm-preset-save");
const nameInput = editor.querySelector(".canvas-llm-preset-name");
const textInput = editor.querySelector(".canvas-llm-preset-text");
save.click();
assert.equal(saves.length, 0);
assert.equal(statuses.at(-1), "请先填写标签名和预设提示词。");

nameInput.value = "  镜头  ";
textInput.value = "  缓慢推近  ";
save.click();
assert.deepEqual(saves, [{ label: "镜头", text: "缓慢推近" }]);
assert.equal(nameInput.value, "");
assert.equal(textInput.value, "");

let resetCount = 0;
const bar = ui.createPresetBar({
  document,
  renderList: (target) => target.append(document.createElement("span")),
  resetDeleteConfirm: () => {
    resetCount += 1;
  },
  createEditor: () => editor,
});
const barToggle = bar.querySelector(".canvas-llm-preset-add");
editor.hidden = true;
barToggle.click();
assert.equal(editor.hidden, false);
assert.equal(barToggle.classList.contains("is-open"), true);
assert.equal(bar.classList.contains("is-editing"), true);
assert.equal(resetCount, 1);
assert.equal(nameInput.focused, true);

console.log("Canvas LLM preset UI checks passed.");
