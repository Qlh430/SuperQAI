"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aiOsHost", Object.freeze({
  getStatus: () => ipcRenderer.invoke("host.getStatus"),
  getDevReloadStatus: () => ipcRenderer.invoke("host.getDevReloadStatus"),
  triggerDevReload: () => ipcRenderer.invoke("host.triggerDevReload"),
  openSystem: () => ipcRenderer.invoke("host.openSystem"),
  openExternal: (url) => ipcRenderer.invoke("host.openExternal", String(url || "")),
  getAutostart: () => ipcRenderer.invoke("host.getAutostart"),
  setAutostart: (enabled) => ipcRenderer.invoke("host.setAutostart", Boolean(enabled)),
  retryService: () => ipcRenderer.invoke("host.retryService"),
  quit: () => ipcRenderer.invoke("host.quit"),
  getUpdateStatus: () => ipcRenderer.invoke("host.getUpdateStatus"),
  checkForUpdates: () => ipcRenderer.invoke("host.checkForUpdates"),
  downloadUpdate: () => ipcRenderer.invoke("host.downloadUpdate"),
  rollbackComponent: (componentId) => ipcRenderer.invoke("host.rollbackComponent", String(componentId || "")),
  restartToUpdate: () => ipcRenderer.invoke("host.restartToUpdate"),
  onUpdateStatus: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("host.updateStatus", listener);
    return () => ipcRenderer.removeListener("host.updateStatus", listener);
  },
  onDevReloadStatus: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("host.devReloadStatus", listener);
    return () => ipcRenderer.removeListener("host.devReloadStatus", listener);
  },
}));
