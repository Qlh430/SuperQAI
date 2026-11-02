"use strict";

/**
 * 文件与共享：资源缩略图解析。
 *
 * 资源行本身只存 type / refType / refId / metadata，缩略图要从各自的来路里
 * 找：生图历史存的是 record.images，输出媒体存的是 metadata.url，图片任务
 * 存的是 result.saved_images，无限画布则要从画布元数据里取预览图。
 *
 * 这里是纯逻辑：调用方把已经批量取好的任务表和画布预览表传进来，解析过程
 * 不碰数据库也不碰磁盘，方便在 Node 里直接检查。
 */

const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i;
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|m4v|mkv)$/i;
const AUDIO_EXTENSIONS = /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i;

function text(value) {
  return String(value ?? "").trim();
}

function extensionOf(url) {
  return text(url).split("?")[0].split("#")[0];
}

/** "image" / "video" / "" for a media url, preferring a declared mime type. */
function mediaKind(url, mimeType = "") {
  const mime = text(mimeType).toLowerCase();
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  const path = extensionOf(url);
  if (VIDEO_EXTENSIONS.test(path)) return "video";
  if (IMAGE_EXTENSIONS.test(path)) return "image";
  if (AUDIO_EXTENSIONS.test(path)) return "audio";
  return "";
}

/** First displayable image of a saved 生图历史 record. */
function imageRecordSource(record) {
  if (!record || typeof record !== "object") return "";
  const images = Array.isArray(record.images) ? record.images : [];
  for (const image of images) {
    const url = text(image?.src || image?.savedUrl || image?.url);
    if (url) return url;
  }
  return text(record.url || record.savedUrl || record.thumbnailUrl);
}

/** First saved image of an image generation job. */
function jobResultSource(job) {
  if (!job || typeof job !== "object") return "";
  const saved = Array.isArray(job.result?.saved_images) ? job.result.saved_images : [];
  for (const item of saved) {
    const url = text(item?.url || item?.src || item?.local_url);
    if (url) return url;
  }
  const data = Array.isArray(job.result?.data) ? job.result.data : [];
  for (const item of data) {
    const url = text(item?.local_url || item?.url || item?.src);
    if (url) return url;
  }
  return "";
}

/** First preview image of a canvas board meta row. */
function boardPreviewSource(board) {
  if (!board) return "";
  const candidates = Array.isArray(board)
    ? board
    : Array.isArray(board.previewImages)
      ? board.previewImages
      : [board.previewImage];
  for (const candidate of candidates) {
    const url = text(candidate);
    if (url) return url;
  }
  return "";
}

function lookup(container, key) {
  if (!container || !key) return null;
  if (typeof container.get === "function") return container.get(key) || null;
  if (typeof container === "object" && Object.prototype.hasOwnProperty.call(container, key)) return container[key];
  return null;
}

/**
 * 卡片上的规模信息：目前只有画布有话说——仓库的 listBoards() 本来就带
 * nodeCount / connectionCount，正好拿来标在卡片上，不必再查一次库。
 *
 * 画布之外的类型没有稳定的"规模"概念，一律返回 null，前端就不显示。
 */
function resolveResourceStats(resource, { boards = null } = {}) {
  if (!resource || typeof resource !== "object" || resource.deletedAt) return null;
  if (text(resource.refType) !== "canvas") return null;
  const board = lookup(boards, text(resource.refId));
  if (!board) return null;
  const nodeCount = Number(board.nodeCount);
  if (!Number.isFinite(nodeCount) || nodeCount < 0) return null;
  const connectionCount = Number(board.connectionCount);
  return {
    nodeCount,
    connectionCount: Number.isFinite(connectionCount) && connectionCount > 0 ? connectionCount : 0,
  };
}

/**
 * Preview for one resource row.
 *
 * Returns `{ kind, url, local }` or null. `local` marks same-origin media, which
 * is what the client can safely push through the WebP thumbnail pipeline.
 * Password locked resources get no preview: the caller never unlocks them.
 */
function resolveResourcePreview(resource, { jobs = null, boards = null } = {}) {
  if (!resource || typeof resource !== "object" || resource.deletedAt) return null;
  const refType = text(resource.refType);
  const refId = text(resource.refId);
  const metadata = resource.metadata && typeof resource.metadata === "object" ? resource.metadata : {};
  let url = "";
  let kind = "";

  if (refType === "history_image") {
    url = imageRecordSource(metadata.record);
    kind = url ? "image" : "";
  } else if (refType === "history_chat") {
    // A conversation has no picture of its own.
    return null;
  } else if (refType === "image_job") {
    url = jobResultSource(lookup(jobs, refId));
    kind = url ? "image" : "";
  } else if (refType === "canvas") {
    url = boardPreviewSource(lookup(boards, refId));
    kind = url ? "image" : "";
  }

  if (!url) {
    // 输出媒体（生图 / 视频）与素材把地址直接写在 metadata 上。
    url = text(metadata.thumbnailUrl || metadata.url || metadata.localUrl);
    if (!url && (refType === "output_media" || resource.type === "video")) url = refId;
    if (url) kind = mediaKind(url, metadata.mimeType) || kind || "image";
  }

  if (!url || !kind || kind === "audio") return null;
  return { kind, url, local: url.startsWith("/") && !url.startsWith("//") };
}

module.exports = {
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  AUDIO_EXTENSIONS,
  mediaKind,
  imageRecordSource,
  jobResultSource,
  boardPreviewSource,
  resolveResourcePreview,
  resolveResourceStats,
};
