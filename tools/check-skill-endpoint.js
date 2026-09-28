"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function requestJson(port, pathname, options = {}) {
  const body = options.body === undefined ? "" : JSON.stringify(options.body);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method: options.method || "GET",
      headers: body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {},
    }, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { responseBody += chunk; });
      response.on("end", () => {
        let data = null;
        try { data = JSON.parse(responseBody); } catch { data = responseBody; }
        resolve({ status: response.statusCode, data });
      });
    });
    request.once("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

async function waitForServer(port, child, diagnostics) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Skill endpoint test server exited with code ${child.exitCode}: ${diagnostics.join("")}`);
    }
    try {
      const response = await requestJson(port, "/api/skills");
      if (response.status === 200) return response;
    } catch {
      // The server may still be binding its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for the Skill endpoint test server: ${diagnostics.join("")}`);
}

(async () => {
  const portProbe = http.createServer();
  const appPort = await listen(portProbe);
  await close(portProbe);
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-skill-endpoint-"));
  const diagnostics = [];
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      AI_OS_SKIP_ENV_FILE: "1",
      PORT: String(appPort),
      HOST: "127.0.0.1",
      AI_OS_AUTH_DISABLED: "1",
      AI_OS_DATA_DIR: tempDirectory,
      OUTBOUND_NO_PROXY: "127.0.0.1,localhost",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => diagnostics.push(String(chunk)));
  child.stderr.on("data", (chunk) => diagnostics.push(String(chunk)));

  try {
    const catalog = await waitForServer(appPort, child, diagnostics);
    assert.equal(catalog.data.systemCount, 14);
    assert.equal(catalog.data.customCount, 1);
    assert.equal(catalog.data.enabledCount, 15);
    assert.deepEqual(catalog.data.groups.slice(0, 3).map((group) => group.id), ["text", "image", "video"]);
    assert.ok(catalog.data.groups.some((group) => (
      group.kind === "custom"
      && group.skills.some((skill) => skill.id === "ai-video-director")
    )));
    const entries = catalog.data.groups.flatMap((group) => group.skills);
    assert.ok(entries.some((skill) => skill.id === "writing" && skill.label === "写作生成"));
    assert.ok(entries.some((skill) => skill.id === "poster-design"));
    assert.ok(entries.some((skill) => skill.id === "ai-video-director" && skill.origin === "custom"));
    assert.equal(entries.some((skill) => skill.id === "canvas-agent-core"), false);

    const methodNotAllowed = await requestJson(appPort, "/api/skills", { method: "POST", body: {} });
    assert.equal(methodNotAllowed.status, 405);

    const agentBefore = await requestJson(appPort, "/api/canvas-agent/skills");
    assert.equal(agentBefore.status, 200);
    assert.ok(agentBefore.data.skills.some((skill) => skill.id === "writing"));
    assert.ok(agentBefore.data.skills.some((skill) => skill.id === "ai-video-director" && skill.origin === "custom"));

    const disabled = await requestJson(appPort, "/api/skills/enabled", { method: "POST", body: { id: "writing", enabled: false } });
    assert.equal(disabled.status, 200);
    assert.equal(disabled.data.enabledCount, 14);
    assert.equal(
      disabled.data.groups.flatMap((group) => group.skills).find((skill) => skill.id === "writing").enabled,
      false,
    );
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(tempDirectory, "skills.json"), "utf8")).enabled.writing,
      false,
      "the toggle should persist into data/skills.json",
    );

    const agentAfter = await requestJson(appPort, "/api/canvas-agent/skills");
    assert.equal(agentAfter.data.skills.some((skill) => skill.id === "writing"), false, "disabling a skill must reach the agent catalog immediately");
    assert.ok(agentAfter.data.skills.some((skill) => skill.id === "poster-design"));

    const reEnabled = await requestJson(appPort, "/api/skills/enabled", { method: "POST", body: { id: "writing", enabled: true } });
    assert.equal(reEnabled.status, 200);
    assert.equal(reEnabled.data.enabledCount, 15);
    assert.equal(JSON.parse(fs.readFileSync(path.join(tempDirectory, "skills.json"), "utf8")).enabled.writing, undefined);
    assert.ok((await requestJson(appPort, "/api/canvas-agent/skills")).data.skills.some((skill) => skill.id === "writing"));

    const unknown = await requestJson(appPort, "/api/skills/enabled", { method: "POST", body: { id: "not-a-skill", enabled: false } });
    assert.equal(unknown.status, 404);
    assert.equal(unknown.data.code, "unknown_skill");

    const invalid = await requestJson(appPort, "/api/skills/enabled", { method: "POST", body: { enabled: false } });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.data.code, "invalid_skill_id");

    // 参考文档接口：只放行 references/ 下并且清单里声明过的文件。
    const customSkillDir = path.join(tempDirectory, "skills", "reference-skill");
    fs.mkdirSync(path.join(customSkillDir, "references"), { recursive: true });
    fs.writeFileSync(path.join(customSkillDir, "references", "spec.md"), "ENDPOINT-REFERENCE-BODY", "utf8");
    fs.writeFileSync(path.join(customSkillDir, "secret.txt"), "不该被读到", "utf8");
    fs.writeFileSync(path.join(customSkillDir, "SKILL.md"), [
      "---",
      "name: reference-skill",
      "description: 参考文档接口测试",
      "canvas:",
      "  label: 参考文档接口",
      "  category: video",
      "  icon: type",
      "  required_selection: none",
      "  triggers: [参考文档接口测试]",
      "  capabilities: [node.text.create, skill.reference.read]",
      "---",
      "",
      "# 参考文档接口",
      "",
      "## 工作流程",
      "",
      "占位正文，用来验证参考文档接口能按清单返回原文并拒绝越界路径。",
    ].join("\n"), "utf8");

    const reference = await requestJson(appPort, "/api/skills/reference?skill_id=reference-skill&path=references%2Fspec.md");
    assert.equal(reference.status, 200);
    assert.equal(reference.data.skill_id, "reference-skill");
    assert.equal(reference.data.path, "references/spec.md");
    assert.equal(reference.data.content, "ENDPOINT-REFERENCE-BODY");
    assert.equal(reference.data.bytes, Buffer.byteLength("ENDPOINT-REFERENCE-BODY", "utf8"));

    const outsideReferences = await requestJson(appPort, "/api/skills/reference?skill_id=reference-skill&path=secret.txt");
    assert.equal(outsideReferences.status, 400);
    assert.equal(outsideReferences.data.code, "invalid_reference_path");

    const missingReference = await requestJson(appPort, "/api/skills/reference?skill_id=reference-skill&path=references%2Fmissing.md");
    assert.equal(missingReference.status, 404);
    assert.equal(missingReference.data.code, "unknown_reference");

    const unknownReferenceSkill = await requestJson(appPort, "/api/skills/reference?skill_id=not-a-skill&path=references%2Fspec.md");
    assert.equal(unknownReferenceSkill.status, 404);
    assert.equal(unknownReferenceSkill.data.code, "unknown_skill");

    // 技能书只列已安装的功能 Skill，系统 Skill 留在完整目录里给路由用。
    const picker = await requestJson(appPort, "/api/canvas-agent/skills");
    assert.ok(picker.data.skills.some((skill) => skill.id === "reference-skill"));
    assert.ok(picker.data.skills.some((skill) => skill.id === "writing"));
    assert.deepEqual(picker.data.pickerSkills.map((skill) => skill.id).sort(), ["ai-video-director", "reference-skill"]);

    console.log("Skill endpoint checks passed.");
  } finally {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
