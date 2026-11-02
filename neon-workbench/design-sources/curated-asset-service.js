"use strict";

const crypto = require("node:crypto");
const { withMediaMutation } = require("./canvas-media-lifecycle");
const { permissionCapabilities } = require("./resource-access");
const DEFAULT_CATEGORIES = Object.freeze([{ id: "roles", name: "角色" }, { id: "scenes", name: "场景" }, { id: "props", name: "道具" }, { id: "other", name: "其他" }]);
const MEDIA_KINDS = new Set(["image", "video", "audio"]);
const MIGRATION_KEY = "curated_assets_shared_migration_v1";

function assetError(code, message, statusCode = 400) { return Object.assign(new Error(message), { code, statusCode }); }
function requiredName(value) {
  const name = String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!name) throw assetError("invalid_asset_name", "请填写素材名称。");
  return name;
}
function safeOutputRef(value) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/output/") || /[?#]/.test(raw)) throw assetError("invalid_asset_media", "只能引用宿主保存的媒体文件。");
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch { throw assetError("invalid_asset_media", "媒体地址无效。"); }
  const parts = decoded.slice(8).split("/");
  if (parts.some(part => !part || part === "." || part === ".." || /[\\:\u0000-\u001f]/.test(part))) throw assetError("invalid_asset_media", "媒体地址无效。");
  return decoded;
}
function mediaUrl(resource) {
  const record = resource?.metadata?.record;
  const image = Array.isArray(record?.images) ? record.images.find(item => item?.savedUrl || item?.src || item?.url) : null;
  return String(resource?.metadata?.url || resource?.metadata?.localUrl || image?.savedUrl || image?.src || image?.url || record?.savedUrl || record?.url || (resource?.refType === "output_media" ? resource.refId : "") || "");
}
function mediaKind(resource) {
  if (MEDIA_KINDS.has(resource?.type)) return resource.type;
  const mime = String(resource?.metadata?.mimeType || "");
  return [...MEDIA_KINDS].find(kind => mime.startsWith(kind + "/")) || null;
}
function generatedDisplayName(resource, name) {
  const original = String(resource?.title || "");
  const generated = String(resource?.metadata?.generatedName || "");
  const value = String(name || "");
  if (original !== generated || value !== generated) return value;
  return generated.replace(/^BD_(image|video|audio)_(\d{5,})$/, "$1_$2");
}
function currentAsset(asset, nowMs = Date.now()) {
  return !asset.expiresAt || Date.parse(asset.expiresAt) > nowMs;
}
function curatedAssetCanRead(asset, userId, nowMs = Date.now()) {
  return asset.ownerUserId === userId || (currentAsset(asset, nowMs) && (asset.visibility === "all" || (asset.visibility === "users" && asset.userIds?.includes(userId))));
}

function createCuratedAssetService({ db, resourceAccess, resolveAuthorizedMedia = null, now = () => new Date() } = {}) {
  if (!db?.listCuratedAssets || !resourceAccess?.assertRead) throw new TypeError("Curated assets require a system database and resource access.");
  const nowMs = () => new Date(now()).getTime();
  function activeUser(userId) {
    const user = db.getUserById(userId);
    if (user?.status !== "active") throw assetError("unauthorized", "请先登录有效账户。", 401);
    return user;
  }
  function categories(userId) {
    let items = db.listCuratedCategories(userId);
    if (!items.length) {
      for (const item of DEFAULT_CATEGORIES) db.saveCuratedCategory(userId, { ...item });
      items = db.listCuratedCategories(userId);
    }
    return items;
  }
  function owned(userId, assetId) {
    activeUser(userId);
    const asset = db.getCuratedAsset(assetId);
    if (!asset) throw assetError("asset_not_found", "素材库条目不存在。", 404);
    if (asset.ownerUserId !== userId) throw assetError("forbidden", "只有素材库条目所有者可以修改。", 403);
    return asset;
  }
  function classification(userId, input = {}, previous = {}) {
    const categoryId = String(input.categoryId === undefined ? previous.categoryId || "other" : input.categoryId || "other");
    if (!categories(userId).some(item => item.id === categoryId)) throw assetError("category_not_found", "所选分类不存在。", 404);
    const folderId = input.folderId === undefined ? previous.folderId || null : input.folderId ? String(input.folderId) : null;
    if (folderId && !db.listCuratedFolders(userId).some(item => item.id === folderId && item.categoryId === categoryId)) throw assetError("folder_not_found", "所选文件夹不属于该分类。", 404);
    return { categoryId, folderId };
  }
  function entry(asset, userId) {
    const original = db.getResource(asset.resourceId);
    if (!original || original.deletedAt) throw assetError("asset_not_found", "素材文件不存在。", 404);
    const owner = db.getUserById(asset.ownerUserId);
    const permission = asset.ownerUserId === userId ? "owner" : "read";
    const url = mediaUrl(original);
    const kind = mediaKind(original);
    const name = generatedDisplayName(original, asset.name);
    return {
      resource: { ...original, title: name, metadata: { ...original.metadata, url } },
      access: { permission, capabilities: permissionCapabilities(permission), locked: false, share: { id: asset.id, resourceId: original.id, visibility: asset.visibility, userIds: [...(asset.userIds || [])], permission: "read", passwordProtected: false, expiresAt: asset.expiresAt || null } },
      preview: url && kind ? { kind, url, local: url.startsWith("/output/") } : null,
      asset: { ...asset, name, ownerDisplayName: owner?.displayName || owner?.username || "未知用户", permission },
    };
  }
  async function resolveMedia(userId, input) {
    let resource = null;
    if (input.resourceId) {
      const access = await resourceAccess.assertRead(userId, String(input.resourceId));
      resource = access.resource;
    }
    const url = resource ? mediaUrl(resource) : input.media?.url;
    const ref = safeOutputRef(url);
    const canonical = db.getResourceByRef("output_media", ref);
    if (canonical && !canonical.deletedAt) {
      try { await resourceAccess.assertRead(userId, canonical.id); resource = canonical; }
      catch (error) {
        if (!resolveAuthorizedMedia || !["forbidden", "share_password_required"].includes(error.code)) throw error;
        const authorized = await resolveAuthorizedMedia(userId, url);
        resource = authorized?.resource;
      }
    } else if (resolveAuthorizedMedia) {
      const authorized = await resolveAuthorizedMedia(userId, url);
      resource = authorized?.resource;
    } else throw assetError("asset_not_found", "媒体尚未由宿主保存或您没有访问权限。", 404);
    if (!resource || resource.deletedAt || resource.refType !== "output_media" || safeOutputRef(mediaUrl(resource)) !== ref || !mediaKind(resource)) throw assetError("invalid_asset_media", "该资源不是可添加的图片、视频或音频。");
    return resource;
  }
  let migrationPromise = null;
  async function migrateShared() {
    if (db.getSetting(MIGRATION_KEY)) return;
    for (const original of db.listAllResources()) {
      const share = db.getShareForResource(original.id);
      if (!mediaKind(original) || !share || !["all", "users"].includes(share.visibility) || (share.expiresAt && Date.parse(share.expiresAt) <= nowMs())) continue;
      if (db.getUserById(original.ownerUserId)?.status !== "active") continue;
      let resource;
      try { resource = await resolveMedia(original.ownerUserId, { resourceId: original.id }); }
      catch (error) { if (["invalid_asset_media", "asset_not_found", "resource_not_found", "not_found", "forbidden", "share_password_required"].includes(error.code)) continue; throw error; }
      if (db.listCuratedAssets().some(item => item.ownerUserId === original.ownerUserId && item.resourceId === resource.id)) continue;
      categories(original.ownerUserId);
      db.runInTransaction(() => {
        db.saveCuratedAsset({ id: crypto.randomUUID(), resourceId: resource.id, ownerUserId: original.ownerUserId, name: original.title || "共享素材", categoryId: "other", folderId: null, visibility: share.visibility, userIds: [...(share.userIds || [])], permission: "read", expiresAt: share.expiresAt || null, migratedFromShareId: share.id });
        // The library entry now owns this sharing policy. Keeping the old
        // media share would let raw URLs bypass a later revocation here.
        db.deleteShare(share.id);
      });
    }
    db.setSetting(MIGRATION_KEY, { completedAt: new Date(now()).toISOString() });
  }
  async function ensureMigration() {
    if (!migrationPromise) migrationPromise = withMediaMutation(migrateShared).catch(error => { migrationPromise = null; throw error; });
    await migrationPromise;
  }
  async function list(userId, query = {}) {
    activeUser(userId);
    await ensureMigration();
    const scope = String(query.scope || "mine");
    if (!["mine", "public", "shared"].includes(scope)) throw assetError("invalid_asset_scope", "素材库范围无效。");
    const search = String(query.search || query.query || "").trim().toLocaleLowerCase("zh-CN");
    const visible = db.listCuratedAssets().filter(asset => curatedAssetCanRead(asset, userId, nowMs()) && db.getResource(asset.resourceId) && !db.getResource(asset.resourceId).deletedAt && (scope === "mine" ? asset.ownerUserId === userId : scope === "public" ? asset.visibility === "all" : asset.ownerUserId !== userId && asset.visibility === "users"));
    const matched = visible.filter(asset => (!query.categoryId || asset.categoryId === query.categoryId) && (!query.folderId || asset.folderId === query.folderId) && (!search || `${generatedDisplayName(db.getResource(asset.resourceId), asset.name)}\n${db.getUserById(asset.ownerUserId)?.displayName || ""}`.toLocaleLowerCase("zh-CN").includes(search)) && (!query.kind || query.kind === "all" || mediaKind(db.getResource(asset.resourceId)) === query.kind));
    const ownerIds = new Set([userId, ...visible.map(asset => asset.ownerUserId)]);
    const categoryMap = new Map(), folderMap = new Map();
    for (const ownerId of ownerIds) {
      for (const item of categories(ownerId)) if (!categoryMap.has(item.id)) categoryMap.set(item.id, item);
      for (const item of db.listCuratedFolders(ownerId)) if (!folderMap.has(item.id)) folderMap.set(item.id, item);
    }
    return { entries: matched.sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) || a.id.localeCompare(b.id)).map(asset => entry(asset,userId)), categories: [...categoryMap.values()], folders: [...folderMap.values()] };
  }
  async function addUnlocked(userId, input = {}) {
    activeUser(userId);
    await ensureMigration();
    if (Array.isArray(input.items)) {
      if (!input.items.length || input.items.length > 100) throw assetError("invalid_asset_batch", "请选择 1 至 100 项素材。");
      const prepared = [];
      for (const item of input.items) { const resource = await resolveMedia(userId,item); prepared.push({ resource, name: requiredName(item.name || resource.title), ...classification(userId,item) }); }
      return db.runInTransaction(() => {
        const results = prepared.map(item => saveAddition(userId,item));
        return { entry: results[0].entry, entries: results.map(item => item.entry), duplicateCount: results.filter(item=>item.duplicate).length, duplicate: results.every(item=>item.duplicate) };
      });
    }
    const resource = await resolveMedia(userId,input);
    const prepared = { resource, name: requiredName(input.name || resource.title), ...classification(userId,input) };
    return db.runInTransaction(() => saveAddition(userId,prepared));
  }
  function saveAddition(userId, input) {
    if (input.resource.ownerUserId === userId && input.resource.title !== input.name) db.updateResource(input.resource.id, { title: input.name });
    const existing = db.listCuratedAssets().find(item => item.ownerUserId === userId && item.resourceId === input.resource.id);
    if (existing) {
      const updated = db.saveCuratedAsset({ ...existing, name: input.name, categoryId: input.categoryId, folderId: input.folderId });
      return { entry: entry(updated,userId), duplicate: true, duplicateCount: 1 };
    }
    const asset = db.saveCuratedAsset({ id: crypto.randomUUID(), resourceId: input.resource.id, name: input.name, ownerUserId: userId, categoryId: input.categoryId, folderId: input.folderId, visibility: "private", userIds: [], permission: "read" });
    return { entry: entry(asset,userId), duplicate: false, duplicateCount: 0 };
  }
  async function add(userId, input = {}) {
    await ensureMigration();
    return withMediaMutation(() => addUnlocked(userId, input));
  }
  async function update(userId, assetId, input = {}) {
    const asset = owned(userId,assetId);
    const changes = { ...classification(userId,input,asset), name: input.name === undefined ? asset.name : requiredName(input.name) };
    const saved = db.runInTransaction(() => {
      const resource = db.getResource(asset.resourceId);
      // A shared reader owns their library alias, never the source's name.
      if (input.name !== undefined && resource?.ownerUserId === userId) db.updateResource(resource.id, { title: changes.name });
      return db.saveCuratedAsset({ ...asset, ...changes });
    });
    return { entry: entry(saved,userId) };
  }
  async function remove(userId,assetId) { owned(userId,assetId); return { deleted: db.deleteCuratedAsset(assetId) }; }
  async function share(userId,assetId,input = {}) {
    const asset = owned(userId,assetId);
    const visibility = String(input.visibility || "private");
    if (!["private","all","users"].includes(visibility)) throw assetError("invalid_asset_visibility", "共享范围无效。");
    const userIds = visibility === "users" ? [...new Set((Array.isArray(input.userIds) ? input.userIds : []).map(String).filter(Boolean))] : [];
    if (visibility === "users" && (!userIds.length || userIds.some(id => db.getUserById(id)?.status !== "active"))) throw assetError("invalid_share_member", "请选择有效的共享账户。");
    const saved = db.saveCuratedAsset({ ...asset, visibility, userIds, expiresAt: null, permission: "read" });
    return { entry: entry(saved,userId) };
  }
  async function hideHistory(userId,resourceId) {
    activeUser(userId);
    const resource = db.getResource(resourceId);
    if (!resource || resource.deletedAt) throw assetError("resource_not_found", "历史记录不存在。", 404);
    if (resource.ownerUserId !== userId) throw assetError("forbidden", "只能移除自己的历史记录。", 403);
    const metadata = { ...resource.metadata, historyHiddenFor: [...new Set([...(Array.isArray(resource.metadata?.historyHiddenFor) ? resource.metadata.historyHiddenFor : []), userId])] };
    db.updateResource(resource.id,{metadata});
    return { deleted: true, hidden: true };
  }
  async function hideHistoryMedia(userId,input = {}) {
    activeUser(userId);
    const resource = await resolveMedia(userId,input);
    return hideHistory(userId,resource.id);
  }
  async function createCategory(userId,input = {}) { activeUser(userId); categories(userId); return db.saveCuratedCategory(userId,{id:crypto.randomUUID(),name:requiredName(input.name)}); }
  async function updateCategory(userId,id,input = {}) {
    activeUser(userId); const current = categories(userId).find(item=>item.id===id);
    if (!current) throw assetError("category_not_found", "分类不存在。",404);
    return db.saveCuratedCategory(userId,{...current,name:requiredName(input.name)});
  }
  async function deleteCategory(userId,id) {
    activeUser(userId);
    if (DEFAULT_CATEGORIES.some(item=>item.id===id)) throw assetError("protected_category", "默认分类不能删除。");
    if (!categories(userId).some(item=>item.id===id)) throw assetError("category_not_found", "分类不存在。",404);
    return db.runInTransaction(()=>{
      for (const asset of db.listCuratedAssets()) if (asset.ownerUserId===userId && asset.categoryId===id) db.saveCuratedAsset({...asset,categoryId:"other",folderId:null});
      for (const folder of db.listCuratedFolders(userId)) if (folder.categoryId===id) db.deleteCuratedFolder(userId,folder.id);
      return {deleted:db.deleteCuratedCategory(userId,id)};
    });
  }
  async function createFolder(userId,input = {}) {
    activeUser(userId); const {categoryId} = classification(userId,{categoryId:input.categoryId});
    const parentId = input.parentId ? String(input.parentId) : null;
    if (parentId && !db.listCuratedFolders(userId).some(item=>item.id===parentId && item.categoryId===categoryId)) throw assetError("folder_not_found", "上级文件夹不存在。",404);
    return db.saveCuratedFolder(userId,{id:crypto.randomUUID(),name:requiredName(input.name),categoryId,...(parentId?{parentId}:{})});
  }
  async function updateFolder(userId,id,input = {}) {
    activeUser(userId); const folders = db.listCuratedFolders(userId), current = folders.find(item=>item.id===id);
    if (!current) throw assetError("folder_not_found", "文件夹不存在。",404);
    const name = input.name===undefined ? current.name : requiredName(input.name);
    const categoryId = input.categoryId===undefined ? current.categoryId : classification(userId,{categoryId:input.categoryId}).categoryId;
    const parentId = input.parentId===undefined ? current.parentId : input.parentId ? String(input.parentId) : null;
    let ancestor = parentId;
    const visited = new Set([id]);
    while (ancestor) {
      if (visited.has(ancestor)) throw assetError("invalid_folder_parent", "文件夹不能包含自己。");
      visited.add(ancestor); const parent = folders.find(item=>item.id===ancestor && item.categoryId===categoryId);
      if (!parent) throw assetError("folder_not_found", "上级文件夹不存在。",404);
      ancestor = parent.parentId;
    }
    if (categoryId!==current.categoryId && folders.some(item=>item.parentId===id)) throw assetError("folder_not_empty", "请先移动该文件夹中的子文件夹。",409);
    return db.runInTransaction(()=>{
      for (const asset of db.listCuratedAssets()) if (asset.ownerUserId===userId && asset.folderId===id) db.saveCuratedAsset({...asset,categoryId});
      return db.saveCuratedFolder(userId,{...current,name,categoryId,parentId:parentId || null});
    });
  }
  async function deleteFolder(userId,id) {
    activeUser(userId); const folders = db.listCuratedFolders(userId);
    if (!folders.some(item=>item.id===id)) throw assetError("folder_not_found", "文件夹不存在。",404);
    const ids = new Set([id]); let changed = true;
    while(changed) { changed = false; for(const folder of folders) if(ids.has(folder.parentId) && !ids.has(folder.id)){ids.add(folder.id);changed=true;} }
    return db.runInTransaction(()=>{
      for (const asset of db.listCuratedAssets()) if(asset.ownerUserId===userId && ids.has(asset.folderId)) db.saveCuratedAsset({...asset,folderId:null});
      for (const folderId of ids) db.deleteCuratedFolder(userId,folderId);
      return {deleted:true};
    });
  }
  return Object.freeze({list,add,update,remove,share,hideHistory,hideHistoryMedia,createCategory,updateCategory,deleteCategory,createFolder,updateFolder,deleteFolder});
}
module.exports = { DEFAULT_CATEGORIES, safeOutputRef, curatedAssetCanRead, createCuratedAssetService };
