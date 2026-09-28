"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

const html = read("index.html");
assert.match(html, /desktop-shell\.css/);
assert.match(html, /id="aiOsAuthGate"/);
assert.match(html, /id="aiOsLoginForm"/);
assert.match(html, /id="aiOsBootstrapForm"/);
assert.match(html, /id="aiOsDesktop"/);
assert.match(html, /class="ai-os-menu-bar"/);
assert.match(html, /class="ai-os-dock"/);
assert.match(html, /data-ai-app="canvas"/);
assert.match(html, /data-ai-app="shared"/);
assert.match(html, /data-ai-app="accounts"/);
assert.match(html, /id="aiOsSharedWindow"/);
assert.match(html, /data-ai-app="shared"[^>]*aria-label="文件"[\s\S]{0,180}<small>文件<\/small>/, "the Dock names the shared app 文件");
assert.match(html, /id="aiOsSharedWindow"[\s\S]{0,260}<strong>文件<\/strong>/, "the files window title uses 文件");
assert.doesNotMatch(html, /共享文件/, "visible files app copy no longer says 共享文件");
assert.match(html, /id="aiOsAccountsWindow"/);
assert.match(html, /id="aiOsShareUnlockDialog"/);
assert.match(html, /account-management-ui\.js/);
assert.match(html, /desktop-window-manager\.js[\s\S]*desktop-app-runtime\.js[\s\S]*desktop-shell\.js/, "window manager and app runtime load before the shell");
assert.match(html, /desktop-shell\.js/);
assert.match(html, /id="aiOsWindowLayer"/, "desktop has a neutral window layer");
assert.match(html, /id="aiOsDesktopHome"/, "desktop has a visible no-window launch surface");
assert.match(html, /id="aiOsDesktopHomeApps"/, "desktop launch surface has a runtime-rendered app host");
assert.match(html, /id="aiOsLaunchpad"/, "desktop has a neutral launchpad host");
for (const appId of ["launcher", "canvas", "image", "chat", "shared", "accounts", "settings"]) {
  assert.match(html, new RegExp('data-ai-app="' + appId + '"[^>]*><span class="dock-icon[^>]*><i data-lucide='), "Dock uses Lucide/source icon markup for " + appId);
}
assert.doesNotMatch(html, /dock-launcher"><i><\/i><i><\/i>/, "Dock no longer uses CSS-art launcher tiles");

const css = read("desktop-shell.css");
assert.match(css, /--os-accent:\s*#2f80ed/i);
assert.match(css, /--system-scale:\s*1/);
assert.match(css, /width:\s*calc\(100%\s*\/\s*var\(--system-scale\)\)/);
assert.match(css, /height:\s*calc\(100%\s*\/\s*var\(--system-scale\)\)/);
assert.match(css, /transform:\s*scale\(var\(--system-scale\)\)/);
assert.match(css, /transform-origin:\s*top left/);
assert.match(css, /--system-viewport-width:\s*calc\(100vw\s*\/\s*var\(--system-scale\)\)/);
assert.match(css, /--system-viewport-height:\s*calc\(100vh\s*\/\s*var\(--system-scale\)\)/);
assert.match(css, /\.ai-os-dialog\s*\{[^}]*width:\s*min\(470px,\s*calc\(var\(--system-viewport-width\)\s*-\s*32px\)\)[^}]*transform:\s*scale\(var\(--system-scale\)\)/s, "top-layer dialogs use the system scale and a logical viewport width");
assert.match(css, /backdrop-filter:\s*blur/i);
assert.match(css, /\.ai-os-dock/);
assert.match(css, /\.ai-os-desktop-home\s*\{/);
assert.match(css, /\.ai-os-home-grid\s*\{/);
assert.match(css, /\.ai-os-home-app\s*\{/);
assert.match(css, /\.ai-os-home-app\[data-home-app="canvas"\]/);
assert.match(css, /html\[data-theme="dark"\] \.ai-os-home-app\s*\{/);
assert.match(css, /\.ai-os-traffic-lights/);
assert.match(css, /:focus-visible/);
assert.match(css, /@media\s*\(max-width:/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /\.canvas-workspace\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0/s, "canvas workspace fills its rehosted window content");

const shell = read("desktop-shell.js");
assert.match(shell, /\/api\/auth\/session/);
assert.match(shell, /\/api\/auth\/login/);
assert.match(shell, /\/api\/auth\/bootstrap/);
assert.match(shell, /\/api\/auth\/logout/);
assert.match(shell, /dataset\.aiAuth/);
assert.match(shell, /ai-os-session/);
assert.match(shell, /mustChangePassword/);
assert.match(shell, /dataset\.forced/);
assert.match(shell, /const passwordForm = event\.currentTarget;[\s\S]{0,700}passwordForm\.reset\(\)/, "async password submission keeps a stable form reference");
assert.match(shell, /data-ai-app/);
assert.match(shell, /AiOsWindowManager\.createWindowManager/, "shell constructs the state manager");
const managerSource = read("desktop-window-manager.js");
assert.match(managerSource, /root\.AiOsWindowManager\s*=\s*api/, "window manager exports the browser global consumed by the shell");
assert.match(managerSource, /root\.DesktopWindowManager\s*=\s*api/, "window manager preserves the legacy browser global alias");
assert.match(shell, /AiOsAppRuntime\.createAppRuntime/, "shell constructs the app runtime");
assert.match(shell, /storageKey:\s*[`'"]desktop-layout:/, "window layouts are account scoped");
for (const appId of ["canvas", "image", "chat", "records", "shared", "accounts", "settings"]) {
  assert.match(shell, new RegExp("id:\\s*[\\\"']" + appId + "[\\\"']"), "shell registers " + appId);
}
assert.match(shell, /id:\s*["']shared["'][^\n]*label:\s*["']文件["']/, "the desktop manifest labels the shared app 文件");
assert.match(shell, /id:\s*["']accounts["'][\s\S]{0,500}roles:\s*\[[^\]]*["']superadmin["']/, "accounts is superadmin-only");
assert.match(shell, /ai-os-app-window/, "shell generates real app window chrome");
assert.match(shell, /data-window-action=["']close["']/, "window chrome has a close action");
assert.match(shell, /data-window-action=["']minimize["']/, "window chrome has a minimize action");
assert.match(shell, /data-window-action=["']maximize["']/, "window chrome has a maximize action");
for (const direction of ["n", "ne", "e", "se", "s", "sw", "w", "nw"]) {
  assert.match(shell, new RegExp("data-resize=[\\\"']" + direction + "[\\\"']"), "window chrome has the " + direction + " resize handle");
}
assert.match(shell, /pointerdown/, "window chrome uses Pointer Events");
assert.match(shell, /setPointerCapture/, "window drag/resize captures the pointer");
assert.match(shell, /dblclick/, "title bar supports maximize toggle");
assert.match(shell, /setViewport/, "shell updates the manager when viewport changes");
assert.match(shell, /AiOsDisplay\.logicalViewport/, "shell uses the display module for the logical viewport");
assert.match(shell, /const dxPx = moveEvent\.clientX - origin\.x;/, "shell measures pointer X deltas from the drag origin");
assert.match(shell, /const dyPx = moveEvent\.clientY - origin\.y;/, "shell measures pointer Y deltas from the drag origin");
assert.match(shell, /AiOsDisplay\.logicalDelta\(dxPx, scale\)/, "shell converts pointer X deltas to logical units");
assert.match(shell, /AiOsDisplay\.logicalDelta\(dyPx, scale\)/, "shell converts pointer Y deltas to logical units");
assert.match(shell, /const DRAG_THRESHOLD = \d+;/, "shell ignores sub-threshold pointer jitter before it starts a drag");
assert.match(shell, /if \(Math\.abs\(dxPx\) < DRAG_THRESHOLD && Math\.abs\(dyPx\) < DRAG_THRESHOLD\) return;/, "shell waits for the drag threshold before moving the window");
assert.match(shell, /if \(pullingMaximized\)[\s\S]{0,600}manager\.restoreForDrag\(node\.dataset\.windowId\)/, "dragging a maximized window restores it first");
assert.match(shell, /const ratioX = rect\.width \? Math\.min\(1, Math\.max\(0, \(origin\.x - rect\.left\) \/ rect\.width\)\) : \.5;/, "restored windows keep the grabbed point under the cursor horizontally");
assert.match(shell, /const grabY = Math\.min\(TITLEBAR_GRAB_HEIGHT, Math\.max\(0, \(origin\.y - rect\.top\) \/ scale\)\);/, "restored windows keep the grabbed point under the cursor vertically");
assert.match(shell, /function windowLayerOrigin\(\)[\s\S]{0,320}getBoundingClientRect/, "shell resolves the window layer origin for absolute pointer anchoring");
assert.match(shell, /if \(endEvent\.clientY \/ scale > MENU_BAR_HEIGHT\) return;[\s\S]{0,220}manager\.maximize\(node\.dataset\.windowId\)/, "dropping a dragged window on the top strip maximizes it");
assert.match(shell, /operation === "move"[\s\S]{0,180}desktopViewport\(\)\.width < 860/, "window dragging uses the logical viewport breakpoint");
assert.doesNotMatch(shell, /operation === "move"[\s\S]{0,180}innerWidth < 860/, "window dragging must not use a physical-width breakpoint");
assert.match(shell, /ai-os-preferences-applied[\s\S]{0,300}setViewport\(desktopViewport\(\)\)/, "preference changes refresh the manager viewport");
assert.match(shell, /ai-os-dock-running/, "Dock exposes app running state");
assert.match(shell, /function syncDesktopHome\(snapshot\)/, "desktop home visibility follows the live window snapshot");
assert.match(shell, /function renderDesktopHome\(\)/, "desktop home is rendered from the app runtime");
assert.match(shell, /runtime\.listVisible\(\)[\s\S]{0,500}data-home-app/, "desktop home only exposes apps visible to the current account");
assert.match(shell, /data-home-app[\s\S]{0,260}openApp\(button\.dataset\.homeApp\)/, "desktop home launches apps through the existing desktop API");
assert.match(shell, /function getLegacyView\(appId\)[\s\S]{0,260}LEGACY_VIEW_SELECTORS/, "desktop apps can mount their existing DOM view while the legacy bridge is still loading");
assert.match(shell, /toggleLaunchpad/, "launcher toggles the launchpad");
assert.match(shell, /runtime\.deactivate[\s\S]*runtime\.activate/, "focus transitions notify the runtime");
assert.match(shell, /runtime\.listVisible\(\)[\s\S]{0,900}manager\.open\(/, "open checks runtime visibility before creating a window");
const renderWindowsStart = shell.indexOf("function renderWindows(snapshot)");
const focusSyncIndex = shell.indexOf("syncRuntimeFocus(snapshot);", renderWindowsStart);
const focusedClassIndex = shell.indexOf('classList.toggle("is-focused"', renderWindowsStart);
const dockRenderIndex = shell.indexOf("renderDock(snapshot);", renderWindowsStart);
assert.ok(focusSyncIndex >= renderWindowsStart && focusSyncIndex < focusedClassIndex, "focus state is synchronized before window classes render");
assert.ok(focusSyncIndex < dockRenderIndex, "focus state is synchronized before Dock state renders");
assert.match(shell, /ai-os-legacy-workbench-ready/, "shell waits for the legacy bridge readiness event");
assert.doesNotMatch(shell, /openApp\("canvas"\)/, "session and bridge activation leave the desktop free of app windows");
assert.match(shell, /function toggleDockApp\(appId\)/, "Dock uses a dedicated app-window toggle");
assert.match(shell, /function toggleDockApp\(appId\)[\s\S]{0,700}state\.manager\.minimize\(existing\.id\)/, "clicking the focused Dock app minimizes its window");
assert.match(shell, /function toggleDockApp\(appId\)[\s\S]{0,700}focusWindow\(existing\.id, \{ reveal: true \}\)/, "Dock clicks explicitly reveal background, minimized or unreachable apps");
assert.match(shell, /state\.activeWindowId === existing\.id && state\.manager\.isReachable\(existing\.id\)/, "Dock minimizes an active app only when its titlebar is reachable");
assert.match(shell, /\[data-ai-app\][\s\S]{0,220}toggleDockApp\(button\.dataset\.aiApp\)/, "Dock buttons call the toggle instead of unconditional open");
assert.match(shell, /immersiveWindowId:\s*null/, "desktop state tracks the immersive window without changing saved geometry");
assert.match(shell, /function setAppImmersive\(appId, active\)/, "desktop owns immersive app state");
assert.match(shell, /ai-os-app-immersive[\s\S]{0,220}setAppImmersive/, "Canvas immersive requests are handled by the desktop shell");
assert.match(shell, /function closeWindow\(windowId\)[\s\S]{0,260}clearAppImmersive\(windowId\)/, "closing the immersive window restores desktop chrome");
assert.match(css, /html\[data-ai-immersive-app="canvas"\] \.ai-os-menu-bar[\s\S]*?\.ai-os-dock[\s\S]*?visibility:\s*hidden/, "immersive Canvas hides the menu bar and Dock");
assert.match(css, /\.ai-os-app-window\.is-immersive[\s\S]*?\.ai-os-app-titlebar[\s\S]*?display:\s*none/, "immersive Canvas hides its window title bar");
assert.match(css, /\.ai-os-app-titlebar \{[\s\S]{0,420}position:\s*absolute;/, "the title strip floats over the app instead of occupying a second row");
// 窗口必须是"不透明合成"：整扇窗 opacity 变透明会让后面的应用以可读文字透上来
// （画布项目管理界面从"文件与共享"窗口里透出来就是这个 bug）。
assert.match(css, /\.ai-os-app-window \{[\s\S]{0,900}background-color:\s*var\(--os-window-solid/, "the app window paints an opaque base colour");
assert.match(css, /\.ai-os-app-window \{[\s\S]{0,900}background-image:\s*linear-gradient\(var\(--os-window-bg/, "the glass tint is layered over the opaque base colour");
assert.doesNotMatch(css, /\.ai-os-app-window \{[^}]*\bopacity:\s*\.(?!0\b)[\d]+/s, "windows must not fade the whole window to transparent");
assert.match(css, /\.ai-os-app-window\.is-focused::after \{[\s\S]{0,80}opacity:\s*0;/, "background windows recede through the internal veil");
assert.match(css, /\.ai-os-app-window::after \{[\s\S]{0,220}pointer-events:\s*none;/, "the unfocused veil never blocks pointer input");
const themeCss = read("ai-os-theme.css");
assert.match(themeCss, /:root\[data-theme="light"\][\s\S]{0,1200}--os-window-solid:\s*#/, "the light theme defines an opaque window base");
assert.match(themeCss, /:root\[data-theme="dark"\][\s\S]{0,1200}--os-window-solid:\s*#/, "the dark theme defines an opaque window base");
assert.match(themeCss, /:root\[data-theme\] \.ai-os-app-window \{[\s\S]{0,300}background-color:\s*var\(--os-window-solid\)\s*!important/, "the global theme layer keeps app windows opaque");
assert.match(css, /\.ai-os-app-titlebar \{[\s\S]{0,600}background:\s*transparent;/, "the floating title strip has no painted bar");
assert.match(css, /\.ai-os-app-titlebar > strong \{ display: none; \}/, "the window name is not repeated in the title strip");
assert.match(css, /\.ai-os-window-content \{[\s\S]{0,420}padding-top:\s*34px;/, "window content reserves room for the floating title strip");
assert.match(css, /\.ai-os-app-window\.is-immersive > \.ai-os-window-content \{[\s\S]{0,260}padding-top:\s*0;/, "immersive apps reclaim the title strip inset");
assert.match(shell, /document\.documentElement\.dataset\.aiMaximizedChrome/, "the shell tracks whether the menu bar gives way to a maximized window");
assert.match(shell, /function syncMaximizedChrome\(snapshot\)/, "the shell owns the maximized menu-bar behaviour");
assert.match(shell, /const wideEnough = \(snapshot\?\.viewport\?\.width \|\| 0\) >= 860;/, "only wide viewports hide the menu bar for a maximized window");
assert.match(shell, /focused\.maximized && wideEnough/, "a focused maximized window is what makes the menu bar give way");
assert.match(shell, /if \(hide !== wasHidden\) state\.manager\?\.setViewport\(desktopViewport\(\)\);/, "the work area grows while the menu bar is hidden");
assert.match(shell, /function menuBarChromeHeight\(\)[\s\S]{0,320}aiMaximizedChrome === "true" \? 0 : MENU_BAR_HEIGHT/, "the logical viewport drops the menu bar height while hidden");
assert.match(css, /html\[data-ai-maximized-chrome="true"\] \.ai-os-menu-bar \{[\s\S]{0,200}visibility:\s*hidden/, "a maximized window hides the AI OS menu bar");
assert.match(css, /html\[data-ai-maximized-chrome="true"\] \.ai-os-window-layer \{[\s\S]{0,80}top:\s*0/, "the window layer rises to the top of the screen while the menu bar is hidden");
const controlsStart = shell.indexOf('node.querySelectorAll("[data-window-action]")');
const controlPointerIndex = shell.indexOf('addEventListener("pointerdown"', controlsStart);
const controlStopIndex = shell.indexOf("event.stopPropagation()", controlPointerIndex);
assert.ok(controlPointerIndex > controlsStart && controlStopIndex > controlPointerIndex, "window control pointer handling stops propagation");
assert.match(
  shell,
  /node\.addEventListener\(\s*"pointerdown"[\s\S]{0,420}?true,\s*\)/,
  "window clicks raise the window from the capture phase, so the titlebar and app content cannot swallow the focus event",
);
assert.match(shell, /authRequest[\s\S]{0,1100}response\.status\s*===\s*401[\s\S]{0,500}showAuthGate/, "authenticated business requests close the desktop on 401");
assert.match(shell, /setBounds\(/, "shell uses atomic window bounds updates during resize");
assert.doesNotMatch(shell, /selectLegacyTool/, "legacy button-click orchestration is removed");
assert.doesNotMatch(shell, /\.click\s*\(/, "shell does not synthesize click-based launches");
assert.match(html, /matchMedia\("\(prefers-color-scheme: dark\)"\)[\s\S]{0,900}addEventListener\?\.\("change"/, "the unauthenticated shell observes live OS theme changes");

const legacyScript = read("script.js");
assert.match(legacyScript, /AiOsLegacyWorkbench/, "legacy workbench exposes an explicit bridge");
assert.match(legacyScript, /activateTool/, "legacy bridge explicitly activates a tool");
assert.match(legacyScript, /getView/, "legacy bridge returns a business view node");

const accounts = read("account-management-ui.js");
assert.match(accounts, /\/api\/admin\/users/);
assert.match(accounts, /\/api\/users\/directory/);
assert.match(accounts, /\/api\/shares\/.*\/unlock/);
assert.match(accounts, /reset-password/);
assert.match(accounts, /revoke-sessions/);
assert.match(accounts, /\/api\/resources/);
assert.match(accounts, /visibility/);
assert.match(accounts, /permission/);

console.log("AI OS shell checks passed.");
