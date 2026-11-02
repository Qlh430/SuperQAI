"use strict";

const ERROR_TEXT = {
  forbidden: "您没有访问或修改该素材的权限。",
  not_authenticated: "请先登录有效账户。",
  resource_not_found: "素材文件不存在。",
  share_password_required: "请先解锁该共享资源。",
  invalid_input: "提交的数据无效，请检查后重试。",
};
function createCuratedAssetHttpApi({ curatedAssets, readJson, sendJson } = {}) {
  if (!curatedAssets?.list || typeof readJson !== "function" || typeof sendJson !== "function") throw new TypeError("Curated asset HTTP API requires service and HTTP helpers.");
  async function handle(req,res) {
    let url;
    try { url = new URL(req?.url || "/",`http://${req?.headers?.host || "localhost"}`); } catch { return false; }
    if (url.pathname !== "/api/asset-library" && !url.pathname.startsWith("/api/asset-library/")) return false;
    const userId = req?.auth?.user?.id;
    if (!userId) { sendJson(res,401,{error:"请先登录。",code:"unauthorized"}); return true; }
    try {
      const parts = url.pathname.split("/").filter(Boolean).map(part => decodeURIComponent(part));
      const segment = parts[2] || "", action = parts[3] || "";
      if (!segment && req.method === "GET") {
        const query = Object.fromEntries(["scope","search","query","kind","categoryId","folderId"].map(key=>[key,url.searchParams.get(key) || ""]));
        sendJson(res,200,await curatedAssets.list(userId,query),{"Cache-Control":"no-store"});
        return true;
      }
      if (!segment && req.method === "POST") { sendJson(res,201,await curatedAssets.add(userId,await readJson(req))); return true; }
      if (segment === "history" && action === "hide" && parts.length === 4 && req.method === "POST") { sendJson(res,200,await curatedAssets.hideHistoryMedia(userId,await readJson(req))); return true; }
      if (segment === "history" && action && parts.length === 4 && req.method === "DELETE") { sendJson(res,200,await curatedAssets.hideHistory(userId,action)); return true; }
      if (["categories","folders"].includes(segment)) {
        const singular = segment === "categories" ? "category" : "folder";
        const suffix = segment === "categories" ? "Category" : "Folder";
        if (!action && req.method === "GET") { const result = await curatedAssets.list(userId); sendJson(res,200,{[segment]:result[segment]},{"Cache-Control":"no-store"}); return true; }
        if (!action && req.method === "POST") { sendJson(res,201,{[singular]:await curatedAssets["create"+suffix](userId,await readJson(req))}); return true; }
        if (action && parts.length === 4 && req.method === "PATCH") { sendJson(res,200,{[singular]:await curatedAssets["update"+suffix](userId,action,await readJson(req))}); return true; }
        if (action && parts.length === 4 && req.method === "DELETE") { sendJson(res,200,await curatedAssets["delete"+suffix](userId,action)); return true; }
      } else if (segment) {
        if (action === "share" && parts.length === 4 && req.method === "PATCH") { sendJson(res,200,await curatedAssets.share(userId,segment,await readJson(req))); return true; }
        if (!action && req.method === "PATCH") { sendJson(res,200,await curatedAssets.update(userId,segment,await readJson(req))); return true; }
        if (!action && req.method === "DELETE") { sendJson(res,200,await curatedAssets.remove(userId,segment)); return true; }
      }
      sendJson(res,404,{error:"素材库接口不存在。",code:"not_found"});
    } catch(error) {
      const status = error.statusCode || (error.code === "invalid_input" || error instanceof URIError ? 400 : 500);
      const message = ERROR_TEXT[error.code] || (/[\u4e00-\u9fff]/.test(String(error.message)) ? error.message : "素材库请求失败，请稍后重试。");
      sendJson(res,status,{error:message,code:error.code || "asset_library_failed"});
    }
    return true;
  }
  return Object.freeze({handle});
}
module.exports = {createCuratedAssetHttpApi};
