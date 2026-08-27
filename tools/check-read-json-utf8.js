const assert = require("assert");
const { EventEmitter } = require("events");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SERVER_SOURCE = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf("function " + name + "(");
  assert.notStrictEqual(start, -1, "Missing function " + name);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error("Unterminated function " + name);
}

const context = { Buffer };
vm.runInNewContext(
  "const MAX_REQUEST_BYTES = 1024 * 1024; " + extractFunction(SERVER_SOURCE, "readJson") + "; this.readJson = readJson;",
  context,
);

(async () => {
  const source = { text: "椅子继续工作" };
  const bytes = Buffer.from(JSON.stringify(source), "utf8");
  const split = bytes.findIndex((byte) => byte >= 0x80) + 1;
  const request = new EventEmitter();
  request.destroy = () => {};
  const parsed = context.readJson(request);
  request.emit("data", bytes.subarray(0, split));
  request.emit("data", bytes.subarray(split));
  request.emit("end");

  assert.strictEqual((await parsed).text, source.text, "Fragmented UTF-8 request bodies should decode without replacement characters");
  console.log("JSON request UTF-8 checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
