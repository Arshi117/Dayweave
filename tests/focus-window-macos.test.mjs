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
    assert.equal(win.visible, false)
    assert.equal(focus.isMenuBarMode(), true)
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
    assert.equal(saved().menuBar, true)
    assert.equal(saved().docked, false)
    win = await create()
    assert.equal(focus.isMenuBarMode(), true)
    assert.equal(win.visible, false, 'a menu-bar profile starts without a second desktop strip')
    focus.dockToBottom()
    assert.equal(win.visible, false, 'Windows docking command must do nothing on Mac')
    assert.equal(focus.isMenuBarMode(), true)
  } finally {
    focus?.stop()
    Object.defineProperty(process, 'platform', originalPlatform)
    rmSync(directory, { recursive: true, force: true })
  }
})
test('legacy Mac floating and docked profiles migrate to menu-bar-only mode and cannot detach', async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  const directory = mkdtempSync(join(tmpdir(), 'dayweave-mac-controller-'))
  Object.defineProperty(process, 'platform', { value: 'darwin' })
  let focus
  const saved = () => JSON.parse(readFileSync(join(directory, 'focus-window.json'), 'utf8'))
  const create = async () => { handlers.removeAllListeners(); focus = new FocusWindow(directory, 'preload'); await focus.create(); return FakeWindow.latest }
  try {
    for (const docked of [true, false]) {
      writeFileSync(join(directory, 'focus-window.json'), JSON.stringify({ x: 8, y: 786, docked, menuBar: false, alwaysOnTop: false }))
      const win = await create()
      assert.equal(win.visible, false)
      assert.equal(focus.isMenuBarMode(), true)
      assert.equal(win.topmost, false)
      let prevented = false
      win.emit('will-move', { preventDefault() { prevented = true } })
      assert.equal(prevented, true)
      focus.openCalendar()
      handlers.emit('focus:resize', { sender: { id: 1 } }, 650, true, true)
      assert.ok(win.bounds.y >= area.y)
      assert.ok(win.bounds.y + win.bounds.height <= area.y + area.height)
      assert.equal(win.topmost, false)
      focus.stop()
      assert.equal(saved().menuBar, true)
      assert.equal(saved().docked, false)
    }
  } finally {
    focus?.stop()
    Object.defineProperty(process, 'platform', originalPlatform)
    delete globalThis.__macFocusFixture
    rmSync(directory, { recursive: true, force: true })
  }
})
