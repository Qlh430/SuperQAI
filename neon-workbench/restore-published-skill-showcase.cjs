"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publishedSource = "从私人 Skill 发布到本机公共库";

async function main() {
  const [id, mode, ...extra] = process.argv.slice(2);
  assert.match(id || "", /^[a-z0-9][a-z0-9-]{0,63}$/);
  assert.ok(!extra.length && (!mode || mode === "--apply"), "只接受 Skill ID 和可选的 --apply。");
  const { dailyPaths, runningBackend } = await import("./daily-workbench.mjs");
  await runningBackend(__dirname);
  const dataDir = path.join(dailyPaths(__dirname).portable, "data");
  const diagnostics = readJson(path.join(dataDir, ".logs/runtime-diagnostics.json"));
  const manifest = readJson(path.join(dataDir, "skill-installs.json"));
  const install = Object.hasOwn(manifest.packages, id) && manifest.packages[id];
  assert.ok(install?.scope === "public" && install.source === publishedSource, "不是通过私人库发布的公共 Skill。");

  const showcase = path.join(dataDir, "skill-showcase.json");
  const before = fs.readFileSync(showcase);
  if (Object.hasOwn(JSON.parse(before).presentations || {}, id) || install.publishedPresentation) {
    console.log(JSON.stringify({ id, status: "已有公共展示配置，未修改" }));
    return;
  }

  const db = new DatabaseSync(path.join(dataDir, "system.sqlite"), { readOnly: true });
  try {
    const events = db.prepare("SELECT actor_user_id, created_at FROM audit_events WHERE action = ? AND target_type = ? AND target_id = ?")
      .all("skill.personal_published", "skill", id).filter(event => {
        const elapsed = Date.parse(event.created_at) - Date.parse(install.installedAt);
        return elapsed >= 0 && elapsed <= 60_000;
      });
    assert.equal(events.length, 1, "无法唯一确认当前公共安装的原始发布记录。");
    const owner = events[0].actor_user_id;
    const { createSkillRegistry } = require(path.join(diagnostics.appRoot, "skill-registry.js"));
    const registry = createSkillRegistry({
      dataDir,
      systemDir: path.join(diagnostics.appRoot, "skills"),
      bundledCustomDir: path.join(diagnostics.appRoot, "bundled-skills"),
    });
    const { files } = registry.readPersonalSkillFiles(owner, id);
    const original = registry.getDetail(id, owner);
    assert.equal(original.scope, "personal");
    const { presentation } = original;
    assert.ok(Date.parse(presentation.updatedAt) <= Date.parse(install.installedAt) && presentation.media.length,
      "私人展示资料无法证明是发布时的版本，未恢复。");
    const publicRoot = path.join(registry.customDir, id);
    const rootStat = fs.lstatSync(publicRoot);
    assert.ok(rootStat.isDirectory() && !rootStat.isSymbolicLink());
    for (const { path: name, content } of files) {
      const parts = name.split("/");
      let target = publicRoot;
      for (const part of parts) {
        target = path.join(target, part);
        assert.ok(!fs.lstatSync(target).isSymbolicLink(), "公共包不能包含链接。");
      }
      assert.ok(fs.readFileSync(target).equals(content), "私人包与已发布包不一致，未恢复。");
    }

    const output = fs.realpathSync(path.join(dataDir, "output"));
    const authorizedUrls = new Set();
    for (const item of presentation.media) {
      for (const url of [item.url, item.posterUrl].filter(Boolean)) {
        assert.ok(url.startsWith("/output/"));
        const ref = decodeURIComponent(url);
        const segments = ref.slice("/output/".length).split("/");
        assert.ok(segments.every(segment => segment && segment !== "." && segment !== ".." && !/[\\:\0]/.test(segment)));
        assert.equal(url, `/output/${segments.map(encodeURIComponent).join("/")}`);
        const filename = fs.realpathSync(path.join(output, ...segments));
        assert.ok(filename.startsWith(output + path.sep) && fs.statSync(filename).isFile());
        // Saved showcase references remain valid after removing a bookmark from the asset library.
        const asset = db.prepare(`SELECT 1 FROM resources WHERE ref_type = ? AND ref_id = ?
          AND owner_user_id = ? AND deleted_at IS NULL`).get("output_media", ref, owner);
        assert.ok(asset, "原发布者不再拥有已登记的案例素材，未恢复。");
        authorizedUrls.add(url);
      }
    }

    if (mode !== "--apply") {
      console.log(JSON.stringify({ id, status: "核验通过，未写入", media: presentation.media.length }));
      return;
    }
    const backupDir = path.join(__dirname, "..", ".design", "deploy-backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const backup = path.join(backupDir, `skill-showcase-${Date.now()}-${crypto.randomUUID()}.json`);
    fs.copyFileSync(showcase, backup, fs.constants.COPYFILE_EXCL);
    assert.ok(fs.readFileSync(showcase).equals(before), "公共展示配置在核验期间发生变化，请重新核验。");
    const saved = registry.setPresentation(id, owner, presentation, { isAdmin: true, authorizedUrls, scope: "public" });
    assert.deepEqual(saved.media, presentation.media);
    assert.equal(saved.coverId, presentation.coverId);
    console.log(JSON.stringify({ id, status: "公共展示已恢复并回读", media: saved.media.length, backup }));
  } finally {
    db.close();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
