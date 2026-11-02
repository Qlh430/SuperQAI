"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { mediaReferenceKey, collectMediaReferences } = require("./canvas-media-references");
const { withMediaMutation } = require("./canvas-media-lifecycle");
function createCanvasMediaGcService({ outputDir, db, getCanvasStorage, thumbnailStore } = {}) {
  const root = path.resolve(outputDir);
  function rememberCandidates({ userId, candidates = [] }) {
    const key = "canvas_media_cleanup_pending:" + userId;
    const old = db.getSetting?.(key);
    db.setSetting?.(key, [...collectMediaReferences([...candidates, ...(Array.isArray(old) ? old : [])]).values()]);
  }
  async function captureBoard(boardId) { return getCanvasStorage().repository.invoke("gcBoardMediaReferences", { boardId }); }
  async function cleanupMedia({ userId, candidates = [] } = {}) {
    return withMediaMutation(async () => {
      const pendingKey = "canvas_media_cleanup_pending:" + userId;
      const pending = db.getSetting?.(pendingKey);
      const requested = [...collectMediaReferences([...candidates, ...(Array.isArray(pending) ? pending : [])]).values()];
      // Keep the candidates durable if filesystem or reference queries fail.
      db.setSetting?.(pendingKey, requested);
      if ((await fs.lstat(root)).isSymbolicLink()) throw new Error("媒体目录包含链接，已保留文件。");
      const storage = getCanvasStorage();
      const resources = db.listAllResources({ includeDeleted: true });
      const preserved = collectMediaReferences(await storage.repository.invoke("gcAllBoardMediaReferences", {}));
      if (storage.migrator?.listUnmigratedMediaReferences) {
        const excludedBoardIds = resources.filter(resource => resource.refType === "canvas" && resource.deletedAt).map(resource => resource.refId);
        collectMediaReferences(await storage.migrator.listUnmigratedMediaReferences({ excludedBoardIds }), preserved);
      } else if (storage.migrator?.listLegacySummaries?.().length) {
        throw new Error("存在尚未完成迁移的画布，已保留媒体，请稍后重试清理。");
      }
      for (const asset of db.listCuratedAssets()) {
        const resource = db.getResource(asset.resourceId);
        if (resource) collectMediaReferences(resource, preserved);
      }
      for (const resource of resources) {
        if (resource.deletedAt) continue;
        const hidden = resource.metadata?.historyHiddenFor?.includes(resource.ownerUserId);
        const history = !hidden && (resource.refType === "history_image" || resource.refType === "history_chat"
          || resource.refType === "output_media" && resource.metadata?.source === "generated");
        const share = db.getShareForResource?.(resource.id);
        const shared = share && share.visibility !== "private" && (!share.expiresAt || Date.parse(share.expiresAt) > Date.now());
        if (history || shared) collectMediaReferences(resource, preserved);
      }
      const deleted = [], retained = [];
      for (const [key, source] of collectMediaReferences(requested)) {
        const originals = resources.filter(resource => resource.refType === "output_media" && mediaReferenceKey(resource.refId) === key);
        if (!source.startsWith("/output/") || preserved.has(key) || !originals.length || originals.some(resource => resource.ownerUserId !== userId)) { retained.push(key); continue; }
        const file = path.resolve(root, key.slice(8));
        const relative = path.relative(root, file);
        if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("媒体路径越界，已保留文件。");
        // Reject every symlink/reparse alias, including a parent directory.
        let current = root;
        for (const part of relative.split(path.sep)) {
          current = path.join(current, part);
          try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error("媒体路径包含链接，已保留文件。"); }
          catch (error) { if (error.code !== "ENOENT") throw error; }
        }
        await fs.unlink(file).catch(error => { if (error.code !== "ENOENT") throw error; });
        // Tombstone all aliases of the original so registry sync cannot revive it.
        for (const resource of originals) if (!resource.deletedAt) db.deleteResource(resource.id);
        if (thumbnailStore?.removeCanonical) await thumbnailStore.removeCanonical(source);
        else if (thumbnailStore?.remove) await thumbnailStore.remove(source);
        deleted.push(key);
      }
      db.setSetting?.(pendingKey, []);
      return { deleted, retained };
    });
  }
  return { captureBoard, cleanupMedia, rememberCandidates };
}
module.exports = { createCanvasMediaGcService };
