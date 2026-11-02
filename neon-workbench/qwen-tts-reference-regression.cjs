"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createQwenTtsReferenceReader } = require("./design-sources/qwen-tts-reference.cjs");

const AUTH = { user: { id: "reference-test-user" } };
const MAX_BYTES = 24 * 1024 * 1024;
function wav() {
  const data = Buffer.alloc(46);
  data.write("RIFF"); data.writeUInt32LE(38, 4); data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(16000, 24); data.writeUInt32LE(32000, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write("data", 36); data.writeUInt32LE(2, 40);
  return data;
}
function fixture(t, { acl, canonical, io = {} } = {}) {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "qwen-reference-"));
  t.after(() => fs.rmSync(outputDir, { recursive: true, force: true }));
  const calls = [];
  const trackedFs = { promises: {
    realpath: async (...args) => { calls.push("realpath"); return fs.promises.realpath(...args); },
    stat: async (...args) => { calls.push("stat"); return fs.promises.stat(...args); },
    readFile: async (...args) => { calls.push("read"); return fs.promises.readFile(...args); },
    ...io,
  } };
  const reader = createQwenTtsReferenceReader({ outputDir, fs: trackedFs,
    canonicalOutputMedia: canonical || (source => {
      calls.push("canonical");
      const filename = decodeURIComponent(source.slice(8));
      return { url: `/output/${encodeURIComponent(filename)}`, refId: `/output/${filename}` };
    }),
    assertOutputMediaRead: async (id, url) => {
      calls.push(`acl:${id}:${url}`);
      if (acl) return acl(id, url);
    },
  });
  return { outputDir, calls, reader, write(name, data = wav()) { fs.writeFileSync(path.join(outputDir, name), data); } };
}
const statusIs = status => error => error.statusCode === status && /[\u4e00-\u9fff]/.test(error.message);

test("authorized encoded WAV is read only after the asynchronous ACL resolves", async t => {
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const f = fixture(t, { acl: () => barrier });
  f.write("参考 声音.wav");
  const url = `/output/${encodeURIComponent("参考 声音.wav")}`;
  const pending = f.reader(AUTH, url);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.calls, ["canonical", `acl:${AUTH.user.id}:${url}`]);
  release();
  const result = await pending;
  assert.equal(result.filename, "参考 声音.wav");
  assert.equal(result.blob.type, "audio/wav");
  assert.deepEqual(Buffer.from(await result.blob.arrayBuffer()), wav());
  assert.ok(f.calls.indexOf("read") > f.calls.indexOf(`acl:${AUTH.user.id}:${url}`));
});

test("denied ACL retains its status and never reads a file", async t => {
  const denied = Object.assign(new Error("无权读取参考音频。"), { statusCode: 403, code: "forbidden" });
  const f = fixture(t, { acl: async () => { throw denied; } });
  f.write("sample.wav");
  await assert.rejects(f.reader(AUTH, "/output/sample.wav"), error => error === denied);
  assert.ok(!f.calls.includes("read"));
  assert.ok(!f.calls.includes("stat"));
});

test("missing authentication fails before resolving any media", async t => {
  const f = fixture(t);
  for (const auth of [undefined, {}, { user: {} }, { user: { id: "" } }]) {
    await assert.rejects(f.reader(auth, "/output/sample.wav"), statusIs(401));
  }
  assert.deepEqual(f.calls, []);
});

test("only flat local audio output URLs reach canonicalization", async t => {
  const f = fixture(t);
  for (const source of [undefined, {}, "https://example.com/a.wav", "//example.com/output/a.wav", "/output/a.wav?token=x", "/output/a.wav#x", "/output/sub/a.wav", "/output/../a.wav", "/output/%2e%2e%2fa.wav", "/output/%252e%252e%252fa.wav", "/output/a%2fb.wav", "/output/a%5cb.wav", "/output/a%3fb.wav", "/output/a%23b.wav", "/output/a%00.wav", "/output/a%.wav", "/output/a.png", "/output/C%3Aa.wav", "/output/a.wav\n"]) {
    await assert.rejects(f.reader(AUTH, source), statusIs(400), String(source));
  }
  assert.deepEqual(f.calls, []);
});

test("canonical helper must return a matching local media URL and reference", async t => {
  for (const canonical of [null, {}, { url: "https://example.com/a.wav", refId: "/output/a.wav" }, { url: "/output/a.wav", refId: "/output/b.wav" }]) {
    const f = fixture(t, { canonical: () => canonical });
    f.write("a.wav");
    await assert.rejects(f.reader(AUTH, "/output/a.wav"), statusIs(404));
    assert.ok(!f.calls.includes("read"));
    assert.ok(!f.calls.some(call => call.startsWith("acl:")));
  }
});

test("empty and oversized files fail before file contents are read", async t => {
  const f = fixture(t);
  f.write("empty.wav", Buffer.alloc(0));
  const handle = fs.openSync(path.join(f.outputDir, "large.wav"), "w");
  fs.ftruncateSync(handle, MAX_BYTES + 1); fs.closeSync(handle);
  await assert.rejects(f.reader(AUTH, "/output/empty.wav"), statusIs(400));
  await assert.rejects(f.reader(AUTH, "/output/large.wav"), statusIs(413));
  assert.ok(!f.calls.includes("read"));
});

test("realpath escaping output is rejected even if canonical helper approves", async t => {
  const outside = path.join(os.tmpdir(), "qwen-outside.wav");
  let f;
  f = fixture(t, { io: { realpath: async target => target === f.outputDir ? f.outputDir : outside } });
  f.write("escape.wav");
  await assert.rejects(f.reader(AUTH, "/output/escape.wav"), statusIs(400));
  assert.ok(!f.calls.includes("read"));
});

test("canonical URL cannot authorize a different file from the supplied source", async t => {
  const f = fixture(t, { canonical: () => ({ url: "/output/other.wav", refId: "/output/other.wav" }) });
  f.write("sample.wav"); f.write("other.wav");
  await assert.rejects(f.reader(AUTH, "/output/sample.wav"), statusIs(400));
  assert.ok(!f.calls.includes("read"));
});

test("directories and missing files return Chinese failures", async t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.outputDir, "folder.wav"));
  await assert.rejects(f.reader(AUTH, "/output/folder.wav"), statusIs(400));
  await assert.rejects(f.reader(AUTH, "/output/missing.wav"), statusIs(404));
  assert.ok(!f.calls.includes("read"));
});

test("file length is rechecked after read", async t => {
  for (const data of [Buffer.alloc(0), Buffer.alloc(MAX_BYTES + 1)]) {
    const f = fixture(t, { io: { readFile: async () => data } });
    f.write("sample.wav");
    await assert.rejects(f.reader(AUTH, "/output/sample.wav"), statusIs(data.length ? 413 : 400));
  }
});

test("supported audio signatures return accurate MIME types", async t => {
  const samples = [
    ["flac", "audio/flac", Buffer.from("fLaC\0\0\0\x22" + "\0".repeat(34), "binary")],
    ["mp3", "audio/mpeg", Buffer.from("ID3\x04\0\0\0\0\0\0", "binary")],
    ["ogg", "audio/ogg", Buffer.from("OggS\0" + "\0".repeat(22), "binary")],
    ["opus", "audio/ogg", Buffer.from("OggS\0" + "\0".repeat(22) + "OpusHead", "binary")],
    ["m4a", "audio/mp4", Buffer.from("\0\0\0\x18ftypM4A \0\0\0\0M4A isom", "binary")],
    ["aac", "audio/aac", Buffer.from([0xff, 0xf1, 0x50, 0x80, 0x01, 0x1f, 0xfc, 0])],
    ["webm", "audio/webm", Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x80, 0x18, 0x53, 0x80, 0x67])],
  ];
  const f = fixture(t);
  for (const [extension, mime, data] of samples) {
    f.write(`sample.${extension}`, data);
    const result = await f.reader(AUTH, `/output/sample.${extension}`);
    assert.equal(result.blob.type, mime);
    assert.deepEqual(Buffer.from(await result.blob.arrayBuffer()), data);
  }
});

test("HTML, JSON, truncated and mismatched audio cannot be uploaded as WAV", async t => {
  const f = fixture(t);
  for (const data of [Buffer.from("<html>not audio</html>"), Buffer.from('{"error":"denied"}'), Buffer.from("RIFF"), Buffer.from("fLaC" + "\0".repeat(40)), Buffer.from("not audio")]) {
    f.write("invalid.wav", data);
    await assert.rejects(f.reader(AUTH, "/output/invalid.wav"), statusIs(400));
  }
});
