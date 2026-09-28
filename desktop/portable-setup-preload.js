"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aiOsSetup", Object.freeze({
  getState: () => ipcRenderer.invoke("portable-setup:get-state"),
  sendAction: (type) => ipcRenderer.invoke("portable-setup:action", String(type || "")),
  onState: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("portable-setup:state", listener);
    return () => ipcRenderer.removeListener("portable-setup:state", listener);
  },
}));
