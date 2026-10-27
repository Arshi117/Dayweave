import { app, globalShortcut, Menu, nativeImage, screen, Tray } from 'electron'
import { join } from 'node:path'
import { FocusWindow } from './focus-window'

let focus: FocusWindow | null = null
let tray: Tray | null = null
let quitting = false

function createTray() {
  const size = 32, pixels = Buffer.alloc(size * size * 4)
  for (let y = 5; y < 27; y++) for (let x = 3; x < 29; x++) {
    const offset = (y * size + x) * 4
    const progress = y < 8 && x < 20
    pixels[offset] = progress ? 174 : 47
    pixels[offset + 1] = progress ? 205 : 50
    pixels[offset + 2] = progress ? 181 : 56
    pixels[offset + 3] = 255
  }
  tray = new Tray(nativeImage.createFromBitmap(pixels, { width: size, height: size }))
  tray.setToolTip('Dayweave · 当前安排')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示／隐藏悬浮条', click: () => focus?.toggle() },
    { label: '展开日历', click: () => focus?.openCalendar() },
    { label: '连接与导入', click: () => focus?.openSettings() },
    { type: 'separator' },
    { label: '退出 Dayweave', click: () => app.quit() },
  ]))
  tray.on('click', () => focus?.toggle())
  tray.on('double-click', () => focus?.openCalendar())
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => focus?.show())
  app.whenReady().then(async () => {
    if (process.platform === 'win32') app.setAppUserModelId('Dayweave.Desktop')
    focus = new FocusWindow(app.getPath('userData'), join(__dirname, '../preload/index.js'))
    createTray()
    await focus.create()
    globalShortcut.register('CommandOrControl+Alt+F', () => focus?.toggle())
    globalShortcut.register('CommandOrControl+Alt+D', () => focus?.openCalendar())
    const fit = () => focus?.keepVisible()
    screen.on('display-metrics-changed', fit)
    screen.on('display-added', fit)
    screen.on('display-removed', fit)
    app.on('activate', () => focus?.show())
  }).catch(error => { console.error('Dayweave startup failed:', error); app.quit() })
}
app.on('before-quit', () => {
  if (quitting) return
  quitting = true
  globalShortcut.unregisterAll()
  focus?.stop()
})
app.on('window-all-closed', () => { if (!quitting) app.quit() })
app.on('will-quit', () => tray?.destroy())
