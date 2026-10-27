"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("focusControls", {
  hide: () => electron.ipcRenderer.send("focus:hide"),
  resize: (height, calendar = false, expanded = false) => electron.ipcRenderer.send("focus:resize", height, calendar, expanded),
  beginDimensionResize: (target, edge) => electron.ipcRenderer.send("focus:dimension-start", target, edge),
  moveDimensionResize: () => electron.ipcRenderer.send("focus:dimension-move"),
  endDimensionResize: () => electron.ipcRenderer.send("focus:dimension-end"),
  stepDimensionResize: (target, edge, dx, dy) => electron.ipcRenderer.send("focus:dimension-step", target, edge, dx, dy),
  onPlacement: (listener) => {
    const handler = (_event, placement) => listener(placement);
    electron.ipcRenderer.on("focus:placement", handler);
    return () => electron.ipcRenderer.removeListener("focus:placement", handler);
  },
  onOpenCalendar: (listener) => {
    const handler = () => listener();
    electron.ipcRenderer.on("focus:open-calendar", handler);
    return () => electron.ipcRenderer.removeListener("focus:open-calendar", handler);
  },
  onOpenSettings: (listener) => {
    const handler = () => listener();
    electron.ipcRenderer.on("focus:open-settings", handler);
    return () => electron.ipcRenderer.removeListener("focus:open-settings", handler);
  },
  openCalendar: () => electron.ipcRenderer.invoke("focus:calendar"),
  getSubscription: () => electron.ipcRenderer.invoke("focus:subscription-state"),
  getCalendarSource: (id) => electron.ipcRenderer.invoke("focus:calendar-source", id),
  saveSubscription: (url) => electron.ipcRenderer.invoke("focus:subscription-save", url),
  refreshSubscription: () => electron.ipcRenderer.invoke("focus:subscription-refresh"),
  removeSubscription: () => electron.ipcRenderer.invoke("focus:subscription-remove"),
  setCalendarRange: (range) => electron.ipcRenderer.invoke("focus:subscription-range", range),
  getGoogle: () => electron.ipcRenderer.invoke("focus:google-state"),
  configureGoogle: () => electron.ipcRenderer.invoke("focus:google-configure"),
  connectGoogle: () => electron.ipcRenderer.invoke("focus:google-connect"),
  cancelGoogle: () => electron.ipcRenderer.invoke("focus:google-cancel"),
  refreshGoogle: () => electron.ipcRenderer.invoke("focus:google-refresh"),
  disconnectGoogle: () => electron.ipcRenderer.invoke("focus:google-disconnect"),
  selectGoogleCalendars: (ids) => electron.ipcRenderer.invoke("focus:google-select", ids),
  setGoogleRange: (range) => electron.ipcRenderer.invoke("focus:google-range", range),
  openGoogleEvent: (id) => electron.ipcRenderer.invoke("focus:google-open-event", id),
  onGoogle: (listener) => {
    const handler = (_event, snapshot) => listener(snapshot);
    electron.ipcRenderer.on("focus:google-state", handler);
    return () => electron.ipcRenderer.removeListener("focus:google-state", handler);
  },
  getTickTick: () => electron.ipcRenderer.invoke("focus:ticktick-state"),
  getCalendarLinks: () => electron.ipcRenderer.invoke("focus:links-state"),
  addCalendarLink: (url) => electron.ipcRenderer.invoke("focus:links-add", url),
  refreshCalendarLink: (id) => electron.ipcRenderer.invoke("focus:links-refresh", id),
  removeCalendarLink: (id) => electron.ipcRenderer.invoke("focus:links-remove", id),
  setCalendarLinksRange: (range) => electron.ipcRenderer.invoke("focus:links-range", range),
  onCalendarLinks: (listener) => {
    const handler = (_event, state) => listener(state);
    electron.ipcRenderer.on("focus:links-state", handler);
    return () => electron.ipcRenderer.removeListener("focus:links-state", handler);
  },
  saveTickTick: (url) => electron.ipcRenderer.invoke("focus:ticktick-save", url),
  refreshTickTick: () => electron.ipcRenderer.invoke("focus:ticktick-refresh"),
  removeTickTick: () => electron.ipcRenderer.invoke("focus:ticktick-remove"),
  setTickTickRange: (range) => electron.ipcRenderer.invoke("focus:ticktick-range", range),
  onTickTick: (listener) => {
    const handler = (_event, snapshot) => listener(snapshot);
    electron.ipcRenderer.on("focus:ticktick-state", handler);
    return () => electron.ipcRenderer.removeListener("focus:ticktick-state", handler);
  },
  getMicrosoft: () => electron.ipcRenderer.invoke("focus:microsoft-state"),
  configureMicrosoft: (id) => electron.ipcRenderer.invoke("focus:microsoft-configure", id),
  connectMicrosoft: () => electron.ipcRenderer.invoke("focus:microsoft-connect"),
  cancelMicrosoft: () => electron.ipcRenderer.invoke("focus:microsoft-cancel"),
  refreshMicrosoft: () => electron.ipcRenderer.invoke("focus:microsoft-refresh"),
  disconnectMicrosoft: () => electron.ipcRenderer.invoke("focus:microsoft-disconnect"),
  selectMicrosoftLists: (ids) => electron.ipcRenderer.invoke("focus:microsoft-select", ids),
  onMicrosoft: (listener) => {
    const handler = (_event, snapshot) => listener(snapshot);
    electron.ipcRenderer.on("focus:microsoft-state", handler);
    return () => electron.ipcRenderer.removeListener("focus:microsoft-state", handler);
  },
  onSubscription: (listener) => {
    const handler = (_event, snapshot) => listener(snapshot);
    electron.ipcRenderer.on("focus:subscription", handler);
    return () => electron.ipcRenderer.removeListener("focus:subscription", handler);
  }
});
