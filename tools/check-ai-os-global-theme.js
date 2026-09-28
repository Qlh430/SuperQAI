const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("index.html");
const script = read("script.js");
const stylesCss = read("styles.css");
const themePath = path.join(root, "ai-os-theme.css");

assert.equal(fs.existsSync(themePath), true, "ai-os-theme.css must exist");
const themeCss = read("ai-os-theme.css");

assert.match(html, /ai-os-theme\.css/);
assert.doesNotMatch(html, /dataset\.palette\s*=/);
assert.match(themeCss, /:root\[data-theme="light"\]/);
assert.match(themeCss, /:root\[data-theme="dark"\]/);
assert.doesNotMatch(themeCss, /html\[data-theme(?:=|\])/i, "theme selectors must not use lower-specificity html[data-theme]");
assert.match(themeCss, /:root\[data-theme="light"\]\[data-palette\]/, "light legacy-palette compatibility must retain root specificity");
assert.match(themeCss, /:root\[data-theme="dark"\]\[data-palette\]/, "dark legacy-palette compatibility must retain root specificity");

for (const token of ["--os-wallpaper", "--os-window-bg", "--os-sidebar-bg", "--os-field-bg", "--grid-line"]) {
  assert.match(themeCss, new RegExp(token.replace("--", "--")));
}

assert.doesNotMatch(script, /data-settings-palette|setColorPalette\(settingsState/);
assert.match(themeCss, /\.infinite-canvas/);
assert.match(themeCss, /:root\[data-theme\]\s+\.canvas-mask-dialog\s*\{[^}]*background:\s*var\(--os-window-bg\)[^}]*color:\s*var\(--os-text\)/s, "mask editor consumes global window and text tokens");
assert.match(themeCss, /:root\[data-theme\]\s+\.canvas-crop-workbench-panel\s*\{[^}]*background:\s*var\(--os-window-bg\)[^}]*color:\s*var\(--os-text\)/s, "crop editor consumes global window and text tokens");
assert.match(themeCss, /:root\[data-theme\]\s+:is\(\.canvas-mask-toolbar button, \.canvas-mask-brush-control, \.canvas-mask-zoom-controls, \.canvas-crop-workbench-panel button, \.canvas-crop-workbench-panel select\)\s*\{[^}]*background:\s*var\(--os-field-bg\)/s, "mask and crop editor controls consume the global field token");
assert.match(themeCss, /\.canvas-agent-panel/);
assert.match(themeCss, /:root\[data-theme="dark"\]\s+\.canvas-agent-panel/, "Canvas Agent panel override must match legacy dark selector specificity");
assert.match(themeCss, /:root\[data-theme="dark"\]\s+:is\([^}]*\.canvas-agent-skill/, "Canvas Agent skill override must match legacy dark selector specificity");
assert.match(themeCss, /:root\[data-theme="dark"\]\s+\.canvas-agent-message\.is-user/, "Canvas Agent user messages need their own dark override");
assert.match(themeCss, /:root\[data-theme="dark"\]\s+\.canvas-agent-image-choice-actions button/, "Canvas Agent image action buttons need their own dark override");
assert.match(themeCss, /:root\[data-theme="dark"\]\s+\.canvas-agent-image-choice-actions small/, "Canvas Agent image action labels need their own dark override");

const legacyPaletteBlock = (selector) => Array.from(themeCss.matchAll(new RegExp(
  `:root\\[data-theme="light"\\]\\[data-palette\\]\\s+${selector},\\s*:root\\[data-theme="dark"\\]\\[data-palette\\]\\s+${selector}\\s*\\{([^}]*)\\}`,
  "g"
))).at(-1)?.[1] || "";

const legacyBodyOverride = legacyPaletteBlock("body");
assert.match(legacyBodyOverride, /background:\s*var\(--os-wallpaper-base\)\s*!important/);
assert.match(legacyBodyOverride, /color:\s*var\(--os-text\)\s*!important/);

const legacyTokenOverride = themeCss.match(/:root\[data-theme="(?:light|dark)"\]\[data-palette\]\s*\{([^}]*)\}/)?.[1] || "";
for (const [legacy, semantic] of [
  ["--accent", "--os-accent"],
  ["--rail-bg", "--os-sidebar-bg"],
  ["--settings-bg", "--os-surface-bg"],
  ["--menu-bg", "--os-window-bg"],
]) {
  assert.match(legacyTokenOverride, new RegExp(`${legacy}:\\s*var\\(${semantic}\\)\\s*!important`));
}

const legacyRailOverride = legacyPaletteBlock("\\.rail");
assert.match(legacyRailOverride, /background:\s*var\(--os-sidebar-bg\)\s*!important/);
assert.match(legacyRailOverride, /border-color:\s*var\(--os-border\)\s*!important/);

const legacySettingsOverride = legacyPaletteBlock("\\.settings-center");
assert.match(legacySettingsOverride, /background:\s*var\(--os-surface-bg\)\s*!important/);
assert.match(legacySettingsOverride, /color:\s*var\(--os-text\)\s*!important/);

const legacyMenuOverride = legacyPaletteBlock("\\.canvas-node-menu:not\\(\\.canvas-image-menu\\)");
assert.match(legacyMenuOverride, /background:\s*var\(--os-window-bg\)\s*!important/);
assert.match(legacyMenuOverride, /color:\s*var\(--os-text\)\s*!important/);

const legacyShellOverride = legacyPaletteBlock("\\.app-shell");
assert.match(legacyShellOverride, /background:\s*var\(--os-window-bg\)\s*!important/);
assert.match(legacyShellOverride, /color:\s*var\(--os-text\)\s*!important/);

const legacySidebarOverride = legacyPaletteBlock("\\.settings-sidebar");
assert.match(legacySidebarOverride, /background:\s*var\(--os-sidebar-bg\)\s*!important/);
assert.match(legacySidebarOverride, /border-color:\s*var\(--os-border\)\s*!important/);

const paletteViewTokenBlocks = Array.from(stylesCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)).filter(([, selector, declarations]) =>
  /\[data-palette(?:=|\])/.test(selector) && /#(?:imageView|chatView)\b/.test(selector) && /--darkroom-/.test(declarations)
);
assert.ok(paletteViewTokenBlocks.length > 0, "styles.css must expose palette view-token blocks for compatibility coverage");

const stalePaletteViewOverride = (viewId) => themeCss.match(new RegExp(
  `:root\\[data-theme="light"\\]\\[data-palette\\]\\s+${viewId},\\s*:root\\[data-theme="dark"\\]\\[data-palette\\]\\s+${viewId}\\s*\\{([^}]*)\\}`
))?.[1] || "";

for (const [, selector, declarations] of paletteViewTokenBlocks) {
  for (const viewId of ["#imageView", "#chatView"].filter((view) => selector.includes(view))) {
    const override = stalePaletteViewOverride(viewId);
    assert.notEqual(override, "", `${viewId} palette token block needs an explicit light/dark stale-palette override`);
    for (const token of declarations.matchAll(/(--darkroom-[\w-]+)\s*:/g)) {
      assert.match(override, new RegExp(`${token[1]}:\\s*var\\(--os-`), `${viewId} must remap ${token[1]} to an AI OS semantic token`);
    }
  }
}

const systemSettingsIndex = html.indexOf("system-settings.css");
const stylesIndex = html.indexOf("styles.css");
const canvasAgentIndex = html.indexOf("canvas-agent.css");
const globalThemeIndex = html.indexOf("ai-os-theme.css");
assert.notEqual(systemSettingsIndex, -1, "system-settings.css must be linked");
assert.notEqual(stylesIndex, -1, "styles.css must be linked");
assert.notEqual(canvasAgentIndex, -1, "canvas-agent.css must be linked");
assert.ok(globalThemeIndex > systemSettingsIndex, "ai-os-theme.css must load after system-settings.css");
assert.ok(globalThemeIndex > stylesIndex, "ai-os-theme.css must load after styles.css so legacy palette overrides lose the cascade");
assert.ok(globalThemeIndex > canvasAgentIndex, "ai-os-theme.css must load after canvas-agent.css so equivalent Canvas Agent selectors win the cascade");

console.log("AI OS global theme checks passed.");
