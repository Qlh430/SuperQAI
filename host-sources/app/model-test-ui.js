(function (root, factory) {
  const api = factory(root?.AiOsProviderTestResult || (typeof require === "function" ? require("./provider-test-result") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AiOsModelTestUi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (presentation) {
  "use strict";
  const MODES = [
    { id: "chat", capability: "llm.chat", label: "对话", route: "/api/providers/test", placeholder: "输入你想问的问题…" },
    { id: "image", capability: "image.generate", label: "图片", route: "/api/providers/test-image", placeholder: "描述你想生成的画面…" },
  ];
  function modesForModel(model) {
    return MODES.filter(mode => model?.capabilities?.includes(mode.capability));
  }
  function errorGuidance(message) {
    if (/余额|quota|credit|balance|billing|insufficient/i.test(message)) return "请检查这个平台的余额或额度。测试不会自动切换到其他平台。";
    if (/401|403|key|鉴权|权限|认证|授权/i.test(message)) return "请检查 API Key 和这个模型的访问权限。";
    if (/404|not found|不存在/i.test(message)) return "请检查模型 ID、Base URL 和模型协议；模型目录不可用不代表模型一定不可用。";
    if (/timeout|超时|network|fetch|连接|网络/i.test(message)) return "请求结果暂不确定，图片可能仍在生成。请先查看平台任务记录，避免重复提交产生费用。";
    return "请检查模型协议及平台支持的参数，再决定是否重新发送。";
  }

  function createModelTestDialog({ root, request, onResult = () => {} }) {
    const doc = root.ownerDocument;
    let active = null;
    function close() {
      const state = active;
      if (!state) return;
      active = null;
      clearInterval(state.timer);
      state.dialog.close();
      state.dialog.remove();
      if (state.opener?.isConnected) state.opener.focus();
    }
    function open({ provider, model }) {
      close();
      const modes = modesForModel(model);
      if (!modes.length) return false;
      const dialog = doc.createElement("dialog");
      dialog.className = "settings-test-dialog";
      dialog.setAttribute("aria-label", "模型测试");
      dialog.innerHTML = `<header class="settings-test-header"><div><h3>模型测试</h3><p data-test-identity></p></div><button type="button" data-test-close aria-label="关闭测试">×</button></header>
        <nav class="settings-test-modes" aria-label="测试类型"></nav>
        <div class="settings-test-status" data-test-status role="status" aria-live="polite">输入内容，试试这个模型</div>
        <section class="settings-test-output" data-test-output aria-label="测试结果"></section>
        <form class="settings-test-composer" data-model-test-form>
          <label><span data-test-prompt-label>你的问题</span><textarea data-test-prompt rows="3" maxlength="8000" required></textarea></label>
          <footer><p>会调用所选 API，可能产生费用。</p><button type="submit" data-test-send>发送</button></footer>
        </form>`;
      const state = {
        dialog, provider: JSON.parse(JSON.stringify(provider)), model: JSON.parse(JSON.stringify(model)),
        mode: modes[0], history: [], busy: false, timer: null, opener: doc.activeElement, prompts: {},
      };
      active = state;
      const status = dialog.querySelector("[data-test-status]");
      const output = dialog.querySelector("[data-test-output]");
      const prompt = dialog.querySelector("[data-test-prompt]");
      const send = dialog.querySelector("[data-test-send]");
      dialog.querySelector("[data-test-identity]").textContent = `${provider.name || "当前平台"} · ${model.id}`;
      const textBlock = (text, className = "") => {
        const block = doc.createElement("p");
        block.className = className;
        block.textContent = text;
        output.append(block);
        return block;
      };
      const setStatus = (text, kind = "") => {
        status.textContent = text;
        status.dataset.kind = kind;
      };
      function switchMode(mode) {
        if (state.busy) return;
        state.prompts[state.mode.id] = prompt.value;
        state.mode = mode;
        prompt.value = state.prompts[mode.id] || "";
        prompt.placeholder = mode.placeholder;
        prompt.setAttribute("aria-label", mode.id === "chat" ? "你的问题" : "画面描述");
        dialog.querySelector("[data-test-prompt-label]").textContent = mode.id === "chat" ? "你的问题" : "画面描述";
        send.textContent = mode.id === "chat" ? "发送" : "生成图片";
        output.replaceChildren();
        dialog.classList.remove("is-expanded");
        setStatus("输入内容，试试这个模型");
        if (mode.id === "chat") state.history.forEach(item => textBlock(item.content, item.role === "user" ? "settings-test-question" : "settings-test-answer"));
        if (!output.childNodes.length) textBlock(mode.id === "chat" ? "回复会显示在这里，可继续提问。" : "生成的图片会显示在这里，点击图片可放大。", "settings-test-empty");
        dialog.querySelectorAll("[data-test-mode]").forEach(button => {
          const selected = button.dataset.testMode === mode.id;
          button.setAttribute("aria-pressed", String(selected));
          button.classList.toggle("active", selected);
        });
      }
      for (const mode of modes) {
        const button = doc.createElement("button");
        button.type = "button";
        button.dataset.testMode = mode.id;
        button.textContent = `${mode.label}测试`;
        button.onclick = () => { switchMode(mode); prompt.focus(); };
        dialog.querySelector(".settings-test-modes").append(button);
      }
      function renderResult(test) {
        const elapsed = `${(test.elapsedMs / 1000).toFixed(1)} 秒`;
        if (test.status === "pending") {
          setStatus(`任务已提交 · ${elapsed}`, "pending");
          textBlock("平台已接收任务，尚未返回最终图片。请在平台任务记录中查看，避免重复提交。");
          if (test.taskId) textBlock(`任务编号：${test.taskId}`, "settings-test-task");
        } else if (test.status !== "succeeded") {
          throw new Error(test.status === "failed" ? "平台返回任务失败，未生成图片。" : "上游没有返回可用的测试结果。");
        } else if (state.mode.id === "image") {
          const images = (test.images || []).map(presentation.safeImageSource).filter(Boolean);
          if (!images.length) throw new Error("上游没有返回可安全预览的图片。");
          setStatus(`图片生成成功 · ${elapsed}`, "success");
          for (const source of images) {
            const button = doc.createElement("button");
            button.type = "button";
            button.className = "settings-test-image";
            button.setAttribute("aria-label", "放大或缩小图片");
            button.onclick = () => dialog.classList.toggle("is-expanded");
            const image = doc.createElement("img");
            image.alt = "模型测试生成的图片";
            image.referrerPolicy = "no-referrer";
            image.onerror = () => {
              image.hidden = true;
              button.textContent = "图片暂时无法加载，请检查网络或平台图片链接有效期。";
              button.disabled = true;
            };
            image.src = source;
            button.append(image);
            output.append(button);
          }
        } else {
          setStatus(`对话测试成功 · ${elapsed}`, "success");
          textBlock(test.text || `模型返回了 ${test.toolCallCount || 0} 个工具调用，没有文字回复。`, "settings-test-answer");
          if (test.truncated) textBlock("回复较长，仅展示前 64000 个字符。");
        }
        output.scrollTop = output.scrollHeight;
      }
      async function submit(event) {
        event.preventDefault();
        event.stopPropagation();
        if (state.busy || active !== state) return;
        const content = prompt.value.trim();
        if (!content) { prompt.reportValidity(); return; }
        state.busy = true;
        const started = Date.now();
        send.disabled = true;
        prompt.disabled = true;
        dialog.querySelectorAll("[data-test-mode]").forEach(button => { button.disabled = true; });
        const label = state.mode.id === "chat" ? "等待回复" : "正在生成图片";
        setStatus(`${label}…`, "busy");
        dialog.querySelector(".settings-test-composer footer p").textContent = "请求已发送，关闭窗口不会取消上游任务。";
        output.querySelectorAll(".settings-test-empty, .settings-test-error").forEach(item => item.remove());
        if (state.mode.id === "image") output.replaceChildren();
        const question = textBlock(content, "settings-test-question");
        state.timer = setInterval(() => {
          if (active === state) setStatus(`${label} · 已等待 ${Math.floor((Date.now() - started) / 1000)} 秒`, "busy");
        }, 1000);
        send.textContent = state.mode.id === "chat" ? "发送中…" : "生成中…";
        try {
          const input = state.mode.id === "chat"
            ? { messages: [...state.history, { role: "user", content }] }
            : { prompt: content };
          const reply = await request(state.mode.route, {
            method: "POST",
            body: { provider: state.provider, modelId: state.model.id, input, ...(state.mode.id === "image" ? { params: { n: 1 } } : {}) },
          });
          if (active !== state) return;
          const test = reply.test || presentation.presentTestResult(reply.result, state.mode.capability, Date.now() - started);
          renderResult(test);
          if (state.mode.id === "chat" && test.text && !test.truncated) {
            state.history.push({ role: "user", content }, { role: "assistant", content: test.text });
            // Keep this small test conversation bounded; a new request always
            // includes complete user/assistant pairs, never half a turn.
            state.history = state.history.slice(-12);
            prompt.value = "";
          }
          onResult({ providerId: provider.id, modelId: model.id, mode: state.mode.id, status: test.status, elapsedMs: test.elapsedMs });
        } catch (error) {
          if (active !== state) return;
          question.remove();
          setStatus(`测试未通过 · ${((Date.now() - started) / 1000).toFixed(1)} 秒`, "warning");
          const message = String(error.message || error);
          textBlock(message, "settings-test-error");
          textBlock(errorGuidance(message), "settings-test-error");
          onResult({ providerId: provider.id, modelId: model.id, mode: state.mode.id, status: "failed", message });
        } finally {
          clearInterval(state.timer);
          if (active === state) {
            state.busy = false;
            prompt.disabled = false;
            send.disabled = false;
            dialog.querySelectorAll("[data-test-mode]").forEach(button => { button.disabled = false; });
            send.textContent = state.mode.id === "chat" ? "发送" : "生成图片";
            prompt.focus();
          }
        }
      }
      dialog.querySelector("[data-test-close]").onclick = close;
      dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
      dialog.querySelector("form").addEventListener("submit", submit);
      prompt.addEventListener("keydown", event => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.isComposing) dialog.querySelector("form").requestSubmit();
      });
      (root.querySelector(".ai-os-settings-layout") || root).append(dialog);
      switchMode(modes[0]);
      dialog.showModal();
      prompt.focus();
      return true;
    }
    return Object.freeze({ open, close, destroy: close });
  }
  return Object.freeze({ createModelTestDialog, modesForModel, errorGuidance });
});
