"use strict";

const defaultCrypto = require("node:crypto");
const defaultFs = require("node:fs");
const path = require("node:path");

function createComfyWorkflowTaskService({
  mediaTaskService,
  updateTask,
  cleanupTasks,
  workflowFiles,
  comfyClient,
  comfyBackgroundRemoval,
  getImageReferenceDimensions,
  runRunningHubOutpaintTask,
  readJson,
  sendJson,
  formatErrorMessage,
  shoeSwapPrompt,
  shoeSwapApiKey,
  crypto = defaultCrypto,
  fs = defaultFs,
  now = Date.now,
} = {}) {
  for (const [name, dependency] of Object.entries({
    mediaTaskService,
    workflowFiles,
    comfyClient,
    comfyBackgroundRemoval,
    getImageReferenceDimensions,
    runRunningHubOutpaintTask,
    readJson,
    sendJson,
    formatErrorMessage,
  })) {
    if (!dependency) throw new TypeError(`ComfyUI workflow task service requires ${name}.`);
  }
  for (const name of [
    "ttp",
    "seedvr2",
    "shoeSwap",
    "outpaint",
    "runninghubOutpaint",
    "flux2KleinEdit",
    "qwenEditAngle",
    "removeBackground",
  ]) {
    if (!workflowFiles[name]) throw new TypeError(`ComfyUI workflow task service requires workflowFiles.${name}.`);
  }

  const updateWorkflowTask = typeof updateTask === "function"
    ? updateTask
    : (taskId, patch) => mediaTaskService.update(taskId, patch);
  const cleanupWorkflowTasks = typeof cleanupTasks === "function"
    ? cleanupTasks
    : () => mediaTaskService.cleanupExpired();

  function getWorkflowFile(workflowType) {
    if (workflowType === "seedvr2") return workflowFiles.seedvr2;
    if (workflowType === "shoe-swap") return workflowFiles.shoeSwap;
    if (workflowType === "outpaint") return workflowFiles.outpaint;
    if (workflowType === "runninghub-outpaint") return workflowFiles.runninghubOutpaint;
    if (workflowType === "flux2-klein-edit") return workflowFiles.flux2KleinEdit;
    if (workflowType === "qwen-edit-angle") return workflowFiles.qwenEditAngle;
    if (workflowType === "remove-background") return workflowFiles.removeBackground;
    return workflowFiles.ttp;
  }

  async function handleUpscale(req, res, workflowType = "ttp") {
    try {
      const workflowFile = getWorkflowFile(workflowType);
      // 抠图默认不带工作流文件：运行时会按目标 ComfyUI 实际安装的抠图节点自动组装。
      if (workflowType !== "remove-background" && !fs.existsSync(workflowFile)) {
        sendJson(res, 500, { error: `${workflowType} workflow file is missing.` });
        return;
      }

      const payload = await readJson(req);
      if (workflowType === "shoe-swap" && (!payload.person_image || !payload.shoe_image)) {
        sendJson(res, 400, { error: "Missing person image or shoe image." });
        return;
      }
      if (workflowType !== "shoe-swap" && !payload.image) {
        sendJson(res, 400, { error: "Missing image." });
        return;
      }

      cleanupWorkflowTasks();
      const taskId = crypto.randomUUID();
      mediaTaskService.set(taskId, {
        id: taskId,
        status: "queued",
        progress: 5,
        message: "任务已创建，准备提交 ComfyUI...",
        created_at: now(),
        updated_at: now(),
        images: [],
      });

      runTask(taskId, { ...payload, workflowType }).catch((error) => {
        updateWorkflowTask(taskId, {
          status: "failed",
          progress: 0,
          message: `${workflowType === "remove-background" ? "抠图" : "放大"}失败：${formatErrorMessage(error)}`,
          error: formatErrorMessage(error),
        });
      });

      sendJson(res, 202, { task_id: taskId });
    } catch (error) {
      sendJson(res, 500, { error: formatErrorMessage(error) });
    }
  }

  function handleUpscaleStatus(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const taskId = url.searchParams.get("id");
      const task = mediaTaskService.get(taskId);
      if (!task) {
        sendJson(res, 404, { error: "Upscale task was not found." });
        return;
      }
      sendJson(res, 200, task);
    } catch (error) {
      sendJson(res, 500, { error: formatErrorMessage(error) });
    }
  }

  async function runTask(taskId, payload) {
    if (payload.workflowType === "shoe-swap") {
      await runShoeSwapTask(taskId, payload);
      return;
    }
    if (payload.workflowType === "outpaint") {
      await runOutpaintTask(taskId, payload);
      return;
    }
    if (payload.workflowType === "runninghub-outpaint") {
      await runRunningHubOutpaintTask(taskId, payload);
      return;
    }
    if (payload.workflowType === "flux2-klein-edit") {
      await runFlux2KleinEditTask(taskId, payload);
      return;
    }
    if (payload.workflowType === "qwen-edit-angle") {
      await runQwenEditAngleTask(taskId, payload);
      return;
    }
    if (payload.workflowType === "remove-background") {
      await runComfyBackgroundRemovalTask(taskId, payload);
      return;
    }

    updateWorkflowTask(taskId, { status: "running", progress: 10, message: "正在上传图片到 ComfyUI..." });
    const comfyUrl = comfyClient.normalizeUrl(payload.comfy_url);
    const uploaded = await comfyClient.uploadDataUrl(comfyUrl, payload.image, payload.name || "upscale_input.png");
    const isSeedVr2 = payload.workflowType === "seedvr2";
    const workflowFile = isSeedVr2 ? workflowFiles.seedvr2 : workflowFiles.ttp;
    const workflow = JSON.parse(fs.readFileSync(workflowFile, "utf8"));
    const seed = Number(payload.seed || crypto.randomInt(1, 2147483647));
    const requestedResolution = payload.resolution ? Number(payload.resolution) : null;
    const batchSize = Number(payload.batch_size || 5);
    const inputDimensions = getImageReferenceDimensions(payload.image);

    updateWorkflowTask(taskId, { progress: 20, message: `正在准备 ${isSeedVr2 ? "SeedVR2" : "TTP"} 放大工作流...` });
    if (isSeedVr2 && requestedResolution && requestedResolution > 4096) {
      throw new Error("SeedVR2 当前工作流最高支持 4K，请选择 2K 或 4K。");
    }
    if (isSeedVr2 && workflow["80"]?.inputs && workflow["41"]?.inputs) {
      workflow["80"].inputs.image = uploaded.name;
      workflow["41"].inputs.seed = seed;
      if (requestedResolution) {
        workflow["41"].inputs.resolution = requestedResolution;
        workflow["41"].inputs.max_resolution = requestedResolution;
      }
      if (workflow["26"]?.inputs) workflow["26"].inputs.filename_prefix = `seedvr2_upscale_${now()}`;
    } else if (workflow["10"]?.inputs && workflow["11"]?.inputs) {
      workflow["10"].inputs.image = uploaded.name;
      if (requestedResolution) {
        // Output resolution is independent of model multiplier. Keep the workflow's
        // configured model instead of assuming another model is installed.
        const modelScale = getUpscaleModelFactor(workflow["12"]?.inputs?.model_name);
        const inputLongEdge = Math.max(inputDimensions?.width || 0, inputDimensions?.height || 0);
        const preScaleLength = Math.max(
          1024,
          inputLongEdge || Math.round(requestedResolution / modelScale),
          Math.round(requestedResolution / modelScale),
        );
        workflow["11"].inputs.scale_to_length = preScaleLength;
        workflow["11"].inputs.scale_to_side = "longest";
        ensureTtpFinalResizeNode(workflow, requestedResolution);
      }
      if (workflow["25"]?.inputs) workflow["25"].inputs.seed = seed;
      if (workflow["50"]?.inputs) workflow["50"].inputs.seed = seed;
      if (workflow["32"]?.inputs) workflow["32"].inputs.filename_prefix = `ttp_upscale_${now()}`;
    } else if (workflow["1076"]?.inputs && workflow["1017"]?.inputs) {
      workflow["1076"].inputs.image = uploaded.name;
      workflow["1017"].inputs.seed = seed;
      workflow["1017"].inputs.new_resolution = requestedResolution;
      workflow["1017"].inputs.batch_size = batchSize;
      if (workflow["1078"]?.inputs) workflow["1078"].inputs.filename_prefix = `seedvr2_${now()}`;
    } else {
      throw new Error("Unsupported upscale workflow: input/upscale nodes were not found.");
    }

    updateWorkflowTask(taskId, { progress: 28, message: "正在提交 ComfyUI 队列..." });
    const promptId = await comfyClient.submitPrompt(comfyUrl, workflow);
    updateWorkflowTask(taskId, {
      progress: 35,
      message: "ComfyUI 已接收任务，正在排队或运行...",
      prompt_id: promptId,
      seed,
      resolution: isSeedVr2 ? workflow["41"]?.inputs?.resolution : requestedResolution,
      max_resolution: workflow["41"]?.inputs?.max_resolution,
      upscale_model: workflow["12"]?.inputs?.model_name,
      pre_upscale_length: workflow["11"]?.inputs?.scale_to_length,
      pre_upscale_side: workflow["11"]?.inputs?.scale_to_side,
      batch_size: isSeedVr2 ? workflow["41"]?.inputs?.batch_size : batchSize,
      input: uploaded.name,
    });

    const history = await comfyClient.waitForHistory(comfyUrl, promptId, (status) => updateWorkflowTask(taskId, status));
    updateWorkflowTask(taskId, { progress: 94, message: "ComfyUI 已完成，正在保存高清图片..." });
    const preferredOutputIds = isSeedVr2 ? ["26", "1078"] : ["32"];
    const images = await comfyClient.saveHistoryImages(comfyUrl, history, `upscale_${now()}_`, preferredOutputIds);
    if (!images.length) throw new Error("ComfyUI completed, but no output image was found.");

    updateWorkflowTask(taskId, {
      status: "success",
      progress: 100,
      message: "放大完成。",
      images,
      comfy: comfyUrl,
    });
  }

  // ComfyUI 抠图：优先用 workflows/background-removal.json（用户自备工作流），
  // 没有就按目标 ComfyUI 实际安装的抠图节点自动拼一个，最后保存带透明通道的 PNG。
  async function runComfyBackgroundRemovalTask(taskId, payload) {
    updateWorkflowTask(taskId, { status: "running", progress: 10, message: "正在上传图片到 ComfyUI..." });
    const comfyUrl = comfyClient.normalizeUrl(payload.comfy_url);
    const uploaded = await comfyClient.uploadDataUrl(comfyUrl, payload.image, payload.name || "cutout_input.png");
    const outputPrefix = `aios_cutout_${now()}`;

    updateWorkflowTask(taskId, { progress: 22, message: "正在准备 ComfyUI 抠图工作流..." });
    let workflow;
    let removalNode = "";
    let hasAlpha = true;
    if (fs.existsSync(workflowFiles.removeBackground)) {
      workflow = JSON.parse(fs.readFileSync(workflowFiles.removeBackground, "utf8"));
      const inputNode = Object.entries(workflow).find(([, node]) => node?.class_type === "LoadImage");
      if (!inputNode) throw new Error("背景移除工作流缺少 LoadImage 节点。");
      inputNode[1].inputs.image = uploaded.name;
      const saveNode = Object.entries(workflow).find(([, node]) => node?.class_type === "SaveImage");
      if (saveNode?.inputs) saveNode[1].inputs.filename_prefix = outputPrefix;
      removalNode = Object.values(workflow)
        .map((node) => String(node?.class_type || ""))
        .find((type) => /remove.?background|rembg|remove.?bg|birefnet|rmbg|matting/i.test(type)) || "自定义工作流";
    } else {
      const objectInfo = await comfyClient.fetchObjectInfo(comfyUrl);
      const built = comfyBackgroundRemoval.buildBackgroundRemovalWorkflow(objectInfo, { imageName: uploaded.name, outputPrefix });
      workflow = built.workflow;
      removalNode = built.nodeClass;
      hasAlpha = built.hasAlpha;
    }

    updateWorkflowTask(taskId, { progress: 30, message: "正在提交 ComfyUI 抠图队列..." });
    const promptId = await comfyClient.submitPrompt(comfyUrl, workflow);
    updateWorkflowTask(taskId, {
      progress: 38,
      message: "ComfyUI 已接收抠图任务，正在处理...",
      prompt_id: promptId,
      input: uploaded.name,
      removal_node: removalNode,
    });

    const history = await comfyClient.waitForHistory(comfyUrl, promptId, (status) => updateWorkflowTask(taskId, status));
    updateWorkflowTask(taskId, { progress: 94, message: "ComfyUI 已完成，正在保存透明图片..." });
    const images = await comfyClient.saveHistoryImages(comfyUrl, history, `cutout_${now()}_`, [], { filenamePrefix: outputPrefix });
    if (!images.length) throw new Error("ComfyUI 抠图完成，但没有找到输出图片。");

    updateWorkflowTask(taskId, {
      status: "success",
      progress: 100,
      message: hasAlpha ? "抠图完成。" : "抠图完成（当前节点只输出图像，未附带透明通道）。",
      images,
      comfy: comfyUrl,
      removal_node: removalNode,
      has_alpha: hasAlpha,
    });
  }

  async function runFlux2KleinEditTask(taskId, payload) {
    updateWorkflowTask(taskId, { status: "running", progress: 10, message: "正在上传图片到 ComfyUI..." });
    const comfyUrl = comfyClient.normalizeUrl(payload.comfy_url);
    const uploadToken = makeUploadToken(taskId);
    const uploaded = await comfyClient.uploadDataUrl(comfyUrl, payload.image, makeUploadFilename(payload.name || "flux2_klein_input.png", uploadToken));
    const uploadedMask = payload.mask_image
      ? await comfyClient.uploadDataUrl(comfyUrl, payload.mask_image, makeUploadFilename(payload.mask_name || "flux2_klein_mask.png", `${uploadToken}_mask`))
      : null;
    const workflow = JSON.parse(fs.readFileSync(workflowFiles.flux2KleinEdit, "utf8"));
    const seed = Number(payload.seed || crypto.randomInt(1, 2147483647));
    const prompt = String(payload.prompt || "保持主体构图、材质、颜色和位置自然一致，只按提示进行图片编辑。").trim();

    updateWorkflowTask(taskId, { progress: 22, message: "正在准备 Flux2 Klein 图片编辑工作流..." });
    if (!workflow["123"]?.inputs || !workflow["117"]?.inputs || !workflow["165"]?.inputs) {
      throw new Error("Unsupported Flux2 Klein workflow: required nodes 123, 117, or 165 were not found.");
    }

    workflow["123"].inputs.image = uploaded.name;
    if (uploadedMask) {
      workflow["169"] = {
        inputs: { image: uploadedMask.name },
        class_type: "LoadImage",
        _meta: { title: "加载遮罩" },
      };
      if (workflow["167"]?.inputs) workflow["167"].inputs.mask = ["169", 1];
    }
    workflow["117"].inputs.text = prompt;
    setWorkflowSeed(workflow, seed);
    const outputPrefix = `flux2_klein_edit_${now()}`;
    workflow["165"].inputs.filename_prefix = outputPrefix;

    updateWorkflowTask(taskId, { progress: 30, message: "正在提交 Flux2 Klein 队列..." });
    const promptId = await comfyClient.submitPrompt(comfyUrl, workflow);
    updateWorkflowTask(taskId, {
      progress: 38,
      message: "ComfyUI 已接收 Flux2 Klein 任务，正在处理...",
      prompt_id: promptId,
      seed,
      input: uploaded.name,
    });

    const history = await comfyClient.waitForHistory(comfyUrl, promptId, (status) => updateWorkflowTask(taskId, {
      ...status,
      message: status.message || "ComfyUI 正在处理 Flux2 Klein 图片编辑...",
    }));
    updateWorkflowTask(taskId, { progress: 94, message: "ComfyUI 已完成，正在保存 Flux2 Klein 结果..." });
    const images = await comfyClient.saveHistoryImages(
      comfyUrl,
      history,
      `flux2_klein_edit_${now()}_`,
      ["165"],
      { strictPreferred: true, lastOnly: true, filenamePrefix: outputPrefix },
    );
    if (!images.length) throw new Error("ComfyUI completed, but no Flux2 Klein output image was found.");

    updateWorkflowTask(taskId, {
      status: "success",
      progress: 100,
      message: "Flux2 Klein 图片编辑完成。",
      images,
      comfy: comfyUrl,
    });
  }

  function normalizeQwenAngleValue(value, fallback, min, max, decimals = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    const factor = 10 ** decimals;
    const rounded = Math.round(number * factor) / factor;
    return Math.max(min, Math.min(max, rounded));
  }

  function toQwenComfyHorizontalAngle(value) {
    const normalized = normalizeQwenAngleValue(value, 49, -180, 180);
    return ((normalized % 360) + 360) % 360;
  }

  async function runQwenEditAngleTask(taskId, payload) {
    updateWorkflowTask(taskId, { status: "running", progress: 10, message: "正在上传图片到 ComfyUI..." });
    const comfyUrl = comfyClient.normalizeUrl(payload.comfy_url);
    const uploadToken = makeUploadToken(taskId);
    const uploaded = await comfyClient.uploadDataUrl(comfyUrl, payload.image, makeUploadFilename(payload.name || "qwen_angle_input.png", uploadToken));
    const workflow = JSON.parse(fs.readFileSync(workflowFiles.qwenEditAngle, "utf8"));
    const seed = Number(payload.seed || crypto.randomInt(1, 2147483647));
    const horizontalAngle = toQwenComfyHorizontalAngle(payload.horizontal_angle);
    const verticalAngle = normalizeQwenAngleValue(payload.vertical_angle, 0, -30, 60);
    const zoom = normalizeQwenAngleValue(payload.zoom, 5, 0, 10, 1);

    updateWorkflowTask(taskId, { progress: 22, message: "正在准备 Qwen 角度切换工作流..." });
    if (!workflow["173"]?.inputs || !workflow["187"]?.inputs || !workflow["186"]?.inputs) {
      throw new Error("Unsupported Qwen angle workflow: required nodes 173, 187, or 186 were not found.");
    }

    workflow["173"].inputs.image = uploaded.name;
    workflow["187"].inputs.horizontal_angle = horizontalAngle;
    workflow["187"].inputs.vertical_angle = verticalAngle;
    workflow["187"].inputs.zoom = zoom;
    workflow["187"].inputs.default_prompts = false;
    workflow["187"].inputs.camera_view = false;
    setWorkflowSeed(workflow, seed);
    const outputPrefix = `qwen_edit_angle_${now()}`;
    workflow["186"].inputs.filename_prefix = outputPrefix;

    updateWorkflowTask(taskId, { progress: 30, message: "正在提交 Qwen 角度切换队列..." });
    const promptId = await comfyClient.submitPrompt(comfyUrl, workflow);
    updateWorkflowTask(taskId, {
      progress: 38,
      message: "ComfyUI 已接收 Qwen 角度切换任务，正在处理...",
      prompt_id: promptId,
      seed,
      input: uploaded.name,
      horizontal_angle: horizontalAngle,
      vertical_angle: verticalAngle,
      zoom,
    });

    const history = await comfyClient.waitForHistory(comfyUrl, promptId, (status) => updateWorkflowTask(taskId, {
      ...status,
      message: status.message || "ComfyUI 正在处理 Qwen 角度切换...",
    }));
    updateWorkflowTask(taskId, { progress: 94, message: "ComfyUI 已完成，正在保存 Qwen 结果..." });
    const images = await comfyClient.saveHistoryImages(
      comfyUrl,
      history,
      `qwen_edit_angle_${now()}_`,
      ["186"],
      { strictPreferred: true, lastOnly: true, filenamePrefix: outputPrefix },
    );
    if (!images.length) throw new Error("ComfyUI completed, but no Qwen angle output image was found.");

    updateWorkflowTask(taskId, {
      status: "success",
      progress: 100,
      message: "Qwen 角度切换完成。",
      images,
      comfy: comfyUrl,
    });
  }

  function setWorkflowSeed(workflow, seed) {
    for (const node of Object.values(workflow || {})) {
      if (!node?.inputs) continue;
      if (Object.prototype.hasOwnProperty.call(node.inputs, "seed")) {
        node.inputs.seed = seed;
      }
      if (Object.prototype.hasOwnProperty.call(node.inputs, "noise_seed")) {
        node.inputs.noise_seed = seed;
      }
    }
  }

  function makeUploadToken(taskId) {
    const taskPart = String(taskId || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]+/g, "").slice(0, 8);
    return `${now()}_${taskPart}_${crypto.randomBytes(3).toString("hex")}`;
  }

  function makeUploadFilename(filename, token) {
    const value = String(filename || "image.png");
    const extension = path.extname(value) || ".png";
    const base = path.basename(value, extension).replace(/[\/:*?"<>|]+/g, "-") || "image";
    return `${base}_${token}${extension}`;
  }

  async function runShoeSwapTask(taskId, payload) {
    updateWorkflowTask(taskId, { status: "running", progress: 10, message: "正在上传人物图和鞋子图到 ComfyUI..." });
    const comfyUrl = comfyClient.normalizeUrl(payload.comfy_url);
    const person = await comfyClient.uploadDataUrl(comfyUrl, payload.person_image, payload.person_name || "person.png");
    const shoe = await comfyClient.uploadDataUrl(comfyUrl, payload.shoe_image, payload.shoe_name || "shoe.png");
    const workflow = JSON.parse(fs.readFileSync(workflowFiles.shoeSwap, "utf8"));
    const seed = Number(payload.seed || crypto.randomInt(1, 2147483647));
    const imageSize = String(payload.image_size || "2K").toUpperCase();

    updateWorkflowTask(taskId, { progress: 22, message: "正在准备换鞋工作流..." });
    if (!workflow["13"]?.inputs || !workflow["10"]?.inputs || !workflow["3"]?.inputs) {
      throw new Error("Unsupported shoe swap workflow: required nodes 13, 10, or 3 were not found.");
    }

    const shoeSwapRunId = now();
    const shoeSwapCropPrefix = `shoe_swap_crop_${shoeSwapRunId}`;
    const shoeSwapFinalPrefix = `shoe_swap_${shoeSwapRunId}`;

    workflow["13"].inputs.image = person.name;
    workflow["10"].inputs.image = shoe.name;
    workflow["3"].inputs.seed = seed;
    workflow["3"].inputs.model = payload.model || "gemini-3.1-flash-image";
    workflow["3"].inputs.image_size = imageSize;
    workflow["3"].inputs.apikey = shoeSwapApiKey;
    if (workflow["4"]?.inputs) workflow["4"].inputs.prompt = payload.prompt || shoeSwapPrompt;
    if (workflow["7"]?.inputs) workflow["7"].inputs.filename_prefix = shoeSwapCropPrefix;
    if (workflow["14"]?.inputs) workflow["14"].inputs.filename_prefix = shoeSwapFinalPrefix;

    updateWorkflowTask(taskId, { progress: 30, message: "正在提交 ComfyUI 换鞋队列..." });
    const promptId = await comfyClient.submitPrompt(comfyUrl, workflow);
    updateWorkflowTask(taskId, {
      progress: 38,
      message: "ComfyUI 已接收换鞋任务，正在处理...",
      prompt_id: promptId,
      seed,
      image_size: imageSize,
      input: person.name,
      shoe: shoe.name,
    });

    const history = await comfyClient.waitForHistory(comfyUrl, promptId, (status) => updateWorkflowTask(taskId, {
      ...status,
      message: status.message || "ComfyUI 正在处理换鞋，可能需要几分钟...",
    }));
    updateWorkflowTask(taskId, { progress: 94, message: "ComfyUI 已完成，正在保存换鞋结果..." });
    let images = await comfyClient.saveHistoryImages(
      comfyUrl,
      history,
      `shoe_swap_${now()}_`,
      ["14"],
      { strictPreferred: true, lastOnly: true, filenamePrefix: shoeSwapFinalPrefix },
    );
    let usedFallbackOutput = false;
    if (!images.length) {
      updateWorkflowTask(taskId, { progress: 96, message: "Final stitch node had no output; saving Gemini raw shoe-swap result..." });
      images = await comfyClient.saveHistoryImages(
        comfyUrl,
        history,
        `shoe_swap_raw_${now()}_`,
        ["7"],
        { strictPreferred: true, lastOnly: true, filenamePrefix: shoeSwapCropPrefix },
      );
      usedFallbackOutput = !!images.length;
    }
    if (!images.length) {
      const outputIds = Object.keys(history.outputs || {}).join(", ") || "none";
      throw new Error(`ComfyUI completed, but no shoe swap output image was found. Checked final node 14 and fallback node 7. History outputs: ${outputIds}.`);
    }

    updateWorkflowTask(taskId, {
      status: "success",
      progress: 100,
      message: "换鞋完成。",
      images,
      fallback_output: usedFallbackOutput,
      comfy: comfyUrl,
    });
  }

  async function runOutpaintTask(taskId, payload) {
    updateWorkflowTask(taskId, { status: "running", progress: 10, message: "正在上传图片到 ComfyUI..." });
    const comfyUrl = comfyClient.normalizeUrl(payload.comfy_url);
    const uploaded = await comfyClient.uploadDataUrl(comfyUrl, payload.image, payload.name || "outpaint_input.png");
    const workflow = JSON.parse(fs.readFileSync(workflowFiles.outpaint, "utf8"));
    const seed = Number(payload.seed || crypto.randomInt(1, 2147483647));
    const padding = normalizeOutpaintPadding(payload);

    updateWorkflowTask(taskId, { progress: 22, message: "正在准备扩图工作流..." });
    if (!workflow["562"]?.inputs || !workflow["595"]?.inputs || !workflow["576"]?.inputs || !workflow["591"]?.inputs) {
      throw new Error("Unsupported outpaint workflow: required nodes 562, 595, 576, or 591 were not found.");
    }

    workflow["562"].inputs.image = uploaded.name;
    if (payload.alphaMaskInput) {
      replaceWorkflowReference(workflow, "595", 0, "562", 0);
      replaceWorkflowReference(workflow, "595", 1, "562", 1);
    } else {
      workflow["595"].inputs.left = padding.left;
      workflow["595"].inputs.top = padding.top;
      workflow["595"].inputs.right = padding.right;
      workflow["595"].inputs.bottom = padding.bottom;
      workflow["595"].inputs.feathering = Number(payload.feathering || 100);
    }
    workflow["576"].inputs.seed = seed;
    workflow["591"].inputs.filename_prefix = `z_image_outpaint_${now()}`;
    if (workflow["566"]?.inputs) {
      workflow["566"].inputs.background_color = "#ffffff";
    }
    if (workflow["356"]?.inputs) {
      workflow["356"].inputs.temperature = 0.35;
      workflow["356"].inputs.text = [
        "你是一位专业的AI扩图提示词工程师。请只描述输入图中已经存在的主体、场景、色调、材质、光影和构图，用于向外延展画面。",
        "扩展区域必须自然延续原图，不要改变主体身份、服装颜色、材质和场景氛围。",
        "保持原图的浅色、柔和、干净基调，避免新增黑色衣物、大块深色阴影、暗背景、陌生人物、突兀头发或与原图不一致的物体。",
        "中文提示词，不要描述水印、文字、边框或无关符号，不需要总结，限制在500字以内。",
      ].join("\n");
    }
    if (workflow["566"]?.inputs && payload.scale_to_length) {
      workflow["566"].inputs.scale_to_length = Number(payload.scale_to_length);
    }

    updateWorkflowTask(taskId, { progress: 30, message: "正在提交 ComfyUI 扩图队列..." });
    const promptId = await comfyClient.submitPrompt(comfyUrl, workflow);
    updateWorkflowTask(taskId, {
      progress: 38,
      message: "ComfyUI 已接收扩图任务，正在处理...",
      prompt_id: promptId,
      seed,
      padding,
      input: uploaded.name,
    });

    const history = await comfyClient.waitForHistory(comfyUrl, promptId, (status) => updateWorkflowTask(taskId, {
      ...status,
      message: status.message || "ComfyUI 正在处理扩图，可能需要几分钟...",
    }));
    updateWorkflowTask(taskId, { progress: 94, message: "ComfyUI 已完成，正在保存扩图结果..." });
    const images = await comfyClient.saveHistoryImages(comfyUrl, history, `outpaint_${now()}_`, ["591"]);
    if (!images.length) throw new Error("ComfyUI completed, but no outpaint output image was found.");

    updateWorkflowTask(taskId, {
      status: "success",
      progress: 100,
      message: "扩图完成。",
      images,
      comfy: comfyUrl,
    });
  }

  function normalizeOutpaintPadding(payload) {
    const amount = Math.max(0, Math.min(2048, Number(payload.amount || 200)));
    const direction = String(payload.direction || "horizontal");
    const custom = {
      left: Number(payload.left || 0),
      top: Number(payload.top || 0),
      right: Number(payload.right || 0),
      bottom: Number(payload.bottom || 0),
    };
    if (direction === "custom") {
      return {
        left: normalizeOutpaintSide(custom.left),
        top: normalizeOutpaintSide(custom.top),
        right: normalizeOutpaintSide(custom.right),
        bottom: normalizeOutpaintSide(custom.bottom),
      };
    }
    const normalizedAmount = normalizeOutpaintSide(amount);
    if (direction === "left") return { left: normalizedAmount, top: 0, right: 0, bottom: 0 };
    if (direction === "right") return { left: 0, top: 0, right: normalizedAmount, bottom: 0 };
    if (direction === "top") return { left: 0, top: normalizedAmount, right: 0, bottom: 0 };
    if (direction === "bottom") return { left: 0, top: 0, right: 0, bottom: normalizedAmount };
    if (direction === "vertical") return { left: 0, top: normalizedAmount, right: 0, bottom: normalizedAmount };
    if (direction === "all") return { left: normalizedAmount, top: normalizedAmount, right: normalizedAmount, bottom: normalizedAmount };
    return { left: normalizedAmount, top: 0, right: normalizedAmount, bottom: 0 };
  }

  function normalizeOutpaintSide(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return Math.max(0, Math.min(2048, Math.round(number / 16) * 16));
  }

  function replaceWorkflowReference(value, fromNode, fromOutput, toNode, toOutput) {
    if (Array.isArray(value)) {
      if (value.length === 2 && String(value[0]) === String(fromNode) && Number(value[1]) === Number(fromOutput)) {
        value[0] = String(toNode);
        value[1] = Number(toOutput);
        return;
      }
      value.forEach((item) => replaceWorkflowReference(item, fromNode, fromOutput, toNode, toOutput));
      return;
    }
    if (!value || typeof value !== "object") return;
    Object.values(value).forEach((item) => replaceWorkflowReference(item, fromNode, fromOutput, toNode, toOutput));
  }

  function getUpscaleModelFactor(modelName) {
    const match = String(modelName || "").match(/(\d+(?:\.\d+)?)x/i);
    return match ? Number(match[1]) || 1 : 1;
  }

  function ensureTtpFinalResizeNode(workflow, finalLongEdge) {
    if (!workflow["32"]?.inputs || !workflow["33"]?.inputs || !finalLongEdge) return;
    workflow["34"] = {
      inputs: {
        aspect_ratio: "original",
        proportional_width: 1,
        proportional_height: 1,
        fit: "letterbox",
        method: "lanczos",
        round_to_multiple: "8",
        scale_to_side: "longest",
        scale_to_length: Math.max(64, Math.round(finalLongEdge)),
        background_color: "#000000",
        image: ["33", 0],
      },
      class_type: "LayerUtility: ImageScaleByAspectRatio V2",
      _meta: {
        title: "最终按长边收口",
      },
    };
    workflow["32"].inputs.images = ["34", 0];
  }

  return Object.freeze({
    handleUpscale,
    handleUpscaleStatus,
    runTask,
    getWorkflowFile,
    normalizeOutpaintPadding,
    makeUploadToken,
    makeUploadFilename,
    setWorkflowSeed,
  });
}

module.exports = { createComfyWorkflowTaskService };
