"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const settings = require("../system-settings-ui");

assert.deepEqual(settings.sectionIdsForRole("user"), ["appearance", "account", "system"]);
assert.deepEqual(settings.sectionIdsForRole("superadmin"), ["appearance", "account", "system", "host", "providers"]);
assert.equal(settings.testRouteForCapabilities(["llm.chat", "image.generate"]), "/api/providers/test");
assert.equal(settings.testRouteForCapabilities(["image.generate"]), "/api/providers/test-image");
assert.equal(settings.testRouteForCapabilities(["video.generate"]), "/api/providers/test-video");
assert.equal(settings.testRouteForCapabilities(["audio.generate"]), "/api/providers/test-audio");
assert.equal(settings.testRouteForCapabilities(["llm.chat.vision"]), "/api/providers/test-vision");
assert.equal(settings.testRouteForCapabilities(["image.edit"]), "");

assert.deepEqual(settings.normalizePreferences({
  appearance: { theme: "dark", scale: 1.25, animations: "reduced", ignored: "no" },
  canvas: { theme: "light", ignored: "no" },
  providers: [{ apiKey: "must-not-survive" }],
}), {
  appearance: { theme: "dark", scale: 1.25, animations: "reduced" },
  canvas: { theme: "light" },
});

const fakeRoot = { dataset: {}, style: { setProperty(name, value) { this[name] = value; } } };
settings.applyPreferences({
  appearance: { theme: "dark", scale: 1.5, animations: "reduced" },
  canvas: { theme: "light" },
}, fakeRoot, { matches: false });
assert.equal(fakeRoot.dataset.theme, "dark");
assert.equal(fakeRoot.dataset.themeMode, "dark");
assert.equal(fakeRoot.dataset.canvasTheme, "light");
assert.equal(fakeRoot.dataset.animations, "reduced");
assert.equal(fakeRoot.style["--os-ui-scale"], "1.5");

const ui = read("system-settings-ui.js");
assert.match(ui, /data-settings-section/);
assert.match(ui, /role\s*===\s*["']superadmin["']/);
assert.match(ui, /\/api\/preferences/);
assert.match(ui, /\/api\/providers/);
assert.match(ui, /\/api\/protocols/);
assert.match(ui, /\/api\/providers\/verify-protocol/);
assert.match(ui, /\/api\/providers\/models/);
assert.match(ui, /\/api\/providers\/reorder/);
assert.match(ui, /\/api\/providers\/models\/reorder/);
assert.match(ui, /data-model-test/);
assert.match(ui, /\/api\/providers\/test/);
assert.match(ui, /apiKeyMasked/);
assert.doesNotMatch(ui, /\/api\/settings\/providers\/key/);
assert.doesNotMatch(ui, /successRate|circuit|half-open|monitoring/i);

const html = read("index.html");
assert.match(html, /system-settings\.css/);
assert.match(html, /id="aiOsSystemSettingsRoot"/);
assert.match(html, /ai-os-display\.js[\s\S]*system-settings-ui\.js/);
assert.match(html, /system-settings-ui\.js[\s\S]*desktop-shell\.js/);

const css = read("system-settings.css");
assert.match(css, /\.ai-os-settings-layout/);
assert.match(css, /\.settings-theme-preview/);
assert.match(css, /html\[data-theme="dark"\]/);
assert.match(css, /@media\s*\(max-width:/);
assert.match(css, /prefers-reduced-motion|data-animations="reduced"/);

const server = read("server.js");
assert.match(server, /requestPath\s*===\s*["']\/api\/preferences["']/);
assert.match(server, /async function handlePreferences/);
assert.match(server, /systemDb\.getUserPreferences\(req\.auth\.user\.id\)/);
assert.match(server, /systemDb\.setUserPreferences\(req\.auth\.user\.id/);
assert.match(server, /invalid_preference_field/);

const shell = read("desktop-shell.js");
assert.match(shell, /AiOsSystemSettings\.createSettingsApp/);
assert.match(shell, /settingsApp\.load/);

console.log("System settings UI checks passed.");
