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
const fixture = globalThis.__macFocusFixture = {
  BrowserWindow: FakeWindow, dialog: {},
  ipcMain: { handle() {}, on: handlers.on.bind(handlers) },
  screen: { getPrimaryDisplay: () => display, getDisplayMatching: () => display },
  FakeConnection, pointer: { point: { x: 800, y: 400 }, down: false },
}
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/src/main/focus-window.ts')) {
      if (specifier === 'electron') return { url: 'fixture:electron', shortCircuit: true }
      if (['./calendar-subscription', './google-calendar', './microsoft-todo', './calendar-links', './taskbar-visibility', './pointer-state'].includes(specifier)) return { url: 'fixture:connections', shortCircuit: true }
    }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url.endsWith('/src/main/focus-window.ts')) return { format: 'module', shortCircuit: true, source: 'const __dirname = "/fixture";\n' + ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText }
    if (url === 'fixture:electron') return { format: 'module', shortCircuit: true, source: 'export const { BrowserWindow, dialog, ipcMain, screen } = globalThis.__macFocusFixture' }
    if (url === 'fixture:connections') return { format: 'module', shortCircuit: true, source: 'const C = globalThis.__macFocusFixture.FakeConnection; export { C as CalendarSubscription, C as GoogleCalendarConnection, C as MicrosoftTodoConnection, C as CalendarLinks }; export const validCalendarRange = () => true; export const createTaskbarProbe = () => null; export const createPointerReader = () => () => globalThis.__macFocusFixture.pointer' }
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
    assert.equal(win.visible, true, 'blur alone must not close the calendar and details together')
    focus.toggleFromMenuBar()
    assert.equal(win.visible, false, 'a status-item click still toggles the panel after blur')
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
test('Mac floating strips move freely, persist their position and return from menu-bar mode without snapping', async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  const directory = mkdtempSync(join(tmpdir(), 'dayweave-mac-controller-'))
  Object.defineProperty(process, 'platform', { value: 'darwin' })
  let focus
  const saved = () => JSON.parse(readFileSync(join(directory, 'focus-window.json'), 'utf8'))
  const create = async () => { handlers.removeAllListeners(); focus = new FocusWindow(directory, 'preload'); await focus.create(); return FakeWindow.latest }
  try {
    writeFileSync(join(directory, 'focus-window.json'), JSON.stringify({ x: 300, y: 200, docked: true, menuBar: false, alwaysOnTop: false }))
    let win=await create()
    assert.equal(win.visible,true)
    assert.equal(focus.isMenuBarMode(),false)
    assert.equal(win.topmost,false)
    let prevented=false
    win.emit('will-move',{preventDefault(){prevented=true}})
    assert.equal(prevented,false)
    win.setContentBounds({...win.bounds,x:500,y:350})
    await new Promise(resolve=>setTimeout(resolve,350))
    assert.equal(saved().x,500);assert.equal(saved().y,350);assert.equal(saved().docked,false)
    win.emit('blur');assert.equal(win.visible,true,'floating strips stay visible when another app gains focus')
    focus.useMenuBar();assert.equal(win.visible,false);assert.equal(saved().menuBar,true)
    focus.openCalendar()
    handlers.emit('focus:resize',{sender:{id:1}},650,true,true)
    focus.useFloatingStrip()
    assert.equal(win.visible,true)
    assert.deepEqual(win.bounds,{x:500,y:350,width:300,height:44})
    assert.equal(saved().menuBar,false)
    focus.stop();win=await create()
    assert.equal(focus.isMenuBarMode(),false)
    assert.deepEqual(win.bounds,{x:500,y:350,width:300,height:44})
    focus.dockToBottom();assert.equal(saved().docked,false)
  } finally {
    focus?.stop()
    Object.defineProperty(process, 'platform', originalPlatform)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('Mac drags directly from the status item to the desktop and back; outside clicks remain separate steps', async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  const directory = mkdtempSync(join(tmpdir(), 'dayweave-mac-drag-'))
  Object.defineProperty(process, 'platform', { value: 'darwin' })
  let focus
  const sample = (x, y, down) => { fixture.pointer = { point: { x, y }, down }; focus.pollPointer() }
  try {
    handlers.removeAllListeners()
    fixture.pointer = { point: { x: 1250, y: 12 }, down: false }
    focus = new FocusWindow(directory, 'preload'); await focus.create()
    focus.setMenuBarAnchor(() => ({ x: 1200, y: 0, width: 120, height: 25 }))
    const win = FakeWindow.latest
    focus.beginStripDrag('tray', { x: 1250, y: 12 })
    sample(1251, 13, true)
    assert.equal(win.visible, false, 'a click or small jitter must not detach')
    sample(1000, 300, true); sample(900, 400, false)
    assert.equal(win.visible, true)
    assert.equal(focus.isMenuBarMode(), false)
    assert.deepEqual(win.bounds, { x: 750, y: 384, width: 300, height: 44 })
    focus.toggleFromMenuBar()
    assert.equal(win.visible, true, 'a click emitted after dragging must not hide the strip')
    handlers.emit('focus:resize', { sender: { id: 1 } }, 600, true, true)
    win.messages.length = 0
    sample(10, 890, true); sample(10, 890, false); sample(10, 890, true)
    assert.equal(win.messages.filter(([channel]) => channel === 'focus:outside-click').length, 2, 'both outside clicks reach the renderer, including after blur')
    sample(10, 890, false)
    const origin = { x: win.bounds.x + 30, y: win.bounds.y + 16 }
    sample(origin.x, origin.y, true)
    assert.equal(win.messages.filter(([channel]) => channel === 'focus:outside-click').length, 2, 'inside controls do not collapse')
    focus.beginStripDrag('strip', origin)
    sample(1250, 10, true); sample(1250, 10, false)
    assert.equal(focus.isMenuBarMode(), true)
    assert.equal(win.visible, false)
    assert.equal(JSON.parse(readFileSync(join(directory, 'focus-window.json'), 'utf8')).menuBar, true)
  } finally {
    focus?.stop()
    Object.defineProperty(process, 'platform', originalPlatform)
    rmSync(directory, { recursive: true, force: true })
  }
})
