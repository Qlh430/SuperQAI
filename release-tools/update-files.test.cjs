"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  copyFileVerified,
  hashFile,
  removePathStrict,
} = require("../host-sources/app/desktop/update-files");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "AI OS 中文更新-"));
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function testChineseCopy() {
  const f = fixture();
  try {
    const source = path.join(f.root, "源文件.txt");
    const destination = path.join(f.root, "候选", "资源", "目标文件.txt");
    fs.writeFileSync(source, "AI OS v3.0.1 中文路径事务\n", "utf8");
    const expected = { size: fs.statSync(source).size, sha256: hashFile(source) };
    const result = copyFileVerified(source, destination, expected);
    assert.deepEqual(result, expected);
    assert.equal(fs.readFileSync(destination, "utf8"), fs.readFileSync(source, "utf8"));
    assert.throws(() => copyFileVerified(source, destination, { ...expected, sha256: "0".repeat(64) }), /hash does not match/);
  } finally {
    f.cleanup();
  }
}

function testChineseRemoval() {
  const f = fixture();
  try {
    const target = path.join(f.root, "候选", "旧组件", "文件.txt");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "旧内容", "utf8");
    removePathStrict(path.join(f.root, "候选", "旧组件"));
    assert.equal(fs.existsSync(path.join(f.root, "候选", "旧组件")), false);
    assert.doesNotThrow(() => removePathStrict(path.join(f.root, "候选", "不存在")));
  } finally {
    f.cleanup();
  }
}

function testSymlinkRefusal() {
  const f = fixture();
  try {
    const outside = path.join(f.root, "外部");
    const link = path.join(f.root, "候选链接");
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, "keep.txt"), "keep", "utf8");
    fs.symlinkSync(outside, link, "junction");
    assert.throws(() => removePathStrict(link), /must not follow links/);
    assert.equal(fs.existsSync(path.join(outside, "keep.txt")), true);
    fs.unlinkSync(link);
  } finally {
    f.cleanup();
  }
}

for (const [name, run] of [["中文路径复制校验", testChineseCopy], ["中文路径删除校验", testChineseRemoval], ["符号链接拒绝", testSymlinkRefusal]]) {
  run();
  console.log(`PASS ${name}`);
}
