"use strict";

const fs = require("node:fs");
const path = require("node:path");

function getLoginItemOptions(app, enabled, legacy = false) {
  const portableRoot = process.env.AI_OS_PORTABLE_ROOT;
  const developmentArgs = app.isPackaged || portableRoot ? [] : [path.join(__dirname, "main.js")];
  const brandedLauncher = portableRoot && path.join(portableRoot, "BenDo.exe");
  const useLegacy = legacy || (portableRoot && !fs.existsSync(brandedLauncher));
  return {
    openAtLogin: Boolean(enabled),
    path: portableRoot ? (useLegacy ? path.join(portableRoot, "AI OS.exe") : brandedLauncher) : app.getPath("exe"),
    args: [...developmentArgs, "--hidden"],
    name: useLegacy ? "AI OS Host" : "BenDo",
  };
}

function getAutostart(app) {
  const settings = app.getLoginItemSettings(getLoginItemOptions(app, false));
  const oldSettings = app.getLoginItemSettings(getLoginItemOptions(app, false, true));
  return { enabled: Boolean(settings.openAtLogin || oldSettings.openAtLogin), wasOpenedAtLogin: Boolean(settings.wasOpenedAtLogin || oldSettings.wasOpenedAtLogin) };
}

function setAutostart(app, enabled) {
  const options = getLoginItemOptions(app, enabled);
  app.setLoginItemSettings(options);
  if (options.name === "BenDo") app.setLoginItemSettings(getLoginItemOptions(app, false, true));
  return getAutostart(app);
}

module.exports = {
  getAutostart,
  getLoginItemOptions,
  setAutostart,
};
