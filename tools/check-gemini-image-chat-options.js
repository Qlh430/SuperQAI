"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "provider-protocol-engine.js"), "utf8");
const bodyStart = source.indexOf('if (kind === "gemini-content" || kind === "gemini-image")');
const bodyEnd = source.indexOf('if (kind === "openai-image-edit")', bodyStart);
const parseStart = source.indexOf('if (kind === "gemini-image")', bodyEnd);
const parseEnd = source.indexOf('if (kind === "openai-image")', parseStart);

assert.notEqual(bodyStart, -1, "Gemini request builder should exist");
assert.notEqual(bodyEnd, -1, "Gemini request builder boundary should exist");
assert.notEqual(parseStart, -1, "Gemini image parser should exist");
assert.notEqual(parseEnd, -1, "Gemini image parser boundary should exist");

const bodyBlock = source.slice(bodyStart, bodyEnd);
const parseBlock = source.slice(parseStart, parseEnd);
assert.match(bodyBlock, /responseModalities:\s*\["TEXT",\s*"IMAGE"\]/);
assert.match(bodyBlock, /input\.inputImages/);
assert.match(bodyBlock, /inlineData/);
assert.match(parseBlock, /inlineData/);
assert.match(parseBlock, /inline_data/);
assert.match(parseBlock, /fileData/);
assert.match(parseBlock, /file_data/);

console.log("Gemini image options checks passed.");
