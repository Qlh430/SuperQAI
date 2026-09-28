"use strict";

const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createJimengCliService } = require("../jimeng-cli-service");

function createSettings() {
  const values = new Map();
  return {
    getSetting(key) { return values.get(key) || null; },
    setSetting(key, value) { values.set(key, value); return value; },
  };
}

function createFakeDreamina(root, responses = {}) {
  const executable = path.join(root, process.platform === "win32" ? "dreamina.exe" : "dreamina");
  fs.writeFileSync(executable, "fixture");
  const calls = [];
  function spawn(command, args, options) {
    calls.push({ command, args: [...args], options });
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => child.emit("close", null, "SIGTERM");
    const configured = responses[args.join(" ")];
    const fixture = typeof configured === "function"
      ? configured({ command, args: [...args], options, calls })
      : configured || { stdout: "", exitCode: 0 };
    if (fixture.timeout) return child;
    queueMicrotask(() => {
      if (fixture.error) return child.emit("error", fixture.error);
      if (fixture.stdout) child.stdout.end(fixture.stdout);
      else child.stdout.end();
      if (fixture.stderr) child.stderr.end(fixture.stderr);
      else child.stderr.end();
      child.emit("close", fixture.exitCode ?? 0, null);
    });
    return child;
  }
  return { executable, spawn, calls };
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aios-jimeng-cli-"));
  try {
    const settings = createSettings();
    // Detection looks at the real machine, so a "nothing installed" case has to
    // isolate every location it consults.
    const emptyHost = {
      PATH: "",
      HOME: path.join(root, "empty-home"),
      USERPROFILE: path.join(root, "empty-home"),
      LOCALAPPDATA: path.join(root, "empty-local"),
      APPDATA: path.join(root, "empty-roaming"),
      HOMEDRIVE: "",
      HOMEPATH: "",
    };
    const missing = createJimengCliService({ dataDir: root, settings, env: emptyHost, bundledDirectory: path.join(root, "no-bundle"), registryPathQuery: () => "" });
    assert.equal((await missing.status()).state, "missing");
    assert.match((await missing.status()).message, /即梦客户端文件缺失/);

    // The client shipped with the product is used without any user setup.
    const bundleRoot = path.join(root, "bundled");
    fs.mkdirSync(bundleRoot, { recursive: true });
    const bundledFixture = createFakeDreamina(bundleRoot, {
      "--version": { stdout: "dreamina 1.4.20\n" },
      user_credit: { stdout: JSON.stringify({ total_credit: 9 }) },
    });
    const bundledService = createJimengCliService({
      dataDir: root,
      settings: createSettings(),
      spawnImpl: bundledFixture.spawn,
      env: emptyHost,
      bundledDirectory: path.dirname(bundledFixture.executable),
      registryPathQuery: () => "",
    });
    const bundledStatus = await bundledService.status();
    assert.equal(bundledStatus.source, "bundled");
    assert.equal(bundledStatus.state, "ready-signed-in");
    assert.equal(bundledStatus.credits, 9);

    // An explicit path must win over the bundled client. Automated checks point
    // the service at a stub this way; if the bundle shadowed it, a check would
    // silently reach the real, logged-in account and spend real credits.
    const overrideRoot = path.join(root, "override");
    fs.mkdirSync(overrideRoot, { recursive: true });
    const overrideFixture = createFakeDreamina(overrideRoot, {
      "--version": { stdout: "dreamina 1.4.20\n" },
      user_credit: { stdout: JSON.stringify({ total_credit: 3 }) },
    });
    const overrideService = createJimengCliService({
      dataDir: root,
      settings: createSettings(),
      spawnImpl: overrideFixture.spawn,
      env: { ...emptyHost, AI_OS_JIMENG_BIN: overrideFixture.executable },
      bundledDirectory: path.dirname(bundledFixture.executable),
      registryPathQuery: () => "",
    });
    const overrideStatus = await overrideService.status();
    assert.equal(overrideStatus.source, "AI_OS_JIMENG_BIN");
    assert.equal(overrideStatus.executable, overrideFixture.executable);
    assert.equal(overrideStatus.credits, 3);


    // An install made after the host process started is absent from its PATH but
    // present under the conventional "<home>/bin" location.
    const homeRoot = path.join(root, "home-install");
    fs.mkdirSync(path.join(homeRoot, "bin"), { recursive: true });
    const homeFixture = createFakeDreamina(path.join(homeRoot, "bin"), {
      "--version": { stdout: "dreamina 1.4.20\n" },
      user_credit: { stdout: JSON.stringify({ total_credit: 7 }) },
    });
    const homeService = createJimengCliService({
      dataDir: root,
      settings: createSettings(),
      spawnImpl: homeFixture.spawn,
      env: { ...emptyHost, HOME: homeRoot, USERPROFILE: homeRoot },
      bundledDirectory: path.join(root, "no-bundle"),
      registryPathQuery: () => "",
    });
    const homeStatus = await homeService.status();
    assert.equal(homeStatus.source, "installed");
    assert.equal(homeStatus.version, "1.4.20");
    assert.equal(homeStatus.state, "ready-signed-in");
    assert.equal(homeStatus.credits, 7);

    // The persisted user PATH is the only remaining record when the process was
    // started before the installer ran. It is read once and then cached.
    const registryRoot = path.join(root, "registry-install");
    fs.mkdirSync(registryRoot, { recursive: true });
    const registryFixture = createFakeDreamina(registryRoot, {
      "--version": { stdout: "dreamina 1.4.20\n" },
      user_credit: { stdout: JSON.stringify({ total_credit: 3 }) },
    });
    let registryQueries = 0;
    const registryService = createJimengCliService({
      dataDir: root,
      settings: createSettings(),
      spawnImpl: registryFixture.spawn,
      env: emptyHost,
      bundledDirectory: path.join(root, "no-bundle"),
      registryPathQuery: () => { registryQueries += 1; return `${registryRoot};C:\\Windows\\System32`; },
    });
    const registryStatus = await registryService.status();
    assert.equal(registryStatus.source, "registry-path");
    assert.equal(registryStatus.state, "ready-signed-in");
    await registryService.status();
    assert.equal(registryQueries, 1);

    let signedIn = true;
    const fixture = createFakeDreamina(root, {
      "--version": { stdout: "dreamina 1.4.17\n" },
      user_credit: () => signedIn
        ? { stdout: JSON.stringify({ total_credit: 12, account: "local-user", token: "Bearer never-return-this" }) }
        : { exitCode: 1 },
      "text2image -h": { stdout: "      --model_version string     supported values: 5.0, 4.5; default: 5.0\n" },
      "text2image --prompt=cat --ratio=16:9 --resolution_type=2k --model_version=5.0 --poll=0": { stdout: JSON.stringify({ submit_id: "task-2", gen_status: "querying" }) },
      "text2image --prompt=no params --resolution_type=2k --model_version=5.0 --poll=0": { stdout: JSON.stringify({ submit_id: "task-4", gen_status: "querying" }) },
      "text2image --prompt=qualified --resolution_type=1.5k --model_version=5.0Pro --poll=0": { stdout: JSON.stringify({ submit_id: "task-7", gen_status: "querying" }) },
      "text2image --prompt=old ladder --resolution_type=1k --model_version=3.1 --poll=0": { stdout: JSON.stringify({ submit_id: "task-5", gen_status: "querying" }) },
      "text2video --prompt=clip --video_resolution=720p --model_version=seedance2.0 --poll=0": { stdout: JSON.stringify({ submit_id: "task-6", gen_status: "querying" }) },
      "text2video --prompt=clip --video_resolution=1080p --duration=6 --model_version=seedance2.5 --poll=0": { stdout: JSON.stringify({ submit_id: "task-3", gen_status: "querying" }) },
      "text2video -h": { stdout: "      --model_version string      supported values: seedance2.5, seedance2.0; default: seedance2.0fast\n" },
      "image2image -h": { stdout: "      --model_version string     supported values: 5.0; default: 5.0\n" },
      "image2video -h": { stdout: "      --model_version string      supported values: seedance2.5; default: seedance2.0_vip\n" },
      "login --headless": () => {
        signedIn = true;
        return { stdout: "verification_uri: https://jimeng.jianying.com/cli/login\nuser_code: ABCD-EFGH\ndevice_code: never-return-this\n" };
      },
      "relogin --headless": { stdout: "verification_uri: https://jimeng.jianying.com/cli/login\nuser_code: WXYZ-1234\ndevice_code: never-return-this\n" },
      "relogin -h": { stdout: "Remove the local OAuth login state first, then force a fresh OAuth Device Flow login.\n" },
      "login checklogin --device_code=never-return-this --poll=0": { exitCode: 1, stderr: "authsdk: login pending\n" },
      logout: { stdout: "ok\n" },
      "query_result --submit_id=task-1": { stdout: JSON.stringify({ submit_id: "task-1", gen_status: "success", images: ["file:///out.png"] }) },
    });
    const service = createJimengCliService({ dataDir: root, settings, spawnImpl: fixture.spawn, env: { PATH: "" } });

    assert.throws(() => service.setPath("dreamina"), /绝对可执行文件/);
    assert.equal((await service.setPath(fixture.executable)).state, "ready-signed-in");
    // An image model is published with the "jimeng-" prefix so a bare version is
    // never mistaken for another provider's alias, while a Seedance video name
    // already stands on its own.
    assert.deepEqual(await service.models(), ["jimeng-5.0", "jimeng-4.5", "seedance2.5", "seedance2.0"]);
    signedIn = false;
    assert.equal((await service.login()).state, "login-running");
    // The authorization URL and user code are shown to the operator, while the
    // device code must stay server side because it authorizes polling.
    await new Promise(resolve => setTimeout(resolve, 0));
    const waiting = await service.loginStatus();
    assert.equal(waiting.authUrl, "https://jimeng.jianying.com/cli/login");
    assert.equal(waiting.userCode, "ABCD-EFGH");
    assert.equal(JSON.stringify(waiting).includes("never-return-this"), false);
    const signedInStatus = await service.status();
    assert.equal(signedInStatus.signedIn, true);
    // The session lives in the machine credential store, not in HOME, so the
    // panel is told where it came from instead of implying a login through AI OS.
    assert.equal(signedInStatus.loginSource, "system-credential-store");
    // The reported home is this host's isolated client directory, which proves the
    // session is not read from it.
    assert.match(signedInStatus.loginHome, /cli-home/);
    // Switching accounts cannot reuse the stored session, so it must go through
    // the CLI's own relogin command. Logging out first is what a stuck approval
    // looks like, and it must not block a fresh switch.
    assert.equal((await service.logout()).state, "ready-signed-in");
    fixture.calls.length = 0;
    assert.equal((await service.relogin()).state, "login-running");
    await new Promise(resolve => setTimeout(resolve, 0));
    const switched = await service.loginStatus();
    assert.equal(switched.authUrl, "https://jimeng.jianying.com/cli/login");
    assert.equal(switched.userCode, "WXYZ-1234");
    assert.equal(JSON.stringify(switched).includes("never-return-this"), false);
    // The capability probe runs first, so the forced login is the later call.
    assert.deepEqual(fixture.calls.filter(call => call.args[0] === "relogin").map(call => call.args), [
      ["relogin", "-h"],
      ["relogin", "--headless"],
    ]);
    // A repeat request while the operator is mid-approval keeps the pending device
    // code instead of cancelling it.
    const repeated = await service.relogin();
    assert.equal(repeated.userCode, "WXYZ-1234");
    assert.equal(fixture.calls.filter(call => call.args[0] === "relogin").length, 2);
    assert.equal((await service.status()).signedIn, true);

    // The client confirms the device flow in the machine's own language
    // ("OAuth 登录成功。"), and the poll that stores the token is the same one
    // that has to end the wait. Reading only English keywords here used to leave
    // the panel spinning after the operator had already approved the login.
    const deviceRoot = path.join(root, "device-flow");
    fs.mkdirSync(deviceRoot, { recursive: true });
    let deviceSignedIn = false;
    let checkAnswer = "pending";
    const deviceFixture = createFakeDreamina(deviceRoot, {
      "--version": { stdout: "dreamina 1.4.20\n" },
      user_credit: () => (deviceSignedIn
        ? { stdout: JSON.stringify({ total_credit: 42, account: "device-user" }) }
        : { exitCode: 1, stderr: "authsdk: not logged in\n" }),
      "login --headless": { stdout: "verification_uri: https://jimeng.jianying.com/cli/login?code=1\nuser_code: DEVICE-CODE\ndevice_code: device-secret\n" },
      "relogin -h": { stdout: "force a fresh OAuth Device Flow login\n" },
      "relogin --headless": { stdout: "verification_uri: https://jimeng.jianying.com/cli/login?code=2\nuser_code: DEVICE-TWO\ndevice_code: device-secret-two\n" },
      "login checklogin --device_code=device-secret --poll=0": () => {
        if (checkAnswer === "pending") return { exitCode: 1, stderr: "authsdk: login pending\n" };
        if (checkAnswer === "denied") return { exitCode: 1, stderr: "authsdk: login denied\n" };
        if (checkAnswer === "expired") return { exitCode: 1, stderr: "authsdk: login expired\n" };
        if (checkAnswer === "consumed") return { exitCode: 1, stderr: "authsdk: not logged in\n" };
        deviceSignedIn = true;
        return { stdout: "OAuth 登录成功。\n" };
      },
      "login checklogin --device_code=device-secret-two --poll=0": () => {
        if (checkAnswer === "pending") return { exitCode: 1, stderr: "authsdk: login pending\n" };
        if (checkAnswer === "denied") return { exitCode: 1, stderr: "authsdk: login denied\n" };
        if (checkAnswer === "expired") return { exitCode: 1, stderr: "authsdk: login expired\n" };
        deviceSignedIn = true;
        return { stdout: "OAuth 登录成功。\n" };
      },
    });
    const deviceService = createJimengCliService({
      dataDir: path.join(root, "device-data"),
      settings: createSettings(),
      spawnImpl: deviceFixture.spawn,
      env: { PATH: "" },
    });
    assert.equal((await deviceService.login()).state, "login-running");
    await new Promise(resolve => setTimeout(resolve, 0));
    const deviceWaiting = await deviceService.loginStatus();
    assert.equal(deviceWaiting.state, "login-running");
    assert.equal(deviceWaiting.authUrl, "https://jimeng.jianying.com/cli/login?code=1");
    checkAnswer = "success";
    const deviceDone = await deviceService.loginStatus();
    assert.equal(deviceDone.state, "ready-signed-in");
    assert.equal(deviceDone.credits, 42);
    // A device code another poll already consumed must not stall the panel either:
    // the stored session is re-read instead of polling the same code forever.
    deviceSignedIn = false;
    checkAnswer = "pending";
    const secondAttempt = await deviceService.relogin();
    assert.equal(secondAttempt.state, "login-running", `second attempt should wait for approval, got ${secondAttempt.state}: ${secondAttempt.message}`);
    await new Promise(resolve => setTimeout(resolve, 0));
    const secondWaiting = await deviceService.loginStatus();
    assert.equal(secondWaiting.state, "login-running", `second poll should keep waiting, got ${secondWaiting.state}: ${secondWaiting.message}`);
    deviceSignedIn = true;
    checkAnswer = "consumed";
    assert.equal((await deviceService.loginStatus()).signedIn, true);
    // A denied approval ends the attempt with a message, and a later attempt can
    // still succeed.
    deviceSignedIn = false;
    checkAnswer = "denied";
    assert.equal((await deviceService.relogin()).state, "login-running");
    await new Promise(resolve => setTimeout(resolve, 0));
    const denied = await deviceService.loginStatus();
    assert.equal(denied.state, "login-failed");
    assert.match(denied.message, /拒绝/);
    checkAnswer = "expired";
    assert.equal((await deviceService.relogin()).state, "login-running");
    await new Promise(resolve => setTimeout(resolve, 0));
    const expired = await deviceService.loginStatus();
    assert.equal(expired.state, "login-failed");
    assert.match(expired.message, /过期/);

    const resumed = await service.generate({
      modelId: "jimeng-image",
      intent: "image.generate",
      prompt: "safe prompt",
      resumeTask: { taskId: "task-1" },
    });
    assert.deepEqual(resumed, { data: [{ url: "file:///out.png" }], task_id: "task-1" });
    assert.deepEqual(fixture.calls.find(call => call.args[0] === "query_result")?.args, ["query_result", "--submit_id=task-1"]);

    // The CLI requires a quality flag whose name and scale differ per mode:
    // images take --resolution_type=2k, videos take --video_resolution=1080p.
    await service.generate({ modelId: "5.0", intent: "image.generate", prompt: "cat", params: { size: "16:9", resolution: "2k" } });
    const imageCall = fixture.calls.find(call => call.args.some(arg => arg.startsWith("--prompt=cat")));
    assert.deepEqual(imageCall.args, [
      "text2image", "--prompt=cat", "--ratio=16:9", "--resolution_type=2k", "--model_version=5.0", "--poll=0",
    ]);
    fixture.calls.length = 0;
    await service.generate({ modelId: "seedance2.5", intent: "video.generate", prompt: "clip", params: { resolution: "1080", duration: 6 } });
    const videoCall = fixture.calls.find(call => call.args[0] === "text2video");
    assert.deepEqual(videoCall.args, [
      "text2video", "--prompt=clip", "--video_resolution=1080p", "--duration=6", "--model_version=seedance2.5", "--poll=0",
    ]);
    assert.ok(!videoCall.args.some(arg => arg.startsWith("--resolution_type=")));

    // Both quality flags are mandatory in the CLI, so an unset resolution falls
    // back to the documented default for the requested mode.
    fixture.calls.length = 0;
    await service.generate({ modelId: "5.0", intent: "image.generate", prompt: "no params" });
    assert.ok(fixture.calls.at(-1).args.includes("--resolution_type=2k"));
    await service.generate({ modelId: "3.1", intent: "image.generate", prompt: "old ladder" });
    assert.ok(fixture.calls.at(-1).args.includes("--resolution_type=1k"));
    await service.generate({ modelId: "seedance2.0", intent: "video.generate", prompt: "clip" });
    assert.ok(fixture.calls.at(-1).args.includes("--video_resolution=720p"));
    // A published catalog id is translated back to the bare version the CLI
    // validates, and 5.0 Pro renames the shared level 1 to its own 1.5k rung.
    fixture.calls.length = 0;
    await service.generate({ modelId: "jimeng-5.0Pro", intent: "image.generate", prompt: "qualified", params: { resolution: "1" } });
    assert.deepEqual(fixture.calls.at(-1).args, [
      "text2image", "--prompt=qualified", "--resolution_type=1.5k", "--model_version=5.0Pro", "--poll=0",
    ]);

    // A finished task nests media under result_json with image_url keys.
    const completed = createFakeDreamina(root, {
      "--version": { stdout: `${JSON.stringify({ version: "ec1b9fa-dirty", commit: "ec1b9fa" })}\n` },
      "query_result --submit_id=done": {
        stdout: JSON.stringify({
          submit_id: "done",
          gen_status: "success",
          result_json: {
            images: [{ image_url: "https://media.example.test/one.png", width: 2560, height: 1440 }],
            videos: [{ video_url: "https://media.example.test/two.mp4", cover_url: "https://media.example.test/cover.png" }],
          },
        }),
      },
    });
    const completedService = createJimengCliService({ dataDir: root, settings: createSettings(), spawnImpl: completed.spawn, env: { AI_OS_JIMENG_BIN: completed.executable, PATH: "" } });
    const completedResult = await completedService.generate({ modelId: "5.0", intent: "image.generate", prompt: "x", resumeTask: { taskId: "done" } });
    assert.deepEqual(completedResult.data, [
      { url: "https://media.example.test/one.png" },
      { url: "https://media.example.test/two.mp4" },
    ]);
    assert.ok(!JSON.stringify(completedResult).includes("cover.png"));

    // A failed task keeps its submit_id but never any media, so polling has to
    // recognise the terminal status instead of waiting for the outer timeout.
    const failed = createFakeDreamina(root, {
      "--version": { stdout: `${JSON.stringify({ version: "ec1b9fa-dirty", commit: "ec1b9fa" })}\n` },
      "query_result --submit_id=broken": {
        stdout: JSON.stringify({ submit_id: "broken", gen_status: "failed", fail_reason: "内容审核未通过" }),
      },
      "query_result --submit_id=vanished": {
        stdout: JSON.stringify({ submit_id: "vanished", gen_status: "not_found" }),
      },
    });
    const failedService = createJimengCliService({ dataDir: root, settings: createSettings(), spawnImpl: failed.spawn, env: { AI_OS_JIMENG_BIN: failed.executable, PATH: "" } });
    await assert.rejects(
      () => failedService.generate({ modelId: "seedance2.5", intent: "video.generate", prompt: "x", resumeTask: { taskId: "broken" } }),
      (error) => {
        assert.equal(error.code, "jimeng_cli_task_failed");
        assert.match(error.message, /内容审核未通过/);
        assert.ok(!/submit_id|result_json/.test(error.message), "a failure message must not echo the raw CLI payload");
        return true;
      },
    );
    await assert.rejects(
      () => failedService.generate({ modelId: "5.0", intent: "image.generate", prompt: "x", resumeTask: { taskId: "vanished" } }),
      (error) => {
        assert.equal(error.code, "jimeng_cli_task_failed");
        assert.match(error.message, /已失效/);
        return true;
      },
    );
    // Every other status still reports as in-progress so the poll loop keeps going.
    const inProgress = createFakeDreamina(root, {
      "--version": { stdout: `${JSON.stringify({ version: "ec1b9fa-dirty", commit: "ec1b9fa" })}\n` },
      "query_result --submit_id=waiting": { stdout: JSON.stringify({ submit_id: "waiting", gen_status: "querying" }) },
    });
    const inProgressService = createJimengCliService({ dataDir: root, settings: createSettings(), spawnImpl: inProgress.spawn, env: { AI_OS_JIMENG_BIN: inProgress.executable, PATH: "" } });
    assert.deepEqual(
      await inProgressService.generate({ modelId: "5.0", intent: "image.generate", prompt: "x", resumeTask: { taskId: "waiting" } }),
      { data: [], task_id: "waiting" },
    );
    // A queued task reports its position so a slow queue reads as "排队中" instead
    // of looking like a task that will never finish.
    const queued = createFakeDreamina(root, {
      "--version": { stdout: `${JSON.stringify({ version: "ec1b9fa-dirty", commit: "ec1b9fa" })}\n` },
      "query_result --submit_id=queued": {
        stdout: JSON.stringify({
          submit_id: "queued",
          gen_status: "querying",
          queue_info: { queue_idx: 93_831, priority: 3, queue_status: 1, queue_length: 309_790 },
        }),
      },
    });
    const queuedService = createJimengCliService({ dataDir: root, settings: createSettings(), spawnImpl: queued.spawn, env: { AI_OS_JIMENG_BIN: queued.executable, PATH: "" } });
    assert.deepEqual(
      await queuedService.generate({ modelId: "seedance2.0", intent: "video.generate", prompt: "x", resumeTask: { taskId: "queued" } }),
      { data: [], task_id: "queued", progress: { state: "queued", position: 93_831, length: 309_790 } },
    );
    const retryQuery = createFakeDreamina(root, {
      "--version": { stdout: "dreamina 1.4.20\n" },
      "query_result --submit_id=retry": { exitCode: 1, stderr: "request timed out" },
    });
    const retryQueryService = createJimengCliService({ dataDir: root, settings: createSettings(), spawnImpl: retryQuery.spawn, env: { AI_OS_JIMENG_BIN: retryQuery.executable, PATH: "" } });
    await assert.rejects(
      () => retryQueryService.generate({ modelId: "5.0", intent: "image.generate", prompt: "x", resumeTask: { taskId: "retry" } }),
      (error) => {
        assert.equal(error.code, "jimeng_cli_query_failed");
        assert.equal(error.retryable, true);
        return true;
      },
    );

    assert.ok(fixture.calls.every(call => call.options.shell === false));
    assert.ok(fixture.calls.every(call => call.options.env.DREAMINA_HOME === path.join(root, "cli-home", "jimeng")));

    const lowSettings = createSettings();
    const low = createFakeDreamina(root, { "--version": { stdout: "dreamina 0.9.0\n" } });
    const lowService = createJimengCliService({ dataDir: root, settings: lowSettings, spawnImpl: low.spawn, env: { AI_OS_JIMENG_BIN: low.executable, PATH: "" } });
    const lowStatus = await lowService.status();
    assert.equal(lowStatus.state, "version-incompatible");

    // The shipped CLI answers "--version" with build metadata such as
    // {"version":"ec1b9fa-dirty","commit":"ec1b9fa"} and keeps the semantic
    // version in version.json only.
    const homeVersionFile = path.join(root, "cli-home", "jimeng", "home", ".dreamina_cli", "version.json");
    const buildMetadata = JSON.stringify({ version: "ec1b9fa-dirty", commit: "ec1b9fa", build_time: "2026-09-09T09:09:35Z" });

    fs.mkdirSync(path.dirname(homeVersionFile), { recursive: true });
    fs.writeFileSync(homeVersionFile, JSON.stringify({ version: "1.5.0", release_date: "2026-09-10" }));

    const metadata = createFakeDreamina(root, {
      "--version": { stdout: `${buildMetadata}\n` },
      user_credit: { stdout: JSON.stringify({ total_credit: 1157 }) },
    });
    const metadataService = createJimengCliService({ dataDir: root, settings: createSettings(), spawnImpl: metadata.spawn, env: { AI_OS_JIMENG_BIN: metadata.executable, PATH: "" } });
    const metadataStatus = await metadataService.status();
    assert.equal(metadataStatus.state, "ready-signed-in");
    assert.equal(metadataStatus.version, "1.5.0");
    assert.equal(metadataStatus.credits, 1157);

    fs.writeFileSync(homeVersionFile, JSON.stringify({ version: "1.0.0" }));
    const outdated = createJimengCliService({ dataDir: root, settings: createSettings(), spawnImpl: metadata.spawn, env: { AI_OS_JIMENG_BIN: metadata.executable, PATH: "" } });
    const outdatedStatus = await outdated.status();
    assert.equal(outdatedStatus.state, "version-incompatible");
    assert.match(outdatedStatus.message, /1\.4\.2/);

    const reported = createFakeDreamina(root, {
      "--version": { stdout: `${JSON.stringify({ version: "2.0.0", commit: "abcdef1" })}\n` },
      user_credit: { stdout: JSON.stringify({ total_credit: 3 }) },
    });
    const reportedService = createJimengCliService({ dataDir: root, settings: createSettings(), spawnImpl: reported.spawn, env: { AI_OS_JIMENG_BIN: reported.executable, PATH: "" } });
    const reportedStatus = await reportedService.status();
    assert.equal(reportedStatus.state, "ready-signed-in");
    assert.equal(reportedStatus.version, "2.0.0");

    // Nothing that advertises a version at all must not be reported as outdated.
    fs.rmSync(homeVersionFile, { force: true });
    const unknown = createFakeDreamina(root, {
      "--version": { stdout: "build unknown\n" },
      user_credit: { exitCode: 1 },
    });
    const unknownService = createJimengCliService({ dataDir: root, settings: createSettings(), spawnImpl: unknown.spawn, env: { AI_OS_JIMENG_BIN: unknown.executable, PATH: "" } });
    const unknownStatus = await unknownService.status();
    assert.notEqual(unknownStatus.state, "version-incompatible");
    assert.equal(unknownStatus.state, "ready-signed-out");

    // A catalog is read out of six help screens, which is the most expensive read
    // this service makes. It is remembered per installed client, including across
    // host restarts, and only an explicit refresh or a replaced client re-reads it.
    const catalogRoot = path.join(root, "catalog");
    const catalogData = path.join(root, "catalog-data");
    fs.mkdirSync(catalogRoot, { recursive: true });
    fs.mkdirSync(catalogData, { recursive: true });
    const catalog = createFakeDreamina(catalogRoot, {
      "--version": { stdout: "dreamina 1.4.20\n" },
      "text2image -h": { stdout: "      --model_version string     supported values: 5.0, 4.5; default: 5.0\n" },
      "text2video -h": { stdout: "      --model_version string      supported values: seedance2.5, seedance2.0; default: seedance2.0\n" },
    });
    const expectedCatalog = ["jimeng-5.0", "jimeng-4.5", "seedance2.5", "seedance2.0"];
    const catalogService = createJimengCliService({ dataDir: catalogData, settings: createSettings(), spawnImpl: catalog.spawn, env: { AI_OS_JIMENG_BIN: catalog.executable, PATH: "" } });
    assert.deepEqual(await catalogService.models(), expectedCatalog);

    const restartedCalls = [];
    const restarted = createJimengCliService({
      dataDir: catalogData,
      settings: createSettings(),
      env: { AI_OS_JIMENG_BIN: catalog.executable, PATH: "" },
      spawnImpl: (command, args, options) => { restartedCalls.push([...args]); return catalog.spawn(command, args, options); },
    });
    assert.deepEqual(await restarted.models(), expectedCatalog);
    assert.deepEqual(restartedCalls, [], "a restarted host reuses the remembered catalog instead of reading six help screens again");

    await restarted.models({ force: true });
    assert.ok(restartedCalls.some(args => args.join(" ") === "text2image -h"), "an explicit refresh reads the client again");

    // A client that was replaced in place describes other models, so the entry
    // that belonged to the previous binary must not answer for it.
    fs.appendFileSync(catalog.executable, "#");
    const replacedCalls = [];
    const replaced = createJimengCliService({
      dataDir: catalogData,
      settings: createSettings(),
      env: { AI_OS_JIMENG_BIN: catalog.executable, PATH: "" },
      spawnImpl: (command, args, options) => { replacedCalls.push([...args]); return catalog.spawn(command, args, options); },
    });
    assert.deepEqual(await replaced.models(), expectedCatalog);
    assert.ok(replacedCalls.some(args => args.join(" ") === "text2image -h"), "a replaced client drops the remembered catalog");

    const timeoutSettings = createSettings();
    const timeout = createFakeDreamina(root, { "--version": { timeout: true } });
    const timeoutService = createJimengCliService({ dataDir: root, settings: timeoutSettings, spawnImpl: timeout.spawn, env: { AI_OS_JIMENG_BIN: timeout.executable, PATH: "" }, commandTimeoutMs: 5 });
    assert.equal((await timeoutService.status()).state, "runtime-error");

    console.log("Jimeng CLI service checks passed.");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
