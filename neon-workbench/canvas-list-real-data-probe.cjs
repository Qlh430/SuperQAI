"use strict";
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { DatabaseSync, backup } = require("node:sqlite");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const runtime = path.resolve(__dirname,"../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app");
const original = path.resolve(__dirname,"../AI-OS-Portable-1.0.5-win-x64/data");
const directory = fs.mkdtempSync(path.join(os.tmpdir(),"neon-canvas-list-probe-"));
const snapshot = path.join(directory,"data"), output = path.join(directory,"output");
let child, logs="";
async function main() {
  fs.mkdirSync(snapshot); fs.mkdirSync(output);
  for (const name of ["system.sqlite","canvas.db"]) {
    const source = new DatabaseSync(path.join(original,name),{readOnly:true});
    try { await backup(source,path.join(snapshot,name)); } finally {source.close();}
  }
  // List compatibility only: avoid copying prompts, history files, providers or original media.
  child = spawn(process.execPath,[path.join(runtime,"server.js")],{cwd:runtime,windowsHide:true,env:{...process.env,PORT:"33206",HOST:"127.0.0.1",AI_OS_SKIP_ENV_FILE:"1",AI_OS_AUTH_DISABLED:"1",AI_OS_DATA_DIR:snapshot,AI_OS_SYSTEM_DB_FILE:path.join(snapshot,"system.sqlite"),AI_OS_OUTPUT_DIR:output,CANVAS_DB_FILE:path.join(snapshot,"canvas.db"),SETTINGS_FILE:path.join(snapshot,"settings.json"),IMAGE_JOBS_FILE:path.join(snapshot,"image-jobs.json"),API_VIDEO_TASKS_FILE:path.join(snapshot,"api-video-tasks.json")}});
  child.stdout.on("data",chunk=>{logs+=chunk;});child.stderr.on("data",chunk=>{logs+=chunk;});
  for(let attempt=0;attempt<100;attempt++) {
    if(child.exitCode!==null) throw new Error("Isolated server exited: "+logs.slice(-2000));
    try {await fetch("http://127.0.0.1:33206/api/auth/session");break;}catch{await new Promise(r=>setTimeout(r,100));}
  }
  for(const route of ["/api/canvas/projects","/api/canvas/boards?scope=all","/api/resources","/api/asset-library?scope=mine"]) {
    const response = await fetch("http://127.0.0.1:33206"+route);
    const data = await response.json();
    console.log(JSON.stringify({route,status:response.status,...(response.ok?{projects:data.projects?.length,boards:data.boards?.length,trash:data.trash?.length,resources:data.resources?.length,assets:data.entries?.length}:{error:data.error,code:data.code})}));
    assert.equal(response.status,200,`${route}: ${data.error || data.code || "接口失败"}`);
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
  if(child&&child.exitCode===null){child.kill();await Promise.race([new Promise(r=>child.once("exit",r)),new Promise(r=>setTimeout(r,3000))]);if(child.exitCode===null)child.kill("SIGKILL");}
  if(path.dirname(directory)===os.tmpdir()&&path.basename(directory).startsWith("neon-canvas-list-probe-")) fs.rmSync(directory,{recursive:true,force:true});
});
