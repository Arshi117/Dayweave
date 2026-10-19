"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("desktopControls", {
  minimize: () => electron.ipcRenderer.send("window:minimize"),
  close: () => electron.ipcRenderer.send("window:close"),
  editCalendar: () => electron.ipcRenderer.invoke("desktop:edit"),
  reportEditorBusy: (busy) => electron.ipcRenderer.send("desktop:editor-busy", busy),
  onPrepare: (listener) => {
    const handler = async (_event, token) => {
      try {
        await listener();
        requestAnimationFrame(() => requestAnimationFrame(() => electron.ipcRenderer.send("desktop:prepared", token)));
      } catch {
        electron.ipcRenderer.send("desktop:prepare-failed", token);
      }
    };
    electron.ipcRenderer.on("desktop:prepare", handler);
    return () => electron.ipcRenderer.removeListener("desktop:prepare", handler);
  },
  pinToDesktop: () => electron.ipcRenderer.invoke("desktop:pin"),
  retryDesktop: () => electron.ipcRenderer.invoke("desktop:retry"),
  getState: () => electron.ipcRenderer.invoke("desktop:get-state"),
  onState: (listener) => {
    const handler = (_event, state) => listener(state);
    electron.ipcRenderer.on("desktop:state", handler);
    return () => electron.ipcRenderer.removeListener("desktop:state", handler);
  }
});
