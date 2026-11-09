import { app, globalShortcut, Menu, nativeImage, screen, Tray, type MenuItemConstructorOptions } from 'electron'
import { isAbsolute, join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { FocusWindow } from './focus-window'

let focus: FocusWindow | null = null
let tray: Tray | null = null
let quitting = false

// Preserve the existing profile across development and installed releases.
const development = process.env.DAYWEAVE_DEV === '1'
if (development) app.setName('Dayweave Dev')
const profile = app.commandLine.getSwitchValue('user-data-dir')
const profileDirectory = profile && isAbsolute(profile) ? profile : join(app.getPath('appData'), development ? 'dayweave-dev' : 'dayweave-desktop')
mkdirSync(profileDirectory, { recursive: true })
app.setPath('userData', profileDirectory)

function trayMenu() {
  const items: MenuItemConstructorOptions[] = []
  if (process.platform === 'darwin') items.push(
    { label: '左下角停靠', type: 'radio', checked: !focus?.isMenuBarMode(), click: () => focus?.dockToBottom() },
    { label: '顶部菜单栏', type: 'radio', checked: focus?.isMenuBarMode() ?? false, click: () => focus?.useMenuBar() },
    { type: 'separator' },
  )
  items.push({ label: '显示／隐藏悬浮条', click: () => focus?.toggle() })
  if (process.platform === 'win32') items.push({ label: '停靠到底部', click: () => focus?.dockToBottom() })
  if (process.platform === 'darwin') items.push({ label: '始终置顶', type: 'checkbox', checked: focus?.isAlwaysOnTop() ?? true, click: item => focus?.setAlwaysOnTop(item.checked) })
  items.push(
    { label: '展开日历', click: () => focus?.openCalendar() },
    { label: '连接与导入', click: () => focus?.openSettings() },
    { type: 'separator' },
    { label: '退出 Dayweave', click: () => app.quit() },
  )
  return Menu.buildFromTemplate(items)
}

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
  let image = nativeImage.createFromBitmap(pixels, { width: size, height: size })
  if (process.platform === 'darwin') {
    const side = 36, template = Buffer.alloc(side * side * 4)
    const lines = [[7, 8, 7, 28], [7, 28, 15, 19], [15, 19, 22, 28], [22, 28, 29, 8], [7, 14, 29, 14]]
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
      if (lines.some(([ax, ay, bx, by]) => {
        const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)))
        return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)) < 1.8
      })) template[(y * side + x) * 4 + 3] = 255
    }
    image = nativeImage.createFromBitmap(template, { width: side, height: side, scaleFactor: 2 })
    image.setTemplateImage(true)
  }
  tray = new Tray(image)
  tray.setToolTip((development ? 'Dayweave 开发版' : 'Dayweave') + ' · 当前安排')
  if (process.platform === 'darwin') {
    tray.setIgnoreDoubleClickEvents(true)
    focus?.setMenuBarAnchor(() => tray?.getBounds())
    focus?.onMenuStatus(status => {
      tray?.setTitle(focus?.isMenuBarMode() ? status.timer : '', { fontType: 'monospacedDigit' })
      tray?.setToolTip('Dayweave · ' + status.title + (status.timer ? ' · ' + status.timer : '') + (focus?.isMenuBarMode() ? '\n右键切换停靠位置' : ''))
    })
    tray.on('click', () => { if (focus?.isMenuBarMode()) focus.toggleFromMenuBar(); else tray?.popUpContextMenu(trayMenu()) })
    tray.on('right-click', () => tray?.popUpContextMenu(trayMenu()))
  } else {
    tray.setContextMenu(trayMenu())
    tray.on('click', () => focus?.toggle())
    tray.on('double-click', () => focus?.openCalendar())
  }
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => focus?.show())
  app.whenReady().then(async () => {
    if (process.platform === 'win32') app.setAppUserModelId(development ? 'Dayweave.Development' : 'Dayweave.Desktop')
    if (process.platform === 'darwin') {
      Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]))
      app.dock?.hide()
    }
    focus = new FocusWindow(app.getPath('userData'), join(__dirname, '../preload/index.js'))
    await focus.create()
    createTray()
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
