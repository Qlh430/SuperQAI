"use strict";

/**
 * 账户管理界面的契约检查：
 *   - 三个账号操作按钮都指向真实接口（重置密码 / 退出所有设备 / 停用恢复）
 *   - 显示名称可以就地修改，空名称被拦下，Esc 取消
 *   - 改自己名字时只刷新顶栏文案，不重建桌面运行时
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

const ui = read("account-management-ui.js");
assert.match(ui, /\/api\/admin\/users\/\$\{[^}]+\}\/reset-password/, "重置密码打真实的重置接口");
assert.match(ui, /\/api\/admin\/users\/\$\{[^}]+\}\/revoke-sessions/, "退出所有设备打真实的下线接口");
assert.match(ui, /method:\s*"PATCH",\s*body:\s*\{\s*status\s*\}/, "停用/恢复走账号状态更新接口");
assert.match(ui, /data-account-action="reset"/, "详情页有重置密码按钮");
assert.match(ui, /data-account-action="revoke"/, "详情页有退出所有设备按钮");
assert.match(ui, /data-account-action="toggle"/, "详情页有停用/恢复按钮");

assert.match(ui, /data-account-action="edit-name"/, "显示名称旁边要有修改入口");
assert.match(ui, /data-account-name-form/, "改名用就地表单");
assert.match(ui, /maxlength="24"/, "显示名称要有长度上限");
assert.match(ui, /method:\s*"PATCH",\s*body:\s*\{\s*displayName:\s*next\s*\}/, "改名打 PATCH displayName");
assert.match(ui, /显示名称不能为空/, "空名称要在前端先拦一次");
assert.match(ui, /event\.key !== "Escape"/, "Esc 取消编辑");
assert.match(ui, /ai-os-account-field-edit/, "修改按钮有独立样式钩子");
assert.match(
  ui,
  /getSession\?\.\(\)\?\.user\?\.id === userId[\s\S]{0,160}updateSessionUser/,
  "改自己名字后同步顶栏账号文案",
);

const shell = read("desktop-shell.js");
assert.match(shell, /function syncSessionChrome\(\)/, "顶栏账号文案统一由一个函数刷新");
assert.match(shell, /function updateSessionUser\(patch = \{\}\)/, "shell 暴露只刷新账号文案的入口");
assert.match(shell, /updateSessionUser,\s*\n\s*toast,/, "入口挂在 window.AiOsDesktop 上");

const css = read("desktop-shell.css");
assert.match(css, /\.ai-os-account-name-form \{/, "就地改名表单有布局样式");
assert.match(css, /\.ai-os-account-field-edit \{/, "修改按钮有样式");
assert.match(css, /\.ai-os-account-name-form button\[data-account-action="save-name"\]/, "保存按钮有强调样式");

const html = read("index.html");
assert.match(html, /account-management-ui\.js\?v=20260921-share-permission/);

console.log("Account management UI checks passed.");
