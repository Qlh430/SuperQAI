"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const runtime = process.env.AI_OS_TEST_RUNTIME || path.resolve(__dirname, "../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "neon-asset-server-"));
const dataDir = path.join(directory, "data"), outputDir = path.join(directory, "output");
fs.mkdirSync(dataDir); fs.mkdirSync(outputDir);
const { createSystemDb } = require(path.join(runtime, "system-db.js"));
const { hashPassword } = require(path.join(runtime, "auth-crypto.js"));
const base = "http://127.0.0.1:33205";
let child, logs = "";
const password = "Regression-Only-2026!";
async function call(cookie, url, method = "GET", body) {
  const response = await fetch(base + url, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  return { status: response.status, body: result, cookie: response.headers.get("set-cookie")?.split(";")[0] };
}
const digest = () => fs.readdirSync(outputDir).filter(file => fs.statSync(path.join(outputDir,file)).isFile()).sort().map(file => [file,crypto.createHash("sha256").update(fs.readFileSync(path.join(outputDir,file))).digest("hex")]);
async function main() {
  const db = createSystemDb({ dbPath: path.join(dataDir, "system.sqlite") }); db.migrate();
  const passwordHash = await hashPassword(password);
  for (const id of ["owner", "reader", "other"]) db.insertUser({ id, username: id, displayName: id, role: id === "owner" ? "superadmin" : "user", status: "active", passwordHash, mustChangePassword: false });
  db.close();
  child = spawn(process.execPath, [path.join(runtime,"server.js")], { cwd: runtime, windowsHide: true, env: { ...process.env, PORT: "33205", HOST: "127.0.0.1", AI_OS_SKIP_ENV_FILE: "1", AI_OS_AUTH_DISABLED: "0", AI_OS_DATA_DIR: dataDir, AI_OS_OUTPUT_DIR: outputDir, AI_OS_SYSTEM_DB_FILE: path.join(dataDir,"system.sqlite"), CANVAS_DB_FILE: path.join(dataDir,"canvas.db"), SETTINGS_FILE: path.join(dataDir,"settings.json"), IMAGE_JOBS_FILE: path.join(dataDir,"image-jobs.json"), API_VIDEO_TASKS_FILE: path.join(dataDir,"api-video-tasks.json") } });
  child.stdout.on("data", chunk => { logs += chunk; }); child.stderr.on("data", chunk => { logs += chunk; });
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error("测试服务退出：" + logs);
    try { await fetch(base + "/api/auth/session"); break; } catch { await new Promise(resolve => setTimeout(resolve,100)); }
    if (attempt === 119) throw new Error("测试服务启动超时：" + logs);
  }
  const cookies = {};
  for (const id of ["owner","reader","other"]) { const login = await call(null,"/api/auth/login","POST",{username:id,password}); assert.equal(login.status,200); cookies[id] = login.cookie; }
  assert.equal((await call(cookies.owner,"/api/asset-library")).body.entries.length,0);
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEcsAAAAASUVORK5CYII=","base64");
  const uploaded = await fetch(base + "/api/assets/import",{method:"POST",headers:{Cookie:cookies.owner,"Content-Type":"image/png","X-File-Name":"original.png"},body:bytes});
  assert.equal(uploaded.status,201); const media = await uploaded.json();
  if (process.env.AI_OS_EXPECT_MEDIA_NAMING === '1') {
    assert.equal(media.asset.name, 'original');
    const resolved = await call(cookies.owner, '/api/assets/resolve?url=' + encodeURIComponent(media.url));
    assert.equal(resolved.status, 200); assert.equal(resolved.body.asset.id, media.asset.id);
    assert.equal((await call(cookies.other, '/api/assets/resolve?url=' + encodeURIComponent(media.url))).status, 403);
  }
  const original = digest(); assert.equal(original.length,1);
  assert.equal((await call(cookies.owner,"/api/asset-library")).body.entries.length,0,"上传不能自动入库");
  const add = await call(cookies.owner,"/api/asset-library","POST",{items:[{resourceId:media.asset.id,name:"角色",categoryId:"roles"}]});
  assert.equal(add.status,201,JSON.stringify(add.body)); const assetId = add.body.entry.asset.id;
  const duplicate = await call(cookies.owner,"/api/asset-library","POST",{items:[{media:{url:media.url,kind:"image"},name:"道具",categoryId:"props"}]});
  assert.equal(duplicate.body.duplicateCount,1); assert.equal(duplicate.body.entry.asset.id,assetId); assert.equal(duplicate.body.entry.asset.categoryId,"props");
  assert.deepEqual(digest(),original,"入库、重复归类不得复制或改写原文件");
  if (process.env.AI_OS_EXPECT_MEDIA_NAMING === '1') {
    assert.equal((await call(cookies.owner, `/api/resources/${media.asset.id}`, 'PATCH', {title:'历史改名'})).status, 200);
    assert.equal((await call(cookies.owner, '/api/asset-library')).body.entries[0].resource.title, '历史改名');
    assert.equal((await call(cookies.owner, `/api/asset-library/${assetId}`, 'PATCH', {name:'雪地露营'})).status, 200);
    const resolved = await call(cookies.owner, '/api/assets/resolve?url=' + encodeURIComponent(media.url));
    assert.equal(resolved.body.asset.name, '雪地露营'); assert.equal(resolved.body.asset.downloadName, '雪地露营.png');
  }
  assert.equal((await call(cookies.owner,`/api/asset-library/${assetId}/share`,"PATCH",{visibility:"users",userIds:["reader"]})).status,200);
  assert.equal((await call(cookies.reader,"/api/asset-library?scope=shared")).body.entries.length,1);
  assert.equal((await fetch(base+media.url,{headers:{Cookie:cookies.reader}})).status,200);
  assert.equal((await fetch(base+media.url,{headers:{Cookie:cookies.other}})).status,403);
  assert.equal((await call(cookies.reader,`/api/asset-library/${assetId}`,"PATCH",{name:"篡改"})).status,403);
  await call(cookies.owner,`/api/asset-library/${assetId}/share`,"PATCH",{visibility:"private"});
  assert.equal((await fetch(base+media.url,{headers:{Cookie:cookies.reader}})).status,403,"撤销共享后原文件入口即时撤权");
  await call(cookies.owner,`/api/asset-library/history/${media.asset.id}`,"DELETE");
  assert.equal((await call(cookies.owner,"/api/asset-library")).body.entries.length,1);
  assert.equal((await fetch(base+media.url,{headers:{Cookie:cookies.owner}})).status,200,'删除历史后资产原文件可读取');
  assert.deepEqual(digest(),original);
  const project = await call(cookies.owner,"/api/canvas/projects","POST",{name:"共享项目"}); assert.equal(project.status,201);
  const projectId = project.body.project.id;
  const board = await call(cookies.owner,"/api/canvas/boards","POST",{title:"测试画布",projectId}); assert.equal(board.status,201,JSON.stringify(board.body));
  const boardId = board.body.id;
  const { createCanvasRepository } = require(path.join(runtime,"canvas-repository.js"));
  const { FORMAT } = require(path.join(runtime,"canvas-export-service.js"));
  const imports = createCanvasRepository({dbPath:path.join(dataDir,"canvas.db"),workerPath:path.join(runtime,"canvas-db-worker.js")});
  await imports.ready();
  try {
    await imports.beginLegacyImport({board:{id:"foreign-import",title:"保留原导入",projectId},backupFile:"fixture"});
    for (const suffix of ["?boardId=foreign-import", ""]) {
      const attempted = await fetch(base+"/api/canvas/import"+suffix,{method:"POST",headers:{Cookie:cookies.reader,"Content-Type":"application/json"},body:`{"format":${JSON.stringify(FORMAT)},\n"board":${JSON.stringify({id:"foreign-import",title:"非法覆盖"})},\n`});
      assert.equal(attempted.status,409,"导入必须原子拒绝已有迁移画布，覆盖查询及流内编号");
      assert.equal((await imports.getBoardMeta("foreign-import")).title,"保留原导入");
    }
  } finally { await imports.close(); }
  await call(cookies.owner,`/api/canvas/projects/${projectId}/share`,"PATCH",{visibility:"users",permission:"edit",userIds:["reader"]});
  // Emulate a legacy resource without project linkage; direct access must repair it.
  const inspect = createSystemDb({dbPath:path.join(dataDir,"system.sqlite")}); inspect.migrate();
  const boardResource = inspect.getResourceByRef("canvas",boardId); inspect.updateResource(boardResource.id,{workspaceId:null}); inspect.close();
  assert.equal((await call(cookies.reader,`/api/canvas/boards/${boardId}/meta`)).status,200,"共享画布直接打开应继承项目权限");
  assert.equal((await call(cookies.reader,`/api/resources/${boardResource.id}`,"PATCH",{title:"非法改名",workspaceId:projectId,metadata:{canvasTrashed:false}})).status,403);
  assert.equal((await call(cookies.reader,`/api/canvas/boards/${boardId}/operations`,"POST",{operations:[{id:"forbidden-title",type:"board.patch",after:{title:"非法改名"}}]})).status,403);
  await call(cookies.owner,`/api/canvas/projects/${projectId}/share`,"PATCH",{visibility:"private"});
  assert.equal((await call(cookies.reader,`/api/canvas/boards/${boardId}/meta`)).status,403);
  assert.equal((await call(cookies.owner,`/api/canvas/boards/${boardId}/permanent`,"DELETE")).status,409,"永久删除只允许回收站中的画布");
  assert.equal((await call(cookies.reader,`/api/canvas/boards/${boardId}/permanent`,"DELETE")).status,403,"接收者不能永久删除所有者画布");
  assert.equal((await call(cookies.owner,`/api/canvas/boards/${boardId}/trash`,"POST",{operationId:"trash-before-permanent"})).status,200);
  assert.equal((await call(cookies.owner,`/api/canvas/boards/${boardId}/permanent`,"DELETE")).status,200);
  assert.equal((await call(cookies.owner,`/api/canvas/boards/${boardId}/meta`)).status,404);
  assert.deepEqual(digest(),original,"永久删除画布不得删除其他处引用的原媒体");
  assert.equal((await fetch(base+media.url,{headers:{Cookie:cookies.owner}})).status,200,'删除项目画布后资产原文件可读取');
  await call(cookies.owner,`/api/asset-library/${assetId}`,"DELETE");
  const cleanup = await call(cookies.owner,"/api/canvas/media/cleanup","POST",{candidateUrls:[media.url]});
  assert.equal(cleanup.status,200); assert.equal(cleanup.body.deletedCount,0,"历史隐藏及资产移除不得使其他引用失效");
  assert.deepEqual(digest(),original,"共享、撤销、删除登记不产生媒体副本");
  console.log("PASS 真实宿主服务：上传一次、引用入库去重、归类更新、共享撤权、项目直接继承及管理权限、文件哈希与数量不变");
}
main().catch(error => { console.error(error); console.error(logs.slice(-5000)); process.exitCode=1; }).finally(async () => {
  if (child && child.exitCode === null) { child.kill(); await Promise.race([new Promise(resolve=>child.once("exit",resolve)),new Promise(resolve=>setTimeout(resolve,5000))]); if(child.exitCode===null)child.kill("SIGKILL"); }
  // Retain temporary diagnostics on failure, remove only this script's directory on success.
  if (!process.exitCode) fs.rmSync(directory,{recursive:true,force:true});
});
