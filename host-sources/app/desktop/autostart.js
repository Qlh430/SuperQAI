"use strict";

const path = require("node:path");

function getLoginItemOptions(app, enabled) {
  const portableRoot = process.env.AI_OS_PORTABLE_ROOT;
  const developmentArgs = app.isPackaged || portableRoot ? [] : [path.join(__dirname, "main.js")];
  return {
    openAtLogin: Boolean(enabled),
    path: portableRoot ? path.join(portableRoot, "AI OS.exe") : app.getPath("exe"),
    args: [...developmentArgs, "--hidden"],
    name: "AI OS Host",
  };
}

function getAutostart(app) {
  const settings = app.getLoginItemSettings(getLoginItemOptions(app, false));
  return { enabled: Boolean(settings.openAtLogin), wasOpenedAtLogin: Boolean(settings.wasOpenedAtLogin) };
}

function setAutostart(app, enabled) {
  app.setLoginItemSettings(getLoginItemOptions(app, enabled));
  return getAutostart(app);
}

module.exports = {
  getAutostart,
  getLoginItemOptions,
  setAutostart,
};
