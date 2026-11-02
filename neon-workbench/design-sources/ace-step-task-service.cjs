"use strict";

const REQUIRED_NODES = Object.freeze({
  "94": ["tags", "lyrics", "duration", "bpm", "keyscale"],
  "98": ["seconds"],
  "107": ["filename_prefix"],
});

function positiveInteger(value, label, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > max) throw new Error(`${label}必须是 1 到 ${max} 之间的整数。`);
  return number;
}

function prepareAceStepWorkflow(source, { tags, lyrics, duration = 120, bpm = 95, keyscale = "E minor" } = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("ACE-Step 工作流格式不正确。");
  const workflow = structuredClone(source);
  for (const [id, fields] of Object.entries(REQUIRED_NODES)) {
    const node = workflow[id];
    if (!node || !node.inputs || fields.some(field => !Object.hasOwn(node.inputs, field))) throw new Error(`ACE-Step 工作流节点不完整（${id}）。`);
  }
  if (workflow["94"].class_type !== "TextEncodeAceStepAudio1.5"
    || workflow["98"].class_type !== "EmptyAceStep1.5LatentAudio"
    || workflow["107"].class_type !== "SaveAudioMP3") throw new Error("ACE-Step 工作流节点类型与已确认的工作流不匹配。");

  const musicTags = String(tags || "").trim();
  const lyricText = String(lyrics || "");
  const scale = String(keyscale || "").trim();
  if (!musicTags) throw new Error("请先填写音乐类型、情绪或乐器提示词。");
  if (musicTags.length > 4096 || lyricText.length > 4096) throw new Error("音乐提示词和歌词不能超过 4096 个字符。");
  if (!scale || scale.length > 40) throw new Error("请选择有效的调式。");
  const seconds = positiveInteger(duration, "时长", 300);
  const tempo = positiveInteger(bpm, "BPM", 300);
  workflow["94"].inputs.tags = musicTags;
  workflow["94"].inputs.lyrics = lyricText;
  workflow["94"].inputs.duration = seconds;
  workflow["94"].inputs.bpm = tempo;
  workflow["94"].inputs.keyscale = scale;
  workflow["98"].inputs.seconds = seconds;
  return workflow;
}

function createAceStepTaskService({ workflow, comfyClient, persistAudio } = {}) {
  if (!workflow || typeof workflow !== "object") throw new TypeError("ACE-Step workflow is required.");
  if (!comfyClient?.normalizeUrl || !comfyClient?.submitPrompt || !comfyClient?.waitForHistory || !comfyClient?.downloadHistoryAudio) throw new TypeError("ACE-Step requires the ComfyUI prompt, history, and audio methods.");
  if (typeof persistAudio !== "function") throw new TypeError("ACE-Step requires the existing audio persistence function.");
  return Object.freeze({
    async execute({ tags, lyrics = "", duration = 120, bpm = 95, keyscale = "E minor", auth, onStatus } = {}) {
      const prepared = prepareAceStepWorkflow(workflow, { tags, lyrics, duration, bpm, keyscale });
      const comfyUrl = comfyClient.normalizeUrl();
      const promptId = await comfyClient.submitPrompt(comfyUrl, prepared);
      const history = await comfyClient.waitForHistory(comfyUrl, promptId, onStatus);
      const audio = await comfyClient.downloadHistoryAudio(comfyUrl, history, ["107"]);
      if (!audio?.data?.length || !audio.contentType) throw new Error("ACE-Step 已完成，但没有找到可保存的音频输出。");
      return persistAudio({ ...audio, auth });
    },
  });
}

module.exports = { prepareAceStepWorkflow, createAceStepTaskService };
