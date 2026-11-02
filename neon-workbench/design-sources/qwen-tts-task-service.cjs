"use strict";

const SPEAKERS = new Set(["Aiden", "Dylan", "Eric", "Ono_anna", "Ryan", "Serena", "Sohee", "Uncle_fu", "Vivian"]);
const BRANCHES = Object.freeze({
  clone: { ids: ["7", "157", "184", "188"], text: "157", generator: "184", output: "188", type: "FB_Qwen3TTSVoiceClone" },
  preset: { ids: ["153", "182", "189"], text: "153", generator: "182", output: "189", type: "FB_Qwen3TTSCustomVoice" },
  design: { ids: ["96", "152", "181", "191"], text: "96", generator: "181", output: "191", type: "FB_Qwen3TTSVoiceDesign" },
});
const AUDIO_EXTENSION = /\.(?:wav|mp3|flac|ogg|opus|m4a|aac|webm)$/i;

function safeRelativePath(value) {
  return typeof value === "string" && value.length > 0
    && !/[\\%\x00-\x1f\x7f:?#]/.test(value)
    && value.split("/").every(part => part && part !== "." && part !== "..");
}

function sameLink(value, id) {
  return Array.isArray(value) && value.length === 2 && value[0] === id && value[1] === 0;
}

function prepareQwenTtsWorkflow(source, { mode, text, speaker = "Ryan", instruct = "", referenceFilename } = {}) {
  if (!Object.hasOwn(BRANCHES, mode)) throw new Error("请选择有效的 Qwen-TTS 语音模式。");
  if (typeof text !== "string" || !text.trim()) throw new Error("请先填写需要朗读的文字。");
  if (typeof instruct !== "string") throw new Error("语音描述必须是文字。");
  if (text.length > 4096 || instruct.length > 4096) throw new Error("朗读文字和语音描述不能超过 4096 个字符。");
  if (mode === "design" && !instruct.trim()) throw new Error("请先填写音色设计描述。");
  if (mode === "preset" && !SPEAKERS.has(speaker)) throw new Error("请选择有效的预设音色。");
  if (mode === "clone" && (!safeRelativePath(referenceFilename) || !AUDIO_EXTENSION.test(referenceFilename))) throw new Error("请选择有效的参考音频文件。");
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("Qwen-TTS 工作流格式不正确。");

  const branch = BRANCHES[mode];
  const expectedTypes = { [branch.text]: "CR Text", [branch.generator]: branch.type, [branch.output]: "SaveAudioAdvanced", ...(mode === "clone" ? { "7": "LoadAudio" } : {}), ...(mode === "design" ? { "152": "CR Text" } : {}) };
  for (const id of branch.ids) {
    if (!source[id] || source[id].class_type !== expectedTypes[id] || !source[id].inputs || typeof source[id].inputs !== "object" || Array.isArray(source[id].inputs)) {
      throw new Error(`Qwen-TTS 工作流节点不完整或类型不匹配（${id}）。`);
    }
  }
  const generator = source[branch.generator].inputs;
  const output = source[branch.output].inputs;
  if (!Object.hasOwn(source[branch.text].inputs, "text")
    || !sameLink(generator[mode === "clone" ? "target_text" : "text"], branch.text)
    || !sameLink(output.audio, branch.generator)
    || !Object.hasOwn(output, "filename_prefix") || !Object.hasOwn(output, "format")
    || (mode === "clone" && (!Object.hasOwn(source["7"].inputs, "audio") || !Object.hasOwn(generator, "instruct") || !sameLink(generator.ref_audio, "7")))
    || (mode === "preset" && (!Object.hasOwn(generator, "speaker") || !Object.hasOwn(generator, "instruct")))
    || (mode === "design" && (!Object.hasOwn(source["152"].inputs, "text") || !sameLink(generator.instruct, "152")))) {
    throw new Error("Qwen-TTS 工作流字段或分支连接与原始模板不匹配。");
  }

  const prepared = Object.fromEntries(branch.ids.map(id => [id, structuredClone(source[id])]));
  prepared[branch.text].inputs.text = text;
  if (mode === "design") prepared["152"].inputs.text = instruct;
  else prepared[branch.generator].inputs.instruct = instruct;
  if (mode === "preset") prepared["182"].inputs.speaker = speaker;
  if (mode === "clone") prepared["7"].inputs.audio = referenceFilename;
  return prepared;
}

function validateReferenceUrl(value) {
  let decoded;
  try { decoded = typeof value === "string" ? decodeURIComponent(value) : ""; } catch { decoded = ""; }
  if (!decoded.startsWith("/output/") || !safeRelativePath(decoded.slice("/output/".length))
    || decoded.slice("/output/".length).includes("/") || !AUDIO_EXTENSION.test(decoded)) {
    throw new Error("参考音频必须是已上传到本工作台的有效音频文件。");
  }
}

async function operation(label, action) {
  try { return await action(); } catch (cause) {
    const error = new Error(`${label}失败：${cause?.message || "未知错误"}`, { cause });
    for (const key of ["code", "status", "statusCode", "promptId"]) {
      if (cause && Object.hasOwn(cause, key)) error[key] = cause[key];
    }
    throw error;
  }
}

function createQwenTtsTaskService({ workflow, comfyClient, persistAudio, readReferenceAudio } = {}) {
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) throw new TypeError("缺少 Qwen-TTS 工作流。");
  for (const method of ["normalizeUrl", "uploadFile", "submitPrompt", "waitForHistory", "downloadHistoryAudio"]) {
    if (typeof comfyClient?.[method] !== "function") throw new TypeError(`Qwen-TTS 缺少 ComfyUI 客户端方法（${method}）。`);
  }
  if (typeof persistAudio !== "function") throw new TypeError("Qwen-TTS 缺少音频保存服务。");
  if (typeof readReferenceAudio !== "function") throw new TypeError("Qwen-TTS 缺少参考音频权限读取服务。");
  return Object.freeze({
    async execute({ mode, text, speaker = "Ryan", instruct = "", referenceAudio, auth, onStatus } = {}) {
      // Validate all task fields before reference I/O; only the uploaded filename is replaced later.
      const prepared = prepareQwenTtsWorkflow(workflow, { mode, text, speaker, instruct, referenceFilename: mode === "clone" ? "reference.wav" : undefined });
      if (mode === "clone") validateReferenceUrl(referenceAudio);
      const comfyUrl = await operation("读取 ComfyUI 服务地址", () => comfyClient.normalizeUrl());
      if (mode === "clone") {
        const reference = await operation("读取参考音频", () => readReferenceAudio(auth, referenceAudio));
        if (!reference?.blob || typeof reference.filename !== "string" || !reference.filename) throw new Error("参考音频读取失败：没有可上传的音频文件。");
        const uploaded = await operation("上传参考音频", () => comfyClient.uploadFile(comfyUrl, reference));
        if (!safeRelativePath(uploaded?.name) || uploaded.name.includes("/") || !AUDIO_EXTENSION.test(uploaded.name)
          || (uploaded.subfolder !== undefined && uploaded.subfolder !== "" && !safeRelativePath(uploaded.subfolder))) {
          throw new Error("上传参考音频失败：ComfyUI 返回的文件路径无效。");
        }
        prepared["7"].inputs.audio = uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;
      }
      const promptId = await operation("提交 Qwen-TTS 语音任务", () => comfyClient.submitPrompt(comfyUrl, prepared));
      const history = await operation("读取 Qwen-TTS 原任务结果（未重新提交生成）", () => comfyClient.waitForHistory(comfyUrl, promptId, onStatus));
      const audio = await operation("下载 Qwen-TTS 原任务音频（未重新提交生成）", () => comfyClient.downloadHistoryAudio(comfyUrl, history, [BRANCHES[mode].output]));
      if (!audio?.data?.length || !audio.contentType) throw new Error("Qwen-TTS 已完成，但没有找到可保存的音频输出。");
      return operation("保存 Qwen-TTS 音频", () => persistAudio({ data: audio.data, contentType: audio.contentType, auth }));
    },
  });
}

module.exports = { prepareQwenTtsWorkflow, createQwenTtsTaskService };
