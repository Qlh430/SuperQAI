import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { dailyPaths, runningBackend } from "./daily-workbench.mjs";

const id = "natural-aesthetic-product-photography";
const priorVersion = "1.2.9";
const version = "1.2.10";
const methodPath = "references/photography-methods.md";
const indexPath = "references/visual-method-catalog.md";
const packageFiles = ["SKILL.md", "agent.skill.json", "interaction.json", methodPath, indexPath];
const priorHashes = {
  "SKILL.md": "429bc0af7fe80626e91eb2e8fb6f2fab409a8eda9fc6c6b673473a8ac63d1243",
  "agent.skill.json": "3f2fbc587f9eedc6302407a65d83e09709b957f44bccb4778c95a767f29b2434",
  [methodPath]: "fc47bf69a91222d358bcc596758f18bb0e0866ce24bcae5fb10376263901dbde",
  [indexPath]: "e9c50d3729cf7d22fec22cee4945ac43ced25637b746dd1a5cf23a6df84a83ae",
};
const json = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, ""));
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");

function files(root, prefix = "") {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const relative = prefix + entry.name;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return files(absolute, relative + "/");
    if (entry.isFile() && fs.lstatSync(absolute).nlink === 1) return [relative];
    throw new Error(`私人 Skill 含不支持的文件：${relative}`);
  }).sort();
}

export async function updateNaturalPhotoPrivateSkill(source, { verifyOnly = false } = {}) {
  await runningBackend(source);
  const { portable } = dailyPaths(source);
  const diagnostic = json(path.join(portable, "data/.logs/runtime-diagnostics.json"));
  if (!/^dev-preview-/u.test(diagnostic.runtimeName)) throw new Error("只允许在现有开发运行时更新私人摄影 Skill。");
  const base = path.resolve(source, "../.design/deploy-backups");
  const sourcePackage = path.resolve(source, "../host-sources/app/skill-packages", id);
  const users = path.join(diagnostic.dataDirectory, "users");
  const matches = fs.readdirSync(users, { withFileTypes: true }).filter(entry => entry.isDirectory() &&
    fs.existsSync(path.join(users, entry.name, "skills", id, "SKILL.md")));
  if (matches.length !== 1) throw new Error("没有定位到唯一的私人摄影 Skill 安装，停止更新。");
  const userDirectory = matches[0].name;
  const userRoot = path.join(users, userDirectory);
  const owner = userDirectory.replace(/-[a-f0-9]{20}$/u, "");
  if (`${owner}-${sha(owner).slice(0, 20)}` !== userDirectory) throw new Error("无法验证私人 Skill 所属账户。");
  const skill = path.join(userRoot, "skills", id);
  const manifest = path.join(userRoot, "skill-installs.json");
  for (const target of [users, userRoot, path.dirname(skill), skill, manifest]) {
    if (fs.lstatSync(target).isSymbolicLink()) throw new Error("私人 Skill 目录包含链接，停止更新。");
  }
  const originalManifest = fs.readFileSync(manifest);
  const record = json(manifest).packages[id];
  const require = createRequire(import.meta.url);
  const { createSkillRegistry } = require(path.join(diagnostic.appRoot, "skill-registry.js"));
  const { createSkillImportManager } = require(path.join(diagnostic.appRoot, "skill-import-manager.js"));
  const options = { systemDir: path.join(diagnostic.appRoot, "skills") };
  const registry = createSkillRegistry({ ...options, dataDir: diagnostic.dataDirectory });
  const evidence = () => {
    const loaded = registry.loadAgentCatalog(owner).all.find(item => item.id === id);
    const methods = registry.readReference(id, methodPath, owner).content;
    const index = registry.readReference(id, indexPath, owner).content;
    const installed = json(manifest).packages[id];
    const references = loaded?.references.map(entry => entry.path);
    const requiredReads = loaded?.execution?.stages.find(stage => stage.id === "planning")?.mustRead;
    const methodCount = [...index.matchAll(/^### REF-\d{3,}$/gm)].length;
    if (loaded?.metadata?.version !== version || loaded.metadata.creative_planning !== "art-direction"
      || installed.version !== version || installed.scope !== "personal"
      || !loaded.instructions.includes("creativeDirections") || !loaded.instructions.includes("unreadable-markings")
      || !methods.includes("七种可组合的文字预设")
      || !methods.includes("可跨预设组合的七种技法")
      || !methodCount || packageFiles.some(file => sha(fs.readFileSync(path.join(skill, file))) !== sha(fs.readFileSync(path.join(sourcePackage, file))))
      || JSON.stringify(files(skill)) !== JSON.stringify(packageFiles.slice().sort())
      || JSON.stringify(references) !== JSON.stringify([methodPath, indexPath])
      || JSON.stringify(requiredReads) !== JSON.stringify([methodPath, indexPath])) {
      throw new Error("活动私人 Skill 回读与预期不符。");
    }
    return { skillId: id, version, serverPid: diagnostic.serverPid, sha256: installed.sha256,
      references, requiredMethods: requiredReads, methodCount, scope: loaded.scope };
  };
  if (verifyOnly) return evidence();
  if (record?.version === version) return evidence();
  const originalFiles = Object.keys(priorHashes).sort();
  const expectedFiles = files(skill);
  if (record?.version !== priorVersion || record.scope !== "personal"
    || JSON.stringify(expectedFiles) !== JSON.stringify(originalFiles)) {
    throw new Error("当前私人摄影 Skill 与本次已审查基线不同，停止同 ID 更新。");
  }
  const baseline = Object.fromEntries(originalFiles.map(file => [file, sha(fs.readFileSync(path.join(skill, file)))]));
  const matchesBaseline = file => sha(fs.readFileSync(path.join(skill, file))) === baseline[file];
  if (originalFiles.some(file => baseline[file] !== priorHashes[file])) throw new Error("私人摄影 Skill 文件已变化，停止更新。");
  // Validate and register in an isolated directory using the existing importer.
  // Confirmed data is then swapped at the original private ID, retaining the
  // account's enabled/presentation state and the complete prior package.
  fs.mkdirSync(base, { recursive: true });
  const transaction = fs.mkdtempSync(path.join(base, "natural-photo-1.2.10-"));
  const staging = path.join(transaction, "staged");
  const stagingRegistry = createSkillRegistry({ ...options, dataDir: staging });
  const installer = createSkillImportManager({ registry: stagingRegistry, dataDir: staging });
  const preview = await installer.preview(owner, {
    scope: "personal",
    source: { label: `自然美学产品摄影私人更新 ${version}` },
    files: packageFiles.map(file => ({
      path: file,
      content: fs.readFileSync(path.join(sourcePackage, file)).toString("base64"),
    })),
  });
  if (preview.id !== id) throw new Error("预检返回了其他 Skill 标识。");
  installer.confirm(owner, preview.previewToken);
  const stagedUser = path.join(staging, "users", userDirectory);
  const nextRecord = json(path.join(stagedUser, "skill-installs.json")).packages[id];
  if (nextRecord.version !== version || nextRecord.scope !== "personal") throw new Error("暂存安装版本不符。");

  const backup = path.join(transaction, "previous-skill");
  const manifestBackup = path.join(transaction, "previous-skill-installs.json");
  fs.writeFileSync(manifestBackup, originalManifest, { flag: "wx" });
  const nextManifest = path.join(userRoot, `.photo-manifest-${crypto.randomUUID()}.tmp`);
  let movedPrevious = false;
  let movedNext = false;
  let wroteManifest = false;
  try {
    const liveManifest = json(manifest);
    if (sha(fs.readFileSync(manifest)) !== sha(originalManifest) ||
      originalFiles.some(file => !matchesBaseline(file))) {
      throw new Error("更新前的私人安装状态已变化，请重新核对。");
    }
    liveManifest.packages[id] = { ...record, version: nextRecord.version, sha256: nextRecord.sha256,
      compatibility: nextRecord.compatibility, dependencies: nextRecord.dependencies };
    fs.writeFileSync(nextManifest, JSON.stringify(liveManifest, null, 2) + "\n", { flag: "wx" });
    fs.renameSync(skill, backup);
    movedPrevious = true;
    fs.renameSync(path.join(stagedUser, "skills", id), skill);
    movedNext = true;
    fs.renameSync(nextManifest, manifest);
    wroteManifest = true;
    const result = { ...evidence(), backup, manifestBackup };
    fs.writeFileSync(path.join(transaction, "readback.json"), JSON.stringify(result, null, 2) + "\n");
    return result;
  } catch (error) {
    if (movedNext) fs.renameSync(skill, path.join(transaction, "rejected-skill"));
    if (movedPrevious) fs.renameSync(backup, skill);
    if (wroteManifest) {
      const rollback = path.join(userRoot, `.photo-rollback-${crypto.randomUUID()}.tmp`);
      fs.writeFileSync(rollback, originalManifest, { flag: "wx" });
      fs.renameSync(rollback, manifest);
    }
    throw error;
  } finally {
    if (fs.existsSync(nextManifest)) fs.unlinkSync(nextManifest);
  }
}
