import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, screen, Tray } from 'electron'
import { join } from 'node:path'
import { DesktopHost } from './desktop-host'
import { cornerControlBounds } from '../shared/desktop-layout'
import type { DesktopState } from '../renderer/src/types'

let editor: BrowserWindow | null = null
let wallpaper: BrowserWindow | null = null
let desktopControl: BrowserWindow | null = null
let host: DesktopHost | null = null
let tray: Tray | null = null
let shortcutAvailable = false
let wallpaperStatus: DesktopState['wallpaperStatus'] = 'starting'
let wallpaperError = ''
let mode: DesktopState['mode'] = 'desktop'
let quitting = false
let connecting: Promise<void> | null = null
let watchdog: NodeJS.Timeout | null = null
let retryTimer: NodeJS.Timeout | null = null
let checking = false
let recoveryAttempts = 0
let visibilityVersion = 0
let editorBusy = false
let prepareSequence = 0
const preparations = new Map<number, { senderId: number; finish: (ready: boolean) => void }>()

function state(surface: DesktopState['surface'] = 'editor'): DesktopState {
  return { mode, surface, shortcutAvailable, wallpaperStatus, wallpaperError }
}
function publishState() {
  if (editor && !editor.isDestroyed()) editor.webContents.send('desktop:state', state('editor'))
  if (wallpaper && !wallpaper.isDestroyed()) wallpaper.webContents.send('desktop:state', state('wallpaper'))
  if (desktopControl && !desktopControl.isDestroyed()) desktopControl.webContents.send('desktop:state', state('control'))
  refreshTray()
}
function desktopBounds() {
  return screen.dipToScreenRect(null, screen.getPrimaryDisplay().workArea)
}
function controlBounds() {
  const area = screen.getPrimaryDisplay().workArea
  const corner = cornerControlBounds(area.width)
  return { ...corner, x: area.x + corner.x, y: area.y + corner.y }
}
function physicalControlBounds() { return screen.dipToScreenRect(null, controlBounds()) }
function prepareWindow(window: BrowserWindow | null): Promise<boolean> {
  if (!window || window.isDestroyed()) return Promise.resolve(false)
  const token = ++prepareSequence
  return new Promise(resolve => {
    const timer = setTimeout(() => finish(false), 3000)
    const finish = (ready: boolean) => {
      clearTimeout(timer)
      preparations.delete(token)
      resolve(ready)
    }
    preparations.set(token, { senderId: window.webContents.id, finish })
    window.webContents.send('desktop:prepare', token)
  })
}
function makeWindow(surface: DesktopState['surface']) {
  const window = new BrowserWindow({
    ...(surface === 'control' ? controlBounds() : screen.getPrimaryDisplay().workArea),
    title: surface === 'editor' ? 'Dayweave' : 'Dayweave · 桌面日历',
    show: false, frame: false, transparent: true,
    backgroundColor: '#00000000', hasShadow: false,
    resizable: false, maximizable: false, fullscreenable: false,
    focusable: surface !== 'wallpaper', skipTaskbar: surface !== 'editor',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false,
    },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.webContents.on('did-fail-load', (_, code, description) => console.error('Dayweave load:', code, description))
  window.webContents.on('render-process-gone', (_, details) => {
    console.error('Dayweave renderer:', surface, details.reason)
    if ((surface === 'wallpaper' && wallpaper === window) || (surface === 'control' && desktopControl === window)) lostDesktop(new Error('Desktop renderer stopped.'))
  })
  return window
}
async function loadWindow(window: BrowserWindow, surface: DesktopState['surface']) {
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    url.searchParams.set('surface', surface)
    await window.loadURL(url.toString())
  } else await window.loadFile(join(__dirname, '../renderer/index.html'), { query: { surface } })
}

async function setDesktopVisible(visible: boolean) {
  if (!host || !wallpaper || wallpaper.isDestroyed() || !desktopControl || desktopControl.isDestroyed()) {
    if (visible) throw new Error('Desktop windows are unavailable.')
    return
  }
  // Native ShowWindow alone does not update Electron's compositor visibility.
  // Keep both layers in sync so a visible HWND also has rendered content.
  if (visible) {
    desktopControl.setBounds(controlBounds())
    wallpaper.showInactive()
    desktopControl.showInactive()
  } else {
    wallpaper.hide()
    desktopControl.hide()
  }
  // Reapply the desktop position after Electron's window visibility change.
  await host.setVisible(visible)
}

async function editCalendar() {
  if (!editor || editor.isDestroyed() || quitting) return
  mode = 'editing'
  const version = ++visibilityVersion
  publishState()
  if (editor.isMinimized()) editor.restore()
  editor.setBounds(screen.getPrimaryDisplay().workArea)
  await prepareWindow(editor)
  if (version !== visibilityVersion || quitting || !editor || editor.isDestroyed()) return
  if (editor.isMinimized()) editor.restore()
  editor.show()
  editor.focus()
  // Reveal the prepared editor before removing the identical desktop calendar.
  try { await setDesktopVisible(false) } catch (error) { console.warn('Hide desktop:', error) }
}
async function showDesktop() {
  if (editorBusy) { await editCalendar(); return state() }
  mode = 'desktop'
  const version = ++visibilityVersion
  publishState()
  if (wallpaperStatus !== 'attached') await connectDesktop()
  if (version !== visibilityVersion || quitting) return state()
  if (wallpaperStatus === 'attached' && host) {
    try {
      if (!await prepareWindow(wallpaper)) throw new Error('Desktop calendar is not ready.')
      if (version !== visibilityVersion || quitting) return state()
      // Keep the editor out of the shell's asynchronous MinimizeAll operation.
      // Otherwise a delayed minimize can undo the next request to edit.
      editor?.hide()
      await host.showDesktopView()
      if (version !== visibilityVersion || quitting) return state()
      await setDesktopVisible(true)
      if (version !== visibilityVersion || quitting) return state()
      editor?.hide()
      publishState()
      return state()
    } catch (error) {
      if (editor && !editor.isDestroyed()) {
        if (editor.isMinimized()) editor.restore()
        editor.show()
        editor.focus()
      }
      lostDesktop(error)
    }
  }
  await editCalendar()
  return state()
}
async function hideCalendar() {
  mode = 'hidden'
  ++visibilityVersion
  editor?.hide()
  publishState()
  try { await setDesktopVisible(false) } catch (error) { console.warn('Hide desktop:', error) }
}
function refreshTray() {
  if (!tray || tray.isDestroyed()) return
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '编辑日程', click: () => { void editCalendar() } },
    { label: mode === 'editing' ? '固定桌面' : '显示桌面日历', enabled: wallpaperStatus !== 'starting' && !editorBusy, click: () => { void showDesktop() } },
    { label: '重新连接桌面', enabled: wallpaperStatus !== 'starting', click: () => { void retryDesktop() } },
    { label: '隐藏日历', click: () => { void hideCalendar() } },
    { type: 'separator' },
    { label: '退出 Dayweave', click: () => app.quit() },
  ]))
}
function createTray() {
  const size = 32, pixels = Buffer.alloc(size * size * 4)
  for (let y = 3; y < 29; y++) for (let x = 3; x < 29; x++) {
    const white = y === 10 || (y >= 15 && y <= 23 && ((x >= 9 && x <= 12) || (x >= 19 && x <= 22)))
    const i = (y * size + x) * 4
    pixels[i] = white ? 255 : 223
    pixels[i + 1] = white ? 255 : 123
    pixels[i + 2] = white ? 255 : 47
    pixels[i + 3] = 255
  }
  try {
    tray = new Tray(nativeImage.createFromBitmap(pixels, { width: size, height: size }))
    tray.setToolTip('Dayweave · 点击编辑日程')
    tray.on('click', () => { void editCalendar() })
    refreshTray()
  } catch (error) { console.error('Tray unavailable:', error) }
}

async function disposeWallpaper() {
  const oldHost = host, oldWindow = wallpaper, oldControl = desktopControl
  host = null
  wallpaper = null
  desktopControl = null
  await oldHost?.stop()
  if (oldWindow && !oldWindow.isDestroyed()) oldWindow.destroy()
  if (oldControl && !oldControl.isDestroyed()) oldControl.destroy()
}
function connectDesktop(): Promise<void> {
  if (connecting) return connecting
  if (quitting) return Promise.resolve()
  connecting = (async () => {
    wallpaperStatus = 'starting'
    wallpaperError = ''
    publishState()
    try {
      await disposeWallpaper()
      if (quitting) return
      if (process.platform !== 'win32') throw new Error('Windows is required.')
      if (!tray && !shortcutAvailable) throw new Error('No tray or shortcut is available to return to editing.')
      const window = makeWindow('wallpaper')
      wallpaper = window
      const control = makeWindow('control')
      desktopControl = control
      window.setIgnoreMouseEvents(true)
      window.on('closed', () => {
        if (wallpaper === window && !quitting) lostDesktop(new Error('Desktop window was closed.'))
      })
      control.on('closed', () => {
        if (desktopControl === control && !quitting) lostDesktop(new Error('Desktop control was closed.'))
      })
      await Promise.all([loadWindow(window, 'wallpaper'), loadWindow(control, 'control')])
      if (quitting || window.isDestroyed()) return
      const bridge = new DesktopHost(error => { if (host === bridge) lostDesktop(error) })
      host = bridge
      await bridge.start(window.getNativeWindowHandle())
      const strategy = await bridge.attach(desktopBounds())
      await bridge.attachControl(control.getNativeWindowHandle(), physicalControlBounds())
      if (!await prepareWindow(window)) throw new Error('Desktop calendar is not ready.')
      if (quitting) return
      await setDesktopVisible(mode === 'desktop')
      wallpaperStatus = 'attached'
      wallpaperError = ''
      console.info('Dayweave desktop attached:', strategy)
      publishState()
    } catch (error) {
      console.error('Desktop attachment failed:', error)
      await disposeWallpaper()
      if (!quitting) {
        wallpaperStatus = 'unavailable'
        wallpaperError = '暂时无法贴到桌面。日程仍可编辑，请点击“重试贴到桌面”。'
        publishState()
        if (recoveryAttempts === 0 || recoveryAttempts >= 3) await editCalendar()
        else scheduleRecovery()
      }
    }
  })().finally(() => { connecting = null })
  return connecting
}
function scheduleRecovery() {
  if (quitting || retryTimer || recoveryAttempts >= 3) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    recoveryAttempts++
    void connectDesktop()
  }, 2500)
}
function lostDesktop(error: unknown) {
  if (quitting || wallpaperStatus === 'starting' || wallpaperStatus === 'unavailable') return
  console.warn('Desktop connection lost:', error)
  wallpaperStatus = 'unavailable'
  wallpaperError = recoveryAttempts >= 3
    ? '暂时无法重新贴到桌面。日程仍可编辑，请点击“重试贴到桌面”。'
    : '桌面连接已中断，正在重新连接。'
  publishState()
  if (recoveryAttempts >= 3) void editCalendar()
  else scheduleRecovery()
}
async function retryDesktop() {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
  recoveryAttempts = 0
  await connectDesktop()
  if (wallpaperStatus === 'attached') return showDesktop()
  return state()
}

function isEditor(senderId: number) { return editor?.webContents.id === senderId }
function isControl(senderId: number) { return desktopControl?.webContents.id === senderId }
ipcMain.handle('desktop:edit', event => {
  if (isEditor(event.sender.id) || isControl(event.sender.id)) return editCalendar()
})
ipcMain.on('desktop:editor-busy', (event, busy: unknown) => {
  if (isEditor(event.sender.id)) { editorBusy = busy === true; refreshTray() }
})
for (const channel of ['desktop:prepared', 'desktop:prepare-failed']) {
  ipcMain.on(channel, (event, token: unknown) => {
    if (typeof token !== 'number') return
    const pending = preparations.get(token)
    if (pending?.senderId === event.sender.id) pending.finish(channel === 'desktop:prepared')
  })
}
ipcMain.on('window:minimize', event => { if (isEditor(event.sender.id) && mode !== 'desktop') void showDesktop() })
ipcMain.on('window:close', event => { if (isEditor(event.sender.id)) app.quit() })
ipcMain.handle('desktop:get-state', event => state(isEditor(event.sender.id) ? 'editor' : isControl(event.sender.id) ? 'control' : 'wallpaper'))
ipcMain.handle('desktop:pin', event => isEditor(event.sender.id) ? showDesktop() : state('wallpaper'))
ipcMain.handle('desktop:retry', event => isEditor(event.sender.id) ? retryDesktop() : state('wallpaper'))

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { void editCalendar() })
  app.whenReady().then(async () => {
    createTray()
    shortcutAvailable = globalShortcut.register('CommandOrControl+Alt+D', () => { void editCalendar() })
    editor = makeWindow('editor')
    editor.on('closed', () => { editor = null; if (!quitting) app.quit() })
    editor.on('minimize', () => { if (mode !== 'desktop') void showDesktop() })
    await loadWindow(editor, 'editor')
    await connectDesktop()
    if (quitting) return
    watchdog = setInterval(async () => {
      if (checking || connecting || quitting || wallpaperStatus !== 'attached' || !host) return
      checking = true
      try {
        if (!await host.isAttached()) lostDesktop(new Error('Desktop host changed.'))
        else recoveryAttempts = 0
      } catch (error) { lostDesktop(error) }
      finally { checking = false }
    }, 5000)
    const resize = async () => {
      if (quitting) return
      if (editor && !editor.isDestroyed()) editor.setBounds(screen.getPrimaryDisplay().workArea)
      if (desktopControl && !desktopControl.isDestroyed()) desktopControl.setBounds(controlBounds())
      if (wallpaperStatus === 'attached' && host) {
        try { await host.resize(desktopBounds()); await host.resizeControl(physicalControlBounds()) } catch (error) { lostDesktop(error) }
      }
    }
    screen.on('display-metrics-changed', () => { void resize() })
    screen.on('display-added', () => { void resize() })
    screen.on('display-removed', () => { void resize() })
    app.on('activate', () => { void editCalendar() })
  }).catch(error => { console.error(error); app.quit() })
}
app.on('before-quit', event => {
  if (quitting) return
  quitting = true
  if (watchdog) clearInterval(watchdog)
  if (retryTimer) clearTimeout(retryTimer)
  globalShortcut.unregisterAll()
  for (const pending of preparations.values()) pending.finish(false)
  if (host || wallpaper || desktopControl) {
    event.preventDefault()
    void disposeWallpaper().finally(() => app.quit())
  }
})
app.on('window-all-closed', () => { if (!quitting) app.quit() })
app.on('will-quit', () => { tray?.destroy() })
