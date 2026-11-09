import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { registerHooks } from 'node:module'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// Exercise the real controller with macOS event ordering on any test host.
const area = { x: 0, y: 25, width: 1440, height: 805 }
const display = { bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: area }
class FakeWindow extends EventEmitter {
  static latest
  constructor(options) {
    super(); FakeWindow.latest = this
    this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height }
    this.topmost = options.alwaysOnTop
    this.visible = false
    this.messages = []
    this.webContents = Object.assign(new EventEmitter(), { id: 1, send: (...message) => this.messages.push(message), setWindowOpenHandler() {} })
  }
  isDestroyed() { return false }
  getContentBounds() { return { ...this.bounds } }
  setContentBounds(bounds) { this.bounds = { ...bounds }; this.emit('move'); this.emit('moved') }
  setAlwaysOnTop(value) { this.topmost = value }
  setVisibleOnAllWorkspaces() {}
  async loadFile() {}
  showInactive() { this.visible = true }
  show() { this.visible = true }
  hide() { this.visible = false }
  isVisible() { return this.visible }
  destroy() {}
}
class FakeConnection {
  async load() {}
  stop() {}
}
const handlers = new EventEmitter()
globalThis.__macFocusFixture = {
  BrowserWindow: FakeWindow, dialog: {},
  ipcMain: { handle() {}, on: handlers.on.bind(handlers) },
  screen: { getPrimaryDisplay: () => display, getDisplayMatching: () => display },
  FakeConnection,
}
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/src/main/focus-window.ts')) {
      if (specifier === 'electron') return { url: 'fixture:electron', shortCircuit: true }
      if (['./calendar-subscription', './google-calendar', './microsoft-todo', './calendar-links', './taskbar-visibility'].includes(specifier)) return { url: 'fixture:connections', shortCircuit: true }
    }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url.endsWith('/src/main/focus-window.ts')) return { format: 'module', shortCircuit: true, source: 'const __dirname = "/fixture";\n' + ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText }
    if (url === 'fixture:electron') return { format: 'module', shortCircuit: true, source: 'export const { BrowserWindow, dialog, ipcMain, screen } = globalThis.__macFocusFixture' }
    if (url === 'fixture:connections') return { format: 'module', shortCircuit: true, source: 'const C = globalThis.__macFocusFixture.FakeConnection; export { C as CalendarSubscription, C as GoogleCalendarConnection, C as MicrosoftTodoConnection, C as CalendarLinks }; export const validCalendarRange = () => true; export const createTaskbarProbe = () => null' }
    return next(url, context)
  },
})

const { FocusWindow } = await import('../src/main/focus-window.ts')
hooks.deregister()

test('Mac menu-bar mode hides the desktop strip, restores after restart and anchors a transient panel beneath the status item', async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  const directory = mkdtempSync(join(tmpdir(), 'dayweave-menu-controller-'))
  Object.defineProperty(process, 'platform', { value: 'darwin' })
  let focus
  const saved = () => JSON.parse(readFileSync(join(directory, 'focus-window.json'), 'utf8'))
  const tray = { x: 1250, y: 0, width: 70, height: 25 }
  const create = async () => { handlers.removeAllListeners(); focus = new FocusWindow(directory, 'preload'); await focus.create(); focus.setMenuBarAnchor(() => tray); return FakeWindow.latest }
  try {
    let win = await create()
    const desktopAnchor = { x: win.bounds.x, y: win.bounds.y }
    focus.useMenuBar()
    assert.equal(win.visible, false)
    assert.equal(saved().menuBar, true)
    focus.show()
    assert.equal(win.visible, true)
    assert.ok(win.messages.some(([channel]) => channel === 'focus:open-details'))
    assert.equal(win.bounds.y, tray.y + tray.height + 6)
    assert.equal(win.bounds.x + win.bounds.width, tray.x + tray.width)
    handlers.emit('focus:resize', { sender: { id: 1 } }, 620, true, true)
    assert.ok(win.bounds.x >= area.x && win.bounds.y >= area.y)
    assert.ok(win.bounds.x + win.bounds.width <= area.x + area.width)
    assert.ok(win.bounds.y + win.bounds.height <= area.y + area.height)
    win.emit('blur')
    assert.equal(win.visible, false)
    focus.toggleFromMenuBar()
    assert.equal(win.visible, false, 'a blur immediately before the status-item click must not reopen the panel')
    const statuses = []
    focus.onMenuStatus(status => statuses.push(status))
    handlers.emit('focus:menu-status', { sender: { id: 99 } }, { title: 'foreign', timer: '12:34' })
    handlers.emit('focus:menu-status', { sender: { id: 1 } }, { title: 'bad', timer: 'unbounded text' })
    assert.equal(statuses.length, 1)
    handlers.emit('focus:menu-status', { sender: { id: 1 } }, { title: '当前安排', timer: '12:34' })
    assert.deepEqual(statuses.at(-1), { title: '当前安排', timer: '12:34' })
    focus.stop()
    assert.deepEqual({ x: saved().x, y: saved().y }, desktopAnchor, 'transient panel bounds must not replace the desktop position')
    win = await create()
    assert.equal(focus.isMenuBarMode(), true)
    assert.equal(win.visible, false, 'a menu-bar profile starts without a second desktop strip')
    focus.dockToBottom()
    assert.equal(win.visible, true)
    assert.equal(saved().menuBar, false)
    assert.equal(win.bounds.x, area.x + 8)
    assert.equal(win.bounds.y + win.bounds.height, area.y + area.height)
  } finally {
    focus?.stop()
    Object.defineProperty(process, 'platform', originalPlatform)
    rmSync(directory, { recursive: true, force: true })
  }
})
test('Mac controller docks, detaches without snapping on every moved event, and restores position/topmost preference', async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  const directory = mkdtempSync(join(tmpdir(), 'dayweave-mac-controller-'))
  Object.defineProperty(process, 'platform', { value: 'darwin' })
  let focus
  const saved = () => JSON.parse(readFileSync(join(directory, 'focus-window.json'), 'utf8'))
  const create = async () => { handlers.removeAllListeners(); focus = new FocusWindow(directory, 'preload'); await focus.create(); return FakeWindow.latest }
  try {
    let win = await create()
    assert.equal(win.bounds.y + win.bounds.height, area.y + area.height)
    focus.setAlwaysOnTop(false)
    assert.equal(win.topmost, false)
    assert.equal(saved().alwaysOnTop, false)
    const move = (x, y) => { win.emit('will-move'); win.setContentBounds({ ...win.bounds, x, y }) }
    move(400, 760)
    assert.equal(win.bounds.x, 400, 'moved must not snap while dragging near the bottom')
    move(500, 200)
    await new Promise(resolve => setTimeout(resolve, 350))
    assert.equal(saved().docked, false)
    assert.equal(saved().x, 500)
    assert.equal(saved().y, 200)
    focus.stop()
    win = await create()
    assert.deepEqual(win.bounds, { x: 500, y: 200, width: 300, height: 44 })
    assert.equal(win.topmost, false)
    focus.dockToBottom()
    assert.equal(saved().docked, true)
    assert.equal(win.bounds.x, area.x + 8)
    handlers.emit('focus:resize', { sender: { id: 1 } }, 650, true, true)
    assert.equal(win.bounds.y + win.bounds.height, area.y + area.height)
    assert.ok(win.bounds.y >= area.y)
    assert.equal(win.topmost, false, 'opening the calendar must preserve non-topmost mode')
    focus.stop()
    // Position-only profiles from older versions remain readable.
    writeFileSync(join(directory, 'focus-window.json'), JSON.stringify({ x: 600, y: 250, docked: false }))
    win = await create()
    assert.equal(win.bounds.x, 600)
    assert.equal(win.bounds.y, 250)
    assert.equal(win.topmost, true)
    move(450, area.y + area.height - 44)
    await new Promise(resolve => setTimeout(resolve, 350))
    assert.equal(saved().docked, true)
    assert.equal(win.bounds.x, area.x + 8)
    focus.stop()
    win = await create()
    assert.equal(win.bounds.x, area.x + 8)
    assert.equal(win.bounds.y + win.bounds.height, area.y + area.height)
  } finally {
    focus?.stop()
    Object.defineProperty(process, 'platform', originalPlatform)
    delete globalThis.__macFocusFixture
    rmSync(directory, { recursive: true, force: true })
  }
})
