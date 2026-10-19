"use strict";
const electron = require("electron");
const node_path = require("node:path");
const node_child_process = require("node:child_process");
const node_readline = require("node:readline");
const path = require("path");
const scriptPath = path.join(__dirname, "./chunks/desktop-host-CY_OvgwW.ps1");
const sourcePath = path.join(__dirname, "./chunks/DesktopHost-Bz0Gv5FY.cs");
class DesktopHost {
  constructor(onFailure) {
    this.onFailure = onFailure;
  }
  onFailure;
  process = null;
  pending = /* @__PURE__ */ new Map();
  sequence = 0;
  stopped = false;
  ready = false;
  stderr = "";
  async start(handle) {
    if (process.platform !== "win32") throw new Error("Desktop attachment requires Windows.");
    const hwnd = handle.length === 8 ? handle.readBigUInt64LE().toString() : handle.readUInt32LE().toString();
    const powershell = node_path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const startup = this.waitFor(0, 2e4);
    try {
      this.process = node_child_process.spawn(powershell, [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-WindowHandle",
        hwnd,
        "-OwnerProcessId",
        String(process.pid),
        "-SourcePath",
        sourcePath
      ], { windowsHide: true, stdio: "pipe", shell: false });
      this.process.stderr.on("data", (chunk) => {
        this.stderr = (this.stderr + String(chunk)).slice(-4e3);
      });
      this.process.stdin.on("error", (error) => this.fail(error));
      this.process.on("error", (error) => this.fail(error));
      this.process.on("exit", (code) => this.fail(new Error(`Desktop helper exited (${code}): ${this.stderr}`)));
      const lines = node_readline.createInterface({ input: this.process.stdout });
      lines.on("line", (line) => {
        try {
          const reply = JSON.parse(line.replace(/^\uFEFF/, ""));
          const pending = this.pending.get(reply.id);
          if (!pending) return;
          clearTimeout(pending.timer);
          this.pending.delete(reply.id);
          if (reply.ok) pending.resolve(reply.result);
          else pending.reject(new Error(reply.error || "Desktop helper command failed."));
        } catch {
          console.warn("Unexpected desktop helper output:", line.slice(0, 250));
        }
      });
      await startup;
      this.ready = true;
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
      await startup.catch(() => {
      });
      await this.stop();
      throw error;
    }
  }
  waitFor(id, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Windows desktop did not respond in time."));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
    });
  }
  fail(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    if (!this.stopped && this.ready) {
      this.ready = false;
      this.onFailure(error);
    }
  }
  async request(command, data = {}) {
    if (this.stopped || !this.ready || !this.process?.stdin.writable) throw new Error("Desktop helper is unavailable.");
    const id = ++this.sequence;
    const reply = this.waitFor(id, 5e3);
    this.process.stdin.write(JSON.stringify({ id, command, ...data }) + "\n", (error) => {
      if (error) this.fail(error);
    });
    return reply;
  }
  attach(bounds) {
    return this.request("attach", { ...bounds });
  }
  attachControl(handle, bounds) {
    const hwnd = handle.length === 8 ? handle.readBigUInt64LE().toString() : handle.readUInt32LE().toString();
    return this.request("attach-control", { handle: hwnd, ...bounds });
  }
  resizeControl(bounds) {
    return this.request("resize-control", { ...bounds });
  }
  resize(bounds) {
    return this.request("resize", { ...bounds });
  }
  setVisible(visible) {
    return this.request("visible", { visible });
  }
  showDesktopView() {
    return this.request("show-desktop");
  }
  async isAttached() {
    return await this.request("status") === true;
  }
  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.fail(new Error("Desktop helper stopped."));
    const child = this.process;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        child.kill();
        resolve();
      }, 1500);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      child.stdin.end();
    });
  }
}
function cornerControlBounds(viewportWidth) {
  const width = 112, height = 36;
  const right = viewportWidth <= 1100 ? 28 : 40;
  return { x: Math.max(0, viewportWidth - right - width), y: 26, width, height };
}
let editor = null;
let wallpaper = null;
let desktopControl = null;
let host = null;
let tray = null;
let shortcutAvailable = false;
let wallpaperStatus = "starting";
let wallpaperError = "";
let mode = "desktop";
let quitting = false;
let connecting = null;
let watchdog = null;
let retryTimer = null;
let checking = false;
let recoveryAttempts = 0;
let visibilityVersion = 0;
let editorBusy = false;
let prepareSequence = 0;
const preparations = /* @__PURE__ */ new Map();
function state(surface = "editor") {
  return { mode, surface, shortcutAvailable, wallpaperStatus, wallpaperError };
}
function publishState() {
  if (editor && !editor.isDestroyed()) editor.webContents.send("desktop:state", state("editor"));
  if (wallpaper && !wallpaper.isDestroyed()) wallpaper.webContents.send("desktop:state", state("wallpaper"));
  if (desktopControl && !desktopControl.isDestroyed()) desktopControl.webContents.send("desktop:state", state("control"));
  refreshTray();
}
function desktopBounds() {
  return electron.screen.dipToScreenRect(null, electron.screen.getPrimaryDisplay().workArea);
}
function controlBounds() {
  const area = electron.screen.getPrimaryDisplay().workArea;
  const corner = cornerControlBounds(area.width);
  return { ...corner, x: area.x + corner.x, y: area.y + corner.y };
}
function physicalControlBounds() {
  return electron.screen.dipToScreenRect(null, controlBounds());
}
function prepareWindow(window) {
  if (!window || window.isDestroyed()) return Promise.resolve(false);
  const token = ++prepareSequence;
  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(false), 3e3);
    const finish = (ready) => {
      clearTimeout(timer);
      preparations.delete(token);
      resolve(ready);
    };
    preparations.set(token, { senderId: window.webContents.id, finish });
    window.webContents.send("desktop:prepare", token);
  });
}
function makeWindow(surface) {
  const window = new electron.BrowserWindow({
    ...surface === "control" ? controlBounds() : electron.screen.getPrimaryDisplay().workArea,
    title: surface === "editor" ? "Dayweave" : "Dayweave · 桌面日历",
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: surface !== "wallpaper",
    skipTaskbar: surface !== "editor",
    autoHideMenuBar: true,
    webPreferences: {
      preload: node_path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("did-fail-load", (_, code, description) => console.error("Dayweave load:", code, description));
  window.webContents.on("render-process-gone", (_, details) => {
    console.error("Dayweave renderer:", surface, details.reason);
    if (surface === "wallpaper" && wallpaper === window || surface === "control" && desktopControl === window) lostDesktop(new Error("Desktop renderer stopped."));
  });
  return window;
}
async function loadWindow(window, surface) {
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL);
    url.searchParams.set("surface", surface);
    await window.loadURL(url.toString());
  } else await window.loadFile(node_path.join(__dirname, "../renderer/index.html"), { query: { surface } });
}
async function setDesktopVisible(visible) {
  if (!host || !wallpaper || wallpaper.isDestroyed() || !desktopControl || desktopControl.isDestroyed()) {
    if (visible) throw new Error("Desktop windows are unavailable.");
    return;
  }
  if (visible) {
    desktopControl.setBounds(controlBounds());
    wallpaper.showInactive();
    desktopControl.showInactive();
  } else {
    wallpaper.hide();
    desktopControl.hide();
  }
  await host.setVisible(visible);
}
async function editCalendar() {
  if (!editor || editor.isDestroyed() || quitting) return;
  mode = "editing";
  const version = ++visibilityVersion;
  publishState();
  if (editor.isMinimized()) editor.restore();
  editor.setBounds(electron.screen.getPrimaryDisplay().workArea);
  await prepareWindow(editor);
  if (version !== visibilityVersion || quitting || !editor || editor.isDestroyed()) return;
  if (editor.isMinimized()) editor.restore();
  editor.show();
  editor.focus();
  try {
    await setDesktopVisible(false);
  } catch (error) {
    console.warn("Hide desktop:", error);
  }
}
async function showDesktop() {
  if (editorBusy) {
    await editCalendar();
    return state();
  }
  mode = "desktop";
  const version = ++visibilityVersion;
  publishState();
  if (wallpaperStatus !== "attached") await connectDesktop();
  if (version !== visibilityVersion || quitting) return state();
  if (wallpaperStatus === "attached" && host) {
    try {
      if (!await prepareWindow(wallpaper)) throw new Error("Desktop calendar is not ready.");
      if (version !== visibilityVersion || quitting) return state();
      editor?.hide();
      await host.showDesktopView();
      if (version !== visibilityVersion || quitting) return state();
      await setDesktopVisible(true);
      if (version !== visibilityVersion || quitting) return state();
      editor?.hide();
      publishState();
      return state();
    } catch (error) {
      if (editor && !editor.isDestroyed()) {
        if (editor.isMinimized()) editor.restore();
        editor.show();
        editor.focus();
      }
      lostDesktop(error);
    }
  }
  await editCalendar();
  return state();
}
async function hideCalendar() {
  mode = "hidden";
  ++visibilityVersion;
  editor?.hide();
  publishState();
  try {
    await setDesktopVisible(false);
  } catch (error) {
    console.warn("Hide desktop:", error);
  }
}
function refreshTray() {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(electron.Menu.buildFromTemplate([
    { label: "编辑日程", click: () => {
      void editCalendar();
    } },
    { label: mode === "editing" ? "固定桌面" : "显示桌面日历", enabled: wallpaperStatus !== "starting" && !editorBusy, click: () => {
      void showDesktop();
    } },
    { label: "重新连接桌面", enabled: wallpaperStatus !== "starting", click: () => {
      void retryDesktop();
    } },
    { label: "隐藏日历", click: () => {
      void hideCalendar();
    } },
    { type: "separator" },
    { label: "退出 Dayweave", click: () => electron.app.quit() }
  ]));
}
function createTray() {
  const size = 32, pixels = Buffer.alloc(size * size * 4);
  for (let y = 3; y < 29; y++) for (let x = 3; x < 29; x++) {
    const white = y === 10 || y >= 15 && y <= 23 && (x >= 9 && x <= 12 || x >= 19 && x <= 22);
    const i = (y * size + x) * 4;
    pixels[i] = white ? 255 : 223;
    pixels[i + 1] = white ? 255 : 123;
    pixels[i + 2] = white ? 255 : 47;
    pixels[i + 3] = 255;
  }
  try {
    tray = new electron.Tray(electron.nativeImage.createFromBitmap(pixels, { width: size, height: size }));
    tray.setToolTip("Dayweave · 点击编辑日程");
    tray.on("click", () => {
      void editCalendar();
    });
    refreshTray();
  } catch (error) {
    console.error("Tray unavailable:", error);
  }
}
async function disposeWallpaper() {
  const oldHost = host, oldWindow = wallpaper, oldControl = desktopControl;
  host = null;
  wallpaper = null;
  desktopControl = null;
  await oldHost?.stop();
  if (oldWindow && !oldWindow.isDestroyed()) oldWindow.destroy();
  if (oldControl && !oldControl.isDestroyed()) oldControl.destroy();
}
function connectDesktop() {
  if (connecting) return connecting;
  if (quitting) return Promise.resolve();
  connecting = (async () => {
    wallpaperStatus = "starting";
    wallpaperError = "";
    publishState();
    try {
      await disposeWallpaper();
      if (quitting) return;
      if (process.platform !== "win32") throw new Error("Windows is required.");
      if (!tray && !shortcutAvailable) throw new Error("No tray or shortcut is available to return to editing.");
      const window = makeWindow("wallpaper");
      wallpaper = window;
      const control = makeWindow("control");
      desktopControl = control;
      window.setIgnoreMouseEvents(true);
      window.on("closed", () => {
        if (wallpaper === window && !quitting) lostDesktop(new Error("Desktop window was closed."));
      });
      control.on("closed", () => {
        if (desktopControl === control && !quitting) lostDesktop(new Error("Desktop control was closed."));
      });
      await Promise.all([loadWindow(window, "wallpaper"), loadWindow(control, "control")]);
      if (quitting || window.isDestroyed()) return;
      const bridge = new DesktopHost((error) => {
        if (host === bridge) lostDesktop(error);
      });
      host = bridge;
      await bridge.start(window.getNativeWindowHandle());
      const strategy = await bridge.attach(desktopBounds());
      await bridge.attachControl(control.getNativeWindowHandle(), physicalControlBounds());
      if (!await prepareWindow(window)) throw new Error("Desktop calendar is not ready.");
      if (quitting) return;
      await setDesktopVisible(mode === "desktop");
      wallpaperStatus = "attached";
      wallpaperError = "";
      console.info("Dayweave desktop attached:", strategy);
      publishState();
    } catch (error) {
      console.error("Desktop attachment failed:", error);
      await disposeWallpaper();
      if (!quitting) {
        wallpaperStatus = "unavailable";
        wallpaperError = "暂时无法贴到桌面。日程仍可编辑，请点击“重试贴到桌面”。";
        publishState();
        if (recoveryAttempts === 0 || recoveryAttempts >= 3) await editCalendar();
        else scheduleRecovery();
      }
    }
  })().finally(() => {
    connecting = null;
  });
  return connecting;
}
function scheduleRecovery() {
  if (quitting || retryTimer || recoveryAttempts >= 3) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    recoveryAttempts++;
    void connectDesktop();
  }, 2500);
}
function lostDesktop(error) {
  if (quitting || wallpaperStatus === "starting" || wallpaperStatus === "unavailable") return;
  console.warn("Desktop connection lost:", error);
  wallpaperStatus = "unavailable";
  wallpaperError = recoveryAttempts >= 3 ? "暂时无法重新贴到桌面。日程仍可编辑，请点击“重试贴到桌面”。" : "桌面连接已中断，正在重新连接。";
  publishState();
  if (recoveryAttempts >= 3) void editCalendar();
  else scheduleRecovery();
}
async function retryDesktop() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  recoveryAttempts = 0;
  await connectDesktop();
  if (wallpaperStatus === "attached") return showDesktop();
  return state();
}
function isEditor(senderId) {
  return editor?.webContents.id === senderId;
}
function isControl(senderId) {
  return desktopControl?.webContents.id === senderId;
}
electron.ipcMain.handle("desktop:edit", (event) => {
  if (isEditor(event.sender.id) || isControl(event.sender.id)) return editCalendar();
});
electron.ipcMain.on("desktop:editor-busy", (event, busy) => {
  if (isEditor(event.sender.id)) {
    editorBusy = busy === true;
    refreshTray();
  }
});
for (const channel of ["desktop:prepared", "desktop:prepare-failed"]) {
  electron.ipcMain.on(channel, (event, token) => {
    if (typeof token !== "number") return;
    const pending = preparations.get(token);
    if (pending?.senderId === event.sender.id) pending.finish(channel === "desktop:prepared");
  });
}
electron.ipcMain.on("window:minimize", (event) => {
  if (isEditor(event.sender.id) && mode !== "desktop") void showDesktop();
});
electron.ipcMain.on("window:close", (event) => {
  if (isEditor(event.sender.id)) electron.app.quit();
});
electron.ipcMain.handle("desktop:get-state", (event) => state(isEditor(event.sender.id) ? "editor" : isControl(event.sender.id) ? "control" : "wallpaper"));
electron.ipcMain.handle("desktop:pin", (event) => isEditor(event.sender.id) ? showDesktop() : state("wallpaper"));
electron.ipcMain.handle("desktop:retry", (event) => isEditor(event.sender.id) ? retryDesktop() : state("wallpaper"));
if (!electron.app.requestSingleInstanceLock()) electron.app.quit();
else {
  electron.app.on("second-instance", () => {
    void editCalendar();
  });
  electron.app.whenReady().then(async () => {
    createTray();
    shortcutAvailable = electron.globalShortcut.register("CommandOrControl+Alt+D", () => {
      void editCalendar();
    });
    editor = makeWindow("editor");
    editor.on("closed", () => {
      editor = null;
      if (!quitting) electron.app.quit();
    });
    editor.on("minimize", () => {
      if (mode !== "desktop") void showDesktop();
    });
    await loadWindow(editor, "editor");
    await connectDesktop();
    if (quitting) return;
    watchdog = setInterval(async () => {
      if (checking || connecting || quitting || wallpaperStatus !== "attached" || !host) return;
      checking = true;
      try {
        if (!await host.isAttached()) lostDesktop(new Error("Desktop host changed."));
        else recoveryAttempts = 0;
      } catch (error) {
        lostDesktop(error);
      } finally {
        checking = false;
      }
    }, 5e3);
    const resize = async () => {
      if (quitting) return;
      if (editor && !editor.isDestroyed()) editor.setBounds(electron.screen.getPrimaryDisplay().workArea);
      if (desktopControl && !desktopControl.isDestroyed()) desktopControl.setBounds(controlBounds());
      if (wallpaperStatus === "attached" && host) {
        try {
          await host.resize(desktopBounds());
          await host.resizeControl(physicalControlBounds());
        } catch (error) {
          lostDesktop(error);
        }
      }
    };
    electron.screen.on("display-metrics-changed", () => {
      void resize();
    });
    electron.screen.on("display-added", () => {
      void resize();
    });
    electron.screen.on("display-removed", () => {
      void resize();
    });
    electron.app.on("activate", () => {
      void editCalendar();
    });
  }).catch((error) => {
    console.error(error);
    electron.app.quit();
  });
}
electron.app.on("before-quit", (event) => {
  if (quitting) return;
  quitting = true;
  if (watchdog) clearInterval(watchdog);
  if (retryTimer) clearTimeout(retryTimer);
  electron.globalShortcut.unregisterAll();
  for (const pending of preparations.values()) pending.finish(false);
  if (host || wallpaper || desktopControl) {
    event.preventDefault();
    void disposeWallpaper().finally(() => electron.app.quit());
  }
});
electron.app.on("window-all-closed", () => {
  if (!quitting) electron.app.quit();
});
electron.app.on("will-quit", () => {
  tray?.destroy();
});
