(function () {
  "use strict";

  const state = {
    session: null,
    users: [],
    resources: [],
    selectedUserId: "",
    editingDisplayNameId: "",
    resourceFilter: "all",
    temporaryPasswords: new Map(),
    initialized: false,
  };

  const elements = {};

  function collectElements() {
    elements.accountList = document.querySelector("#aiOsAccountList");
    elements.accountCount = document.querySelector("#aiOsAccountCount");
    elements.accountSearch = document.querySelector("#aiOsAccountSearch");
    elements.accountDetail = document.querySelector("#aiOsAccountDetail");
    elements.accountDialog = document.querySelector("#aiOsAccountDialog");
    elements.accountForm = document.querySelector("#aiOsAccountForm");
    elements.shareDialog = document.querySelector("#aiOsShareDialog");
    elements.shareForm = document.querySelector("#aiOsShareForm");
    elements.shareUnlockDialog = document.querySelector("#aiOsShareUnlockDialog");
    elements.shareUnlockForm = document.querySelector("#aiOsShareUnlockForm");
    elements.resourceGrid = document.querySelector("#aiOsResourceGrid");
    elements.resourceCount = document.querySelector("#aiOsResourceCount");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function toast(message) {
    if (window.AiOsDesktop?.toast) window.AiOsDesktop.toast(message);
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    let body = options.body;
    if (body && typeof body !== "string") {
      headers["content-type"] = "application/json";
      body = JSON.stringify(body);
    }
    const response = await fetch(path, { ...options, headers, body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `请求失败（${response.status}）`);
      error.code = data.code;
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function loadUsers() {
    const isSuperAdmin = state.session?.user?.role === "superadmin";
    const data = await api(isSuperAdmin ? "/api/admin/users" : "/api/users/directory");
    state.users = Array.isArray(data.users) ? data.users : [];
    if (isSuperAdmin) {
      if (!state.selectedUserId || !state.users.some((user) => user.id === state.selectedUserId)) {
        state.selectedUserId = state.users[0]?.id || "";
      }
      renderAccounts();
    }
  }

  function roleLabel(user) {
    return user.role === "superadmin" ? "超级管理员" : "普通用户";
  }

  function renderAccounts() {
    if (!elements.accountList) return;
    const query = String(elements.accountSearch?.value || "").trim().toLowerCase();
    const users = state.users.filter((user) => !query || `${user.username} ${user.displayName}`.toLowerCase().includes(query));
    elements.accountCount.textContent = `${state.users.length} 位用户`;
    elements.accountList.innerHTML = users.map((user) => `
      <button class="ai-os-account-item ${user.id === state.selectedUserId ? "active" : ""}" type="button" data-account-id="${escapeHtml(user.id)}">
        <span class="ai-os-account-avatar">${escapeHtml((user.displayName || user.username || "U").slice(0, 1).toUpperCase())}</span>
        <span><strong>${escapeHtml(user.displayName || user.username)}</strong><small>${escapeHtml(roleLabel(user))} · ${user.status === "active" ? "可登录" : "已停用"}</small></span>
      </button>
    `).join("") || '<div class="ai-os-empty-state"><p>没有匹配的账号</p></div>';
    renderAccountDetail();
  }

  function renderAccountDetail() {
    if (!elements.accountDetail) return;
    const user = state.users.find((item) => item.id === state.selectedUserId);
    if (!user) {
      elements.accountDetail.innerHTML = '<div class="ai-os-empty-detail"><span>●</span><h2>选择一个账号</h2><p>查看账号状态并管理登录权限。</p></div>';
      return;
    }
    const temporaryPassword = state.temporaryPasswords.get(user.id);
    const editingName = state.editingDisplayNameId === user.id;
    elements.accountDetail.innerHTML = `
      <article class="ai-os-account-profile">
        <header class="ai-os-account-hero">
          <span class="ai-os-account-avatar">${escapeHtml((user.displayName || user.username).slice(0, 1).toUpperCase())}</span>
          <div><h2>${escapeHtml(user.displayName || user.username)}</h2><p>${escapeHtml(roleLabel(user))} · ${user.status === "active" ? "可登录" : "已停用"}</p></div>
        </header>
        ${temporaryPassword ? `<div class="ai-os-temporary-password"><strong>临时密码（仅显示这一次）</strong><code>${escapeHtml(temporaryPassword)}</code><button type="button" data-copy-password="${escapeHtml(temporaryPassword)}">复制</button></div>` : ""}
        <div class="ai-os-account-fields">
          <div class="ai-os-account-field"><span>登录账号</span><strong>${escapeHtml(user.username)}</strong></div>
          <div class="ai-os-account-field ai-os-account-field-editable">
            <span>显示名称</span>
            ${editingName
              ? `<form class="ai-os-account-name-form" data-account-name-form="${escapeHtml(user.id)}">
                   <input type="text" name="displayName" maxlength="24" autocomplete="off" aria-label="显示名称" value="${escapeHtml(user.displayName || user.username)}" />
                   <button type="button" data-account-action="save-name" data-account-id="${escapeHtml(user.id)}">保存</button>
                   <button type="button" data-account-action="cancel-name" data-account-id="${escapeHtml(user.id)}">取消</button>
                 </form>`
              : `<strong>${escapeHtml(user.displayName)}</strong><button type="button" class="ai-os-account-field-edit" data-account-action="edit-name" data-account-id="${escapeHtml(user.id)}">修改</button>`}
          </div>
          <div class="ai-os-account-field"><span>角色</span><strong>${escapeHtml(roleLabel(user))}</strong></div>
          <div class="ai-os-account-field"><span>首次改密</span><strong>${user.mustChangePassword ? "需要" : "已完成"}</strong></div>
          <div class="ai-os-account-field"><span>最近登录</span><strong>${user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("zh-CN") : "尚未登录"}</strong></div>
        </div>
        <div class="ai-os-account-controls">
          <button type="button" data-account-action="reset" data-account-id="${escapeHtml(user.id)}">重置密码</button>
          <button type="button" data-account-action="revoke" data-account-id="${escapeHtml(user.id)}">退出所有设备</button>
          ${user.role === "superadmin" ? "" : `<button class="${user.status === "active" ? "danger" : ""}" type="button" data-account-action="toggle" data-account-id="${escapeHtml(user.id)}">${user.status === "active" ? "停用账号" : "恢复账号"}</button>`}
        </div>
      </article>`;
  }

  async function loadResources() {
    if (!state.session) return;
    const data = await api("/api/resources");
    state.resources = Array.isArray(data.resources) ? data.resources : [];
    renderResources();
  }

  function resourceTypeLabel(type) {
    return ({ canvas: "无限画布", image: "图片", chat: "对话", video: "视频", audio: "音频", file: "文件", job: "生成任务" })[type] || "文件";
  }

  function resourceIcon(type) {
    return ({ canvas: "workflow", image: "image", chat: "message-square", video: "play-circle", audio: "audio-lines", file: "file", job: "hourglass" })[type] || "file";
  }

  function filterResources(resources, filter = "all", currentUserId = state.session?.user?.id) {
    return (Array.isArray(resources) ? resources : []).filter(({ resource }) => {
      if (filter === "owned") return resource.ownerUserId === currentUserId;
      if (filter === "shared") return resource.ownerUserId !== currentUserId;
      if (["canvas", "image", "video", "audio", "chat"].includes(filter)) return resource.type === filter;
      return true;
    });
  }

  function summarizeResources(resources, currentUserId = state.session?.user?.id) {
    const list = Array.isArray(resources) ? resources : [];
    const summary = { all: list.length, owned: 0, shared: 0, canvas: 0, image: 0, video: 0, audio: 0, chat: 0 };
    list.forEach(({ resource }) => {
      const owned = resource?.ownerUserId === currentUserId;
      summary[owned ? "owned" : "shared"] += 1;
      if (Object.prototype.hasOwnProperty.call(summary, resource?.type)) summary[resource.type] += 1;
    });
    return summary;
  }

  function permissionLabel(permission) {
    // 「可评论」「可复制」已经从面板里下架（后端没有对应的判定点），但历史共享行里
    // 可能还留着这两个值，列表上仍要给出中文，别把 comment 这种英文原样丢给用户。
    return ({ owner: "所有者", read: "可查看", comment: "可评论", edit: "可编辑", copy: "可复制" })[permission] || "可查看";
  }

  // 现在真正生效的权限只有两个：只读（能被 assertWrite 拦下）和可编辑。历史数据里的
  // comment / copy 在行为上和只读完全一样，所以打开面板时直接按只读回显。
  const SHARE_PERMISSION_OPTIONS = ["read", "edit"];
  function normalizeSharePermission(permission) {
    const value = String(permission || "");
    return SHARE_PERMISSION_OPTIONS.includes(value) ? value : "read";
  }

  /**
   * 卡片第二行的信息，用 · 串起来。
   *
   * 画布多一段"几个节点"：仓库的 listBoards() 本来就带了 nodeCount，顺手标出来，
   * 空的画布也能一眼看出是空的（这正好解释了为什么它没有封面图）。
   */
  function resourceMetaLabel(entry, owned) {
    const resource = entry?.resource || {};
    const access = entry?.access || {};
    const segments = [resourceTypeLabel(resource.type)];
    if (resource.type === "canvas" && !access.locked) {
      const nodeCount = Number(entry?.stats?.nodeCount);
      if (Number.isFinite(nodeCount) && nodeCount >= 0) segments.push(`${nodeCount} 个节点`);
    }
    const visibility = access.share?.visibility || "private";
    const visibilityLabel = ({ private: "仅自己", all: "所有账号", users: "指定账号", password: "口令" })[visibility] || "仅自己";
    segments.push(access.locked ? "口令保护" : owned ? visibilityLabel : `与我共享 · ${permissionLabel(access.permission)}`);
    return segments.join(" · ");
  }

  function renderResourceCard(entry, currentUserId = state.session?.user?.id) {
    const resource = entry?.resource || {};
    const access = entry?.access || {};
    const owned = resource.ownerUserId === currentUserId;
    return `
      <article class="ai-os-resource-card" data-resource-id="${escapeHtml(resource.id)}" data-resource-owner="${owned ? "owner" : "shared"}">
        ${renderResourcePreview(entry)}
        <h3 title="${escapeHtml(resource.title)}">${escapeHtml(resource.title)}</h3>
        <p>${escapeHtml(resourceMetaLabel(entry, owned))}</p>
        <div class="ai-os-resource-actions">
          <button type="button" data-open-resource="${escapeHtml(resource.id)}">${access.locked ? "解锁" : "打开"}</button>
          ${owned ? `<button type="button" data-share-resource="${escapeHtml(resource.id)}">共享…</button>` : ""}
        </div>
      </article>`;
  }

  /**
   * 预览区：有缩略图就放图，没有就退回类型图标。
   *
   * The media element is rendered empty on purpose: the address rides on
   * `data-resource-preview-src` and is handed to the shared image resource
   * manager afterwards, so cards only fetch what scrolls into view and local
   * 4K originals go through the existing WebP thumbnail pipeline.
   */
  function renderResourcePreview(entry) {
    const resource = entry?.resource || {};
    const preview = entry?.preview || null;
    // 图标外面套一层：lucide 渲染时会把 i 换成 svg，类名要留在外层才不会被换掉。
    const icon = `<span class="ai-os-resource-fallback"><i data-lucide="${resourceIcon(resource.type)}"></i></span>`;
    const shell = (inner, extra = "") => `<div class="ai-os-resource-preview" data-resource-type="${escapeHtml(String(resource.type || ""))}"${extra}>${inner}${icon}</div>`;
    if (!preview?.url || !["image", "video"].includes(preview.kind) || entry?.access?.locked) return shell("");
    const source = escapeHtml(preview.url);
    if (preview.kind === "video") {
      return shell(
        `<video class="ai-os-resource-thumb is-video" data-resource-preview-video="${source}" muted playsinline preload="metadata"></video>`,
        ' data-has-preview="true"',
      );
    }
    return shell(
      `<img class="ai-os-resource-thumb" alt="" data-resource-preview-src="${source}" />`,
      ' data-has-preview="true"',
    );
  }

  /**
   * 预览懒加载：地址交给共享图片管线，只有它确认无图可取才退回类型图标。
   *
   * The manager retries the original after a thumbnail miss, so a single error
   * event is not the end of the line: the card only falls back on the terminal
   * "error" state, otherwise a recoverable miss would blank the card.
   */
  function bindResourcePreviews() {
    const grid = elements.resourceGrid;
    if (!grid) return;
    grid.querySelectorAll("img[data-resource-preview-src]").forEach((img) => {
      const source = img.dataset.resourcePreviewSrc || "";
      const shell = img.closest(".ai-os-resource-preview");
      const ready = () => shell?.classList.add("is-preview-ready");
      const fail = () => {
        shell?.classList.add("is-preview-failed");
        img.remove();
      };
      img.addEventListener("load", ready);
      if (source && window.imageResources?.observe) {
        img.addEventListener("image-resource-state", (event) => {
          if (event.detail?.state === "error") fail();
        });
        window.imageResources.observe(img, source, {
          unload: true,
          maxQuality: "thumbnail",
          allowOriginalFallback: true,
        });
        return;
      }
      img.addEventListener("error", fail);
      if (source) {
        img.loading = "lazy";
        img.decoding = "async";
        img.src = source;
      } else {
        fail();
      }
    });
    // 视频没有缩略图服务，直接让浏览器解一帧当封面。
    grid.querySelectorAll("video[data-resource-preview-video]").forEach((video) => {
      const shell = video.closest(".ai-os-resource-preview");
      const source = video.dataset.resourcePreviewVideo || "";
      const fail = () => {
        shell?.classList.add("is-preview-failed");
        video.remove();
      };
      video.addEventListener("loadeddata", () => {
        shell?.classList.add("is-preview-ready");
        try {
          video.currentTime = Math.min(0.1, (video.duration || 0.2) / 2);
        } catch {
          // 有的容器不支持定位，能显示首帧就够了。
        }
      });
      video.addEventListener("error", fail);
      if (source) video.src = source;
      else fail();
    });
  }

  function updateResourceFilterCounts(summary) {
    document.querySelectorAll("[data-resource-count]").forEach((node) => {
      node.textContent = String(summary[node.dataset.resourceCount] || 0);
    });
  }

  function renderResources() {
    if (!elements.resourceGrid) return;
    const summary = summarizeResources(state.resources);
    const resources = filterResources(state.resources, state.resourceFilter);
    elements.resourceCount.textContent = `${state.resources.length} 个项目`;
    updateResourceFilterCounts(summary);
    elements.resourceGrid.innerHTML = resources.map((entry) => renderResourceCard(entry)).join("") || '<div class="ai-os-empty-state"><div><strong>这里还没有内容</strong><p>在无限画布、AI 生图或对话中开始创作。</p></div></div>';
    window.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
    bindResourcePreviews();
  }

  function populateShareUsers() {
    const select = elements.shareForm?.elements.userIds;
    if (!select) return;
    select.innerHTML = state.users
      .filter((user) => user.id !== state.session?.user?.id && (user.status === undefined || user.status === "active"))
      .map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.displayName)}（${escapeHtml(user.username)}）</option>`)
      .join("");
  }

  function updateShareConditionalFields() {
    const visibility = elements.shareForm?.elements.visibility?.value || "private";
    document.querySelector("[data-share-users]")?.toggleAttribute("hidden", visibility !== "users");
    document.querySelector("[data-share-password]")?.toggleAttribute("hidden", visibility !== "password");
    // 共享权限只在“别人进得来”的时候才有意义：仅自己时谁都被挡在门外，留着这个下拉
    // 会让人以为选“可编辑”就能改点什么。共享素材本来就不带权限，一并藏掉。
    const assetShare = elements.shareDialog?.dataset.assetShare === "true";
    document.querySelector("[data-share-permission]")?.toggleAttribute("hidden", assetShare || visibility === "private");
    // 可见范围是 2 列网格：可见项是奇数时，最后一项占满整行，免得右下角留个缺口。
    const choices = [...document.querySelectorAll("#aiOsShareDialog .ai-os-choice-grid > label")];
    const visibleChoices = choices.filter((label) => !label.hidden);
    choices.forEach((label) => {
      label.classList.toggle("is-wide", visibleChoices.length % 2 === 1 && label === visibleChoices.at(-1));
    });
  }

  function openShareDialog(resourceId, { canvas = false, asset = false } = {}) {
    const entry = state.resources.find((item) => item.resource.id === resourceId);
    if (!entry || !elements.shareDialog) return false;
    elements.shareForm.reset();
    elements.shareDialog.dataset.canvasShare = canvas ? "true" : "false";
    elements.shareDialog.dataset.assetShare = asset ? "true" : "false";
    // 画布可以用口令共享（解锁后走 assertRead，画布库这时才列得出来）。共享素材不行：
    // /api/assets/:id/share 只接受 private / all / users，压根没有口令这一档。
    document.querySelector("[data-share-password-choice]")?.toggleAttribute("hidden", asset);
    const allLabel = document.querySelector("[data-share-all-label]");
    if (allLabel) allLabel.textContent = asset ? "发布到共享精选" : "所有账号";
    const allHint = document.querySelector("[data-share-all-hint]");
    if (allHint) allHint.textContent = asset ? "所有账号都能在共享里看到" : "登录的账号都能打开";
    elements.shareForm.elements.resourceId.value = resourceId;
    const titleNode = document.querySelector("#aiOsShareTitle");
    if (titleNode) titleNode.textContent = "共享设置";
    const subjectNode = document.querySelector("#aiOsShareSubject");
    if (subjectNode) {
      // 画布的真实标题优先：资源表里的名字可能还停在“画布 <boardId>”。
      const boardTitle = canvas ? window.CanvasWorkspace?.boardTitleByResourceId?.(resourceId) : "";
      subjectNode.textContent = String(boardTitle || entry.resource.title || "未命名").trim();
      subjectNode.hidden = !subjectNode.textContent;
    }
    const share = entry.access.share;
    if (share) {
      // 只有共享素材不支持口令：把它按私有回显。画布要原样回显，否则重开面板会显示成
      // “仅自己”，一保存就把口令共享降级成私有。
      const selectedVisibility = asset && share.visibility === "password" ? "private" : share.visibility;
      const visibility = elements.shareForm.querySelector(`[name="visibility"][value="${selectedVisibility}"]`);
      if (visibility) visibility.checked = true;
      elements.shareForm.elements.permission.value = normalizeSharePermission(share.permission);
    }
    // 口令只存哈希，回不到输入框。已经设过口令就提示留空即沿用，免得用户以为必须重打一遍；
    // 没有共享时也要清掉上一次留下的提示。
    const passwordInput = elements.shareForm.elements.password;
    if (passwordInput) passwordInput.placeholder = share?.passwordProtected ? "留空则沿用原口令" : "";
    populateShareUsers();
    if (share?.userIds?.length) {
      for (const option of elements.shareForm.elements.userIds.options) option.selected = share.userIds.includes(option.value);
    }
    updateShareConditionalFields();
    elements.shareDialog.showModal();
    return true;
  }

  async function openCanvasShareDialog(resourceId) {
    await loadResources();
    openShareDialog(resourceId, { canvas: true });
  }

  async function openAssetShareDialog(resourceId) {
    await Promise.all([loadResources(), loadUsers()]);
    return openShareDialog(resourceId, { asset: true });
  }

  function openResource(entry) {
    if (typeof entry === "string") {
      const resolved = state.resources.find((item) => item.resource.id === entry);
      if (!resolved) return false;
      entry = resolved;
    }
    if (!entry?.resource?.id) return false;
    if (entry.resource.type === "image") {
      const url = String(entry.preview?.url || "").trim();
      if (!url) {
        toast("这张图片暂时没有可预览的地址");
        return false;
      }
      if (typeof window.AiOsMediaPreview?.openImage !== "function") {
        toast("图片预览暂时不可用");
        return false;
      }
      return window.AiOsMediaPreview.openImage({
        url,
        title: entry.resource.title || "图片",
      }) !== false;
    }
    const appId = entry.resource.type === "canvas"
      ? "canvas"
      : entry.resource.type === "chat"
        ? "chat"
        : "shared";
    window.AiOsDesktop?.openApp(appId, { resourceId: entry.resource.id });
    return true;
  }

  function openResourceById(resourceId) {
    const entry = state.resources.find((item) => item.resource.id === resourceId);
    if (entry?.access?.locked) {
      openShareUnlockDialog(entry);
      return false;
    }
    if (!entry) return false;
    return openResource(entry);
  }

  function setResourceFilter(filter) {
    const allowed = ["all", "owned", "shared", "canvas", "image", "video", "audio", "chat"];
    state.resourceFilter = allowed.includes(filter) ? filter : "all";
    renderResources();
    return state.resourceFilter;
  }

  function openShareUnlockDialog(entry) {
    if (!elements.shareUnlockDialog || !entry?.access?.share?.id) return;
    elements.shareUnlockForm.reset();
    elements.shareUnlockForm.elements.resourceId.value = entry.resource.id;
    elements.shareUnlockForm.elements.shareId.value = entry.access.share.id;
    document.querySelector("#aiOsShareUnlockTitle").textContent = `解锁 · ${entry.resource.title}`;
    elements.shareUnlockDialog.showModal();
  }

  /**
   * 改显示名称：只改名字，不动登录账号。服务端 PATCH /api/admin/users/:id
   * 对空白名称会直接拒绝，这里先在前端拦一次，给一句人话提示。
   */
  async function saveDisplayName(userId) {
    const user = state.users.find((item) => item.id === userId);
    const input = elements.accountDetail?.querySelector("[data-account-name-form] input[name='displayName']");
    const next = String(input?.value || "").trim();
    if (!next) {
      toast("显示名称不能为空");
      input?.focus();
      return;
    }
    if (user && next === user.displayName) {
      state.editingDisplayNameId = "";
      renderAccounts();
      return;
    }
    const saveButton = elements.accountDetail?.querySelector('[data-account-action="save-name"]');
    if (saveButton) saveButton.disabled = true;
    try {
      await api(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "PATCH", body: { displayName: next } });
    } catch (error) {
      if (saveButton) saveButton.disabled = false;
      throw error;
    }
    state.editingDisplayNameId = "";
    // 改的是自己：顶栏和用户菜单跟着换名字，但不要重建桌面运行时（那会关掉所有窗口）。
    if (window.AiOsDesktop?.getSession?.()?.user?.id === userId) {
      window.AiOsDesktop.updateSessionUser?.({ id: userId, displayName: next });
    }
    await loadUsers();
    toast(`显示名称已改为「${next}」`);
  }

  async function runAccountAction(userId, action) {
    const user = state.users.find((item) => item.id === userId);
    if (!user) return;
    if (action === "edit-name") {
      state.editingDisplayNameId = userId;
      renderAccounts();
      const input = elements.accountDetail?.querySelector("[data-account-name-form] input[name='displayName']");
      input?.focus();
      input?.select();
      return;
    }
    if (action === "cancel-name") {
      state.editingDisplayNameId = "";
      renderAccounts();
      return;
    }
    if (action === "save-name") {
      await saveDisplayName(userId);
      return;
    }
    if (action === "toggle") {
      const status = user.status === "active" ? "disabled" : "active";
      await api(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "PATCH", body: { status } });
      toast(status === "active" ? "账号已恢复" : "账号已停用，原有会话已退出");
    } else if (action === "reset") {
      const data = await api(`/api/admin/users/${encodeURIComponent(userId)}/reset-password`, { method: "POST" });
      state.temporaryPasswords.set(userId, data.temporaryPassword);
      toast("密码已重置");
    } else if (action === "revoke") {
      await api(`/api/admin/users/${encodeURIComponent(userId)}/revoke-sessions`, { method: "POST" });
      toast("该账号已从所有设备退出");
    }
    await loadUsers();
  }

  function handleAccountAction(button) {
    return runAccountAction(button.dataset.accountId, button.dataset.accountAction);
  }

  function bindEvents() {
    if (state.initialized) return;
    state.initialized = true;
    document.querySelector("#aiOsRefreshResources")?.addEventListener("click", () => loadResources().catch((error) => toast(error.message)));
    document.querySelectorAll("[data-resource-filter]").forEach((button) => button.addEventListener("click", () => {
      document.querySelectorAll("[data-resource-filter]").forEach((item) => item.classList.toggle("active", item === button));
      setResourceFilter(button.dataset.resourceFilter);
    }));
    elements.resourceGrid?.addEventListener("click", (event) => {
      const shareButton = event.target.closest("[data-share-resource]");
      if (shareButton) openShareDialog(shareButton.dataset.shareResource);
      const openButton = event.target.closest("[data-open-resource]");
      if (openButton) {
        openResourceById(openButton.dataset.openResource);
      }
    });
    elements.accountSearch?.addEventListener("input", renderAccounts);
    elements.accountList?.addEventListener("click", (event) => {
      const item = event.target.closest("[data-account-id]");
      if (!item) return;
      state.selectedUserId = item.dataset.accountId;
      renderAccounts();
    });
    elements.accountDetail?.addEventListener("click", (event) => {
      const action = event.target.closest("[data-account-action]");
      if (action) handleAccountAction(action).catch((error) => toast(error.message));
      const copy = event.target.closest("[data-copy-password]");
      if (copy) navigator.clipboard?.writeText(copy.dataset.copyPassword).then(() => toast("临时密码已复制"));
    });
    elements.accountDetail?.addEventListener("submit", (event) => {
      const form = event.target.closest("[data-account-name-form]");
      if (!form) return;
      event.preventDefault();
      runAccountAction(form.dataset.accountNameForm, "save-name").catch((error) => toast(error.message));
    });
    elements.accountDetail?.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !event.target.closest("[data-account-name-form]")) return;
      event.preventDefault();
      state.editingDisplayNameId = "";
      renderAccounts();
    });
    for (const id of ["aiOsAddAccount", "aiOsAddAccountSecondary"]) {
      document.querySelector(`#${id}`)?.addEventListener("click", () => elements.accountDialog?.showModal());
    }
    elements.accountForm?.addEventListener("submit", async (event) => {
      if (event.submitter?.value === "cancel") return;
      event.preventDefault();
      const form = new FormData(elements.accountForm);
      try {
        const data = await api("/api/admin/users", {
          method: "POST",
          body: { username: form.get("username"), displayName: form.get("displayName") },
        });
        state.temporaryPasswords.set(data.user.id, data.temporaryPassword);
        state.selectedUserId = data.user.id;
        elements.accountDialog.close();
        elements.accountForm.reset();
        await loadUsers();
        toast("账号已创建，请把临时密码交给该用户");
      } catch (error) { toast(error.message); }
    });
    elements.shareForm?.addEventListener("change", updateShareConditionalFields);
    elements.shareForm?.addEventListener("submit", async (event) => {
      if (event.submitter?.value === "cancel") return;
      event.preventDefault();
      const form = new FormData(elements.shareForm);
      const payload = {
        visibility: form.get("visibility"),
        permission: form.get("permission"),
        userIds: form.getAll("userIds"),
        password: form.get("password") || undefined,
      };
      if (payload.visibility === "users" && !payload.userIds.length) {
        toast("请至少选择一个共享账号");
        return;
      }
      try {
        const canvasShare = elements.shareDialog.dataset.canvasShare === "true";
        const assetShare = elements.shareDialog.dataset.assetShare === "true";
        const resourceId = form.get("resourceId");
        if (assetShare) {
          await api(`/api/assets/${encodeURIComponent(resourceId)}/share`, {
            method: "PATCH",
            body: { visibility: payload.visibility, userIds: payload.userIds },
          });
        } else {
          await api(`/api/resources/${encodeURIComponent(resourceId)}/shares`, { method: "POST", body: payload });
        }
        elements.shareDialog.close();
        await loadResources();
        if (canvasShare) window.dispatchEvent(new CustomEvent("ai-os-canvas-sharing-changed", { detail: { resourceId } }));
        if (assetShare) window.dispatchEvent(new CustomEvent("ai-os-assets-changed", { detail: { assetId: resourceId } }));
        toast("共享设置已保存");
      } catch (error) { toast(error.message); }
    });
    elements.shareUnlockForm?.addEventListener("submit", async (event) => {
      if (event.submitter?.value === "cancel") return;
      event.preventDefault();
      const form = new FormData(elements.shareUnlockForm);
      try {
        await api(`/api/shares/${encodeURIComponent(form.get("shareId"))}/unlock`, {
          method: "POST",
          body: { password: form.get("password") },
        });
        elements.shareUnlockDialog.close();
        await loadResources();
        const entry = state.resources.find((item) => item.resource.id === form.get("resourceId"));
        if (entry) openResource(entry);
        toast("共享资源已解锁");
      } catch (error) { toast(error.message); }
    });
  }

  async function init(session) {
    collectElements();
    bindEvents();
    state.session = session;
    if (!session?.user) return;
    await Promise.all([
      loadResources().catch((error) => toast(error.message)),
      loadUsers().catch((error) => toast(error.message)),
    ]);
  }

  window.AiOsManagement = {
    init,
    loadResources,
    loadUsers,
    filterResources,
    summarizeResources,
    renderResourceCard,
    openResource,
    setResourceFilter,
    openShareDialog,
    openCanvasShareDialog,
    openAssetShareDialog,
  };
  window.addEventListener("ai-os-session", (event) => init(event.detail));
})();
