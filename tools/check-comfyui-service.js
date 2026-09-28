"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const filename = path.resolve(__dirname, "../comfyui-service.js");
const api = fs.existsSync(filename) ? require(filename) : {};

async function main() {
  assert.equal(typeof api.createComfyService, "function", "ComfyUI needs its own configuration and process service");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-comfy-unit-"));
  const stored = new Map();
  const settings = { getSetting: key => stored.get(key), setSetting: (key, value) => stored.set(key, structuredClone(value)) };
  const connections = [
    { id: "saved", name: "局域网 ComfyUI", baseUrl: "http://192.168.1.53:8188", enabled: true },
    { id: "second", name: "第二台", baseUrl: "http://192.168.1.54:8188", enabled: true },
  ];
  const changes = [];
  const service = api.createComfyService({ settings, getConnections: () => connections, updateConnection: (id, baseUrl) => changes.push({ id, baseUrl }) });
  let managed;
  let upstream;
  try {
    assert.equal(service.configuration().config.baseUrl, connections[0].baseUrl);
    assert.equal(service.configuration().config.providerId, "saved");
    assert.equal(service.configuration().config.mode, "remote");
    assert.equal(stored.size, 0, "reading legacy configuration does not modify the database");
    assert.equal(service.configuration().connections.length, 2);
    await assert.rejects(service.start(), error => error.code === "comfy_remote_start");
    assert.equal((await service.stop()).runtime.owned, false, "no process is killed in remote mode");
    await service.save({ baseUrl: "http://192.168.1.53:8288/" });
    assert.equal(service.resolveUrl(), "http://192.168.1.53:8288");
    assert.deepEqual(changes, [{ id: "saved", baseUrl: "http://192.168.1.53:8288" }]);
    assert.equal(api.createComfyService({ settings }).resolveUrl(), service.resolveUrl(), "saved settings survive recreation");
    await assert.rejects(service.save({ baseUrl: "file:///etc/passwd" }), /访问地址/);
    await assert.rejects(service.save({ baseUrl: "http://secret:secret@localhost:8188" }), /访问地址/);
    await assert.rejects(service.save({ baseUrl: "http://0.0.0.0:8188" }), /监听/);
    await assert.rejects(service.save({ providerId: "not-a-comfy-provider" }), /连接/);

    fs.mkdirSync(path.join(temp, "ComfyUI"));
    fs.mkdirSync(path.join(temp, "python_embeded"));
    fs.writeFileSync(path.join(temp, "ComfyUI", "main.py"), "# fixture only\n");
    fs.writeFileSync(path.join(temp, "python_embeded", "python.exe"), "fixture only");
    const detected = service.detect({ rootDirectory: temp });
    assert.equal(detected.config.mainPath, path.join(temp, "ComfyUI", "main.py"));
    assert.equal(detected.config.pythonPath, path.join(temp, "python_embeded", "python.exe"));
    assert.equal(detected.valid, true);
    const automaticStore = new Map();
    const automatic = api.createComfyService({ settings: { getSetting: key => automaticStore.get(key), setSetting: (key, value) => automaticStore.set(key, value) } });
    const automaticallySaved = await automatic.save({ mode: "local", rootDirectory: temp });
    assert.equal(automaticallySaved.config.pythonPath, detected.config.pythonPath, "a root-only local save discovers portable Python");
    assert.equal(automaticallySaved.config.mainPath, detected.config.mainPath);
    await automatic.close();
    assert.equal(service.detect({ rootDirectory: path.join(temp, "ComfyUI") }).valid, true, "selecting the inner ComfyUI folder also finds the portable Python");
    assert.throws(() => service.detect({ rootDirectory: "\\\\192.168.1.53\\share\\ComfyUI" }), /远程|共享/);
    assert.throws(() => service.detect({ rootDirectory: "192.168.1.53\\ComfyUI" }), /绝对路径/);
    assert.throws(() => service.detect({ rootDirectory: "" }), /目录/);
    await assert.rejects(service.save({ mode: "local", rootDirectory: temp, port: 0 }), /端口/);
    await assert.rejects(service.save({ mode: "local", rootDirectory: temp, listenHost: "https://192.168.1.53" }), /监听/);
    await assert.rejects(service.save({ mode: "local", rootDirectory: temp, pythonPath: path.join(temp, "run.bat") }), /Python/);
    const remoteSaved = await service.save({ mode: "remote", baseUrl: connections[0].baseUrl, port: "", listenHost: "" });
    assert.equal(remoteSaved.config.port, 8188, "hidden invalid local fields do not block remote URL-only saving");
    assert.equal(remoteSaved.config.listenHost, "127.0.0.1");

    let responseMode = "stats";
    const requested = [];
    upstream = http.createServer((req, res) => {
      requested.push(req.url);
      res.setHeader("content-type", "application/json");
      if (responseMode === "stats") res.end(JSON.stringify({ system: { os: "fixture" }, devices: [{ name: "Test GPU" }] }));
      else if (responseMode === "queue" && req.url.endsWith("/queue")) res.end('{"queue_running":[],"queue_pending":[]}');
      else if (responseMode === "queue") { res.statusCode = 404; res.end("{}"); }
      else if (responseMode === "auth") { res.statusCode = 401; res.end("{}"); }
      else if (responseMode === "huge") res.end("x".repeat(300_000));
      else res.end('{"hello":"not-comfy"}');
    });
    await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${upstream.address().port}`;
    assert.equal((await service.test({ mode: "remote", baseUrl: url, port: "", listenHost: "" })).ok, true, "remote testing only needs a URL");
    responseMode = "queue";
    assert.equal((await service.test({ mode: "remote", baseUrl: url })).ok, true);
    assert.ok(requested.includes("/queue"));
    responseMode = "other";
    assert.equal((await service.test({ mode: "remote", baseUrl: url })).code, "comfy_invalid_response");
    responseMode = "auth";
    assert.equal((await service.test({ mode: "remote", baseUrl: url })).code, "comfy_auth_required");
    responseMode = "huge";
    assert.equal((await service.test({ mode: "remote", baseUrl: url })).ok, false);
    assert.ok(requested.every(route => ["/queue", "/system_stats"].includes(route)), "connection tests never generate content");

    let spawnCount = 0;
    let invocation;
    let child;
    let ready = false;
    let spawnFails = false;
    const managedStore = new Map();
    managed = api.createComfyService({
      settings: { getSetting: key => managedStore.get(key), setSetting: (key, value) => managedStore.set(key, structuredClone(value)) },
      fetchImpl: async () => { if (!ready) throw new Error("offline"); return new Response('{"system":{},"devices":[]}'); },
      spawnImpl: (executable, args, options) => {
        spawnCount++;
        invocation = { executable, args, options };
        child = Object.assign(new EventEmitter(), { pid: spawnFails ? undefined : 12345678, exitCode: null, signalCode: null, stdout: new PassThrough(), stderr: new PassThrough() });
        queueMicrotask(() => child.emit(spawnFails ? "error" : "spawn", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" })));
        return child;
      },
      stopProcess: async target => { assert.equal(target, child); child.exitCode = 0; child.emit("exit", 0, null); },
    });
    const localConfig = { ...detected.config, providerId: "", mode: "local", port: upstream.address().port, listenHost: "127.0.0.1" };
    await managed.save(localConfig);
    await assert.rejects(managed.start(), error => error.code === "comfy_port_in_use");
    assert.equal(spawnCount, 0, "never launch into an occupied port");
    await new Promise(resolve => upstream.close(resolve));
    const starts = await Promise.allSettled([managed.start(), managed.start()]);
    assert.equal(starts.filter(item => item.status === "fulfilled").length, 1);
    assert.equal(spawnCount, 1, "concurrent starts cannot launch duplicates");
    assert.equal((await managed.status()).runtime.state, "starting", "a PID does not prove readiness");
    assert.equal(invocation.options.shell, false);
    assert.equal(invocation.options.windowsHide, true);
    assert.deepEqual(invocation.args.slice(0, 6), ["-u", detected.config.mainPath, "--listen", "127.0.0.1", "--port", String(localConfig.port)]);
    assert.ok(invocation.args.includes("--disable-auto-launch"));
    await assert.rejects(managed.save({ baseUrl: "http://localhost:2" }), error => error.code === "comfy_running");
    child.stderr.write("sk-secretforunit\n" + "x".repeat(20_000));
    assert.ok((await managed.status()).runtime.logs.length <= 8_000);
    ready = true;
    assert.equal((await managed.status()).runtime.state, "running");
    const now = Date.now;
    try {
      const later = now() + 240_000;
      Date.now = () => later;
      ready = false;
      assert.equal((await managed.status()).runtime.state, "error");
      ready = true;
      assert.equal((await managed.status()).runtime.state, "running", "readiness recovers after a transient outage past startup timeout");
      ready = false;
      assert.match((await managed.status()).runtime.message, /暂时|连接中断/, "an already-ready process is not mislabeled as a startup timeout");
      ready = true;
    } finally { Date.now = now; }
    await managed.stop();
    assert.equal((await managed.status()).runtime.owned, false);
    assert.equal((await managed.status()).runtime.state, "stopped");
    assert.equal((await managed.status()).connection.ok, true, "external connectivity never implies process ownership");
    await assert.rejects(managed.start(), error => error.code === "comfy_already_available");
    ready = false;
    await managed.start();
    child.emit("error", Object.assign(new Error("kill EPERM"), { code: "EPERM" }));
    assert.equal(managed.configuration().runtime.owned, true, "errors after spawn must not abandon a still-live child");
    await assert.rejects(managed.start(), error => error.code === "comfy_running");
    await managed.stop();
    spawnFails = true;
    await assert.rejects(managed.start(), error => error.code === "comfy_spawn_failed");
    assert.equal((await managed.status()).runtime.state, "error");
    assert.match((await managed.status()).runtime.message, /Python/);
    assert.equal((await managed.status()).runtime.owned, false);
    spawnFails = false;
    await managed.start();
    child.emit("exit", 1, null);
    assert.equal((await managed.status()).runtime.state, "error");
    await managed.start();
    await managed.close();
    assert.equal(child.exitCode, 0, "shutdown stops the owned process");
    console.log("ComfyUI service checks passed (config, migration, paths, probes, lifecycle, safety).");
  } finally {
    await managed?.close();
    await service.close();
    upstream?.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
