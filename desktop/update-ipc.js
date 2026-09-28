"use strict";
function registerUpdateIpc({ ipcMain, updater, getWindow, getLocalUrl }) {
  const trusted = event => {
    const window = getWindow();
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return false;
    try { return new URL(event.senderFrame.url).origin === new URL(getLocalUrl()).origin; } catch { return false; }
  };
  for (const [channel, method] of [["host.getUpdateStatus", "getStatus"], ["host.checkForUpdates", "check"], ["host.downloadUpdate", "download"], ["host.restartToUpdate", "restart"]]) {
    ipcMain.handle(channel, event => {
      if (!trusted(event)) throw Error("更新操作仅限主桌面窗口。");
      return updater[method]();
    });
  }
  ipcMain.handle("host.rollbackComponent", (event, componentId) => {
    if (!trusted(event)) throw Error("更新操作仅限主桌面窗口。");
    return updater.rollbackComponent(String(componentId || ""));
  });
  return updater.subscribe(status => {
    const window = getWindow();
    if (window && !window.isDestroyed() && trusted({sender:window.webContents,senderFrame:window.webContents.mainFrame})) window.webContents.send("host.updateStatus", status);
  });
}
module.exports = { registerUpdateIpc };
