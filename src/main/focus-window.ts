import { BrowserWindow, dialog, ipcMain, screen } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { CalendarSubscription, validCalendarRange } from './calendar-subscription'
import { GoogleCalendarConnection } from './google-calendar'
import { MicrosoftTodoConnection } from './microsoft-todo'
import { CalendarLinks } from './calendar-links'
import { createTaskbarProbe } from './taskbar-visibility'
import { createPointerReader, type PointerSample } from './pointer-state'
import { shouldRecoverDock } from '../shared/dock-visibility'
import { readFocusMenuStatus, type FocusMenuStatus } from '../shared/focus-menu'
import { FOCUS_WIDTH, FOCUS_COMPACT_HEIGHT, FOCUS_GAP, FOCUS_PADDING, DEFAULT_FOCUS_DIMENSIONS, focusDimensions, focusWindowLayout, bottomDockLayout, menuBarWindowLayout, isBottomDockCandidate, type FocusAnchor, type FocusDimensions, type ResizeTarget, type ResizeEdge } from '../shared/focus-window-layout'

interface DimensionGesture { target: ResizeTarget; edge: ResizeEdge; x: number; y: number; dimensions: FocusDimensions; anchor: FocusAnchor; left: boolean; above: boolean }
const resizeEdges: ResizeEdge[] = ['left', 'right', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right']

export class FocusWindow {
  private window: BrowserWindow | null = null
  private feed: CalendarSubscription
  private google: GoogleCalendarConnection
  private ticktick: CalendarSubscription
  private microsoft: MicrosoftTodoConnection
  private links: CalendarLinks
  private positionTimer: NodeJS.Timeout | null = null
  private anchor: FocusAnchor = { x: 0, y: 0 }
  private contentHeight = FOCUS_COMPACT_HEIGHT
  private dimensions: FocusDimensions = { ...DEFAULT_FOCUS_DIMENSIONS }
  private expanded = false
  private calendarOpen = false
  private dimensionGesture: DimensionGesture | null = null
  private above = false
  private left = false
  private applyingBounds = false
  private appliedPosition: FocusAnchor | null = null
  private docked = process.platform === 'win32'
  private alwaysOnTop = true
  private menuBar = process.platform === 'darwin'
  private dragEndedAt = 0
  private stripDrag: { source: 'tray' | 'strip'; origin: FocusAnchor; anchor: FocusAnchor; active: boolean } | null = null
  private pointerTimer: NodeJS.Timeout | null = null
  private readPointer: (() => PointerSample) | null = null
  private pointerWasDown = false
  private menuBarBounds: (() => Electron.Rectangle | undefined) | null = null
  private menuStatus: FocusMenuStatus = { title: 'Dayweave', timer: '' }
  private statusListener: ((status: FocusMenuStatus) => void) | null = null
  private nativeMoving = false
  private dockVisibilityTimer: NodeJS.Timeout | null = null
  private readonly settingsFile: string
  constructor(private directory: string, private preload: string) {
    this.settingsFile = join(directory, 'focus-window.json')
    this.feed = new CalendarSubscription(directory, state => this.window?.webContents.send('focus:subscription', state))
    this.google = new GoogleCalendarConnection(directory, state => this.window?.webContents.send('focus:google-state', state))
    this.ticktick = new CalendarSubscription(directory, state => this.window?.webContents.send('focus:ticktick-state', state), 'ticktick')
    this.microsoft = new MicrosoftTodoConnection(directory, state => this.window?.webContents.send('focus:microsoft-state', state))
    this.links = new CalendarLinks(directory, state => this.window?.webContents.send('focus:links-state', state))
    const allowed = (id: number) => this.window?.webContents.id === id
    ipcMain.on('focus:strip-drag', event => { if (allowed(event.sender.id)) this.beginStripDrag('strip') })
    ipcMain.on('focus:menu-status', (event, value: unknown) => {
      if (process.platform !== 'darwin' || !allowed(event.sender.id)) return
      const status = readFocusMenuStatus(value)
      if (status) { this.menuStatus = status; this.statusListener?.(status) }
    })
    ipcMain.handle('focus:subscription-state', event => allowed(event.sender.id) ? this.feed.state() : null)
    ipcMain.handle('focus:subscription-save', (event, value: unknown) => {
      if (!allowed(event.sender.id) || typeof value !== 'string') return null
      return this.feed.refresh(value)
    })
    ipcMain.handle('focus:subscription-refresh', event => allowed(event.sender.id) ? this.feed.refresh() : null)
    ipcMain.handle('focus:subscription-remove', event => allowed(event.sender.id) ? this.feed.remove() : null)
    ipcMain.handle('focus:subscription-range', (event, range: unknown) => allowed(event.sender.id) && validCalendarRange(range) ? this.feed.setRange(range) : null)
    ipcMain.handle('focus:google-state', event => allowed(event.sender.id) ? this.google.state() : null)
    ipcMain.handle('focus:google-configure', async event => {
      if (!allowed(event.sender.id) || !this.window) return null
      if (this.google.state().connected || this.google.state().authorizing) return this.google.state()
      const result = await dialog.showOpenDialog(this.window, { title: '选择 Google 桌面应用配置', properties: ['openFile'], filters: [{ name: 'Google OAuth JSON', extensions: ['json'] }] })
      return result.canceled || !result.filePaths[0] ? this.google.state() : this.google.configure(result.filePaths[0])
    })
    ipcMain.handle('focus:google-connect', event => allowed(event.sender.id) ? this.google.connect() : null)
    ipcMain.handle('focus:google-cancel', event => allowed(event.sender.id) ? this.google.cancel() : null)
    ipcMain.handle('focus:google-refresh', event => allowed(event.sender.id) ? this.google.refresh() : null)
    ipcMain.handle('focus:google-disconnect', event => allowed(event.sender.id) ? this.google.disconnect() : null)
    ipcMain.handle('focus:google-select', (event, ids: unknown) => allowed(event.sender.id) && Array.isArray(ids) && ids.length <= 20 && ids.every(id => typeof id === 'string' && id.length <= 2000) ? this.google.select(ids) : null)
    ipcMain.handle('focus:google-range', (event, range: unknown) => allowed(event.sender.id) && validCalendarRange(range) ? this.google.setRange(range) : null)
    ipcMain.handle('focus:google-open-event', (event, id: unknown) => allowed(event.sender.id) && typeof id === 'string' && id.length <= 200 ? this.google.openEvent(id) : undefined)
    ipcMain.handle('focus:ticktick-state', event => allowed(event.sender.id) ? this.ticktick.state() : null)
    ipcMain.handle('focus:ticktick-save', (event, value: unknown) => allowed(event.sender.id) && typeof value === 'string' && value.length <= 8192 ? this.ticktick.refresh(value) : null)
    ipcMain.handle('focus:ticktick-refresh', event => allowed(event.sender.id) ? this.ticktick.refresh() : null)
    ipcMain.handle('focus:ticktick-remove', event => allowed(event.sender.id) ? this.ticktick.remove() : null)
    ipcMain.handle('focus:ticktick-range', (event, range: unknown) => allowed(event.sender.id) && validCalendarRange(range) ? this.ticktick.setRange(range) : null)
    ipcMain.handle('focus:microsoft-state', event => allowed(event.sender.id) ? this.microsoft.state() : null)
    ipcMain.handle('focus:microsoft-configure', (event, id: unknown) => allowed(event.sender.id) && typeof id === 'string' && id.length <= 100 ? this.microsoft.configure(id.trim()) : null)
    ipcMain.handle('focus:microsoft-connect', event => allowed(event.sender.id) ? this.microsoft.connect() : null)
    ipcMain.handle('focus:microsoft-cancel', event => allowed(event.sender.id) ? this.microsoft.cancel() : null)
    ipcMain.handle('focus:microsoft-refresh', event => allowed(event.sender.id) ? this.microsoft.refresh() : null)
    ipcMain.handle('focus:microsoft-disconnect', event => allowed(event.sender.id) ? this.microsoft.disconnect() : null)
    ipcMain.handle('focus:microsoft-select', (event, ids: unknown) => allowed(event.sender.id) && Array.isArray(ids) && ids.length <= 20 && ids.every(id => typeof id === 'string' && id.length <= 2000) ? this.microsoft.select(ids) : null)
    ipcMain.handle('focus:links-state', event => allowed(event.sender.id) ? this.links.state() : null)
    ipcMain.handle('focus:file-preview', (event, name: unknown, text: unknown, replaceId: unknown) => allowed(event.sender.id) ? this.links.previewFile(name, text, replaceId) : null)
    ipcMain.handle('focus:file-commit', (event, token: unknown) => allowed(event.sender.id) && typeof token === 'string' && token.length <= 100 ? this.links.commitFile(token) : null)
    ipcMain.handle('focus:file-cancel', event => { if (allowed(event.sender.id)) this.links.cancelFile() })
    ipcMain.handle('focus:calendar-source', (event, id: unknown) => {
      if (!allowed(event.sender.id) || typeof id !== 'string' || id.length > 100) return null
      return id === 'legacy' ? this.feed.readSource() : id === 'ticktick' ? this.ticktick.readSource() : this.links.readSource(id)
    })
    ipcMain.handle('focus:links-add', async (event, value: unknown) => {
      if (!allowed(event.sender.id) || typeof value !== 'string' || value.length > 8192) return null
      // Existing addresses stay in their old encrypted files and are refreshed in place.
      const old = this.feed.matches(value) ? this.feed : this.ticktick.matches(value) ? this.ticktick : null
      if (old) { const state = await old.refresh(); return { ...this.links.state(), addedId: old === this.feed ? 'legacy' : 'ticktick', error: state.error } }
      return this.links.add(value)
    })
    ipcMain.handle('focus:links-refresh', (event, id: unknown) => allowed(event.sender.id) && typeof id === 'string' && id.length <= 100 ? this.links.refresh(id) : null)
    ipcMain.handle('focus:links-remove', (event, id: unknown) => allowed(event.sender.id) && typeof id === 'string' && id.length <= 100 ? this.links.remove(id) : null)
    ipcMain.handle('focus:links-range', (event, range: unknown) => allowed(event.sender.id) && validCalendarRange(range) ? this.links.setRange(range) : null)
    ipcMain.on('focus:hide', event => { if (allowed(event.sender.id)) this.window?.hide() })
    ipcMain.handle('focus:calendar', event => { if (allowed(event.sender.id)) this.openCalendar() })
    ipcMain.on('focus:resize', (event, height: unknown, calendar: unknown, expanded: unknown) => {
      if (!allowed(event.sender.id) || !this.window) return
      if (typeof height !== 'number' || !Number.isFinite(height)) return
      this.contentHeight = Math.max(FOCUS_COMPACT_HEIGHT, Math.min(1000, Math.ceil(height)))
      this.calendarOpen = calendar === true
      this.expanded = expanded === true || this.calendarOpen
      this.keepVisible()
    })
    ipcMain.on('focus:dimension-start', (event, target: unknown, edge: unknown) => {
      if (!allowed(event.sender.id) || !this.validResize(target, edge)) return
      this.dimensionGesture = this.dimensionStart(target as ResizeTarget, edge as ResizeEdge)
    })
    ipcMain.on('focus:dimension-move', event => {
      if (!allowed(event.sender.id) || !this.dimensionGesture) return
      const point = screen.getCursorScreenPoint()
      this.applyDimensions(this.dimensionGesture, point.x - this.dimensionGesture.x, point.y - this.dimensionGesture.y)
    })
    ipcMain.on('focus:dimension-end', event => { if (allowed(event.sender.id)) this.finishDimensionResize() })
    ipcMain.on('focus:dimension-step', (event, target: unknown, edge: unknown, dx: unknown, dy: unknown) => {
      if (!allowed(event.sender.id) || !this.validResize(target, edge) || typeof dx !== 'number' || typeof dy !== 'number' || !Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 100 || Math.abs(dy) > 100) return
      this.applyDimensions(this.dimensionStart(target as ResizeTarget, edge as ResizeEdge), dx, dy)
      this.savePosition()
    })
  }
  async create() {
    const area = screen.getPrimaryDisplay().workArea
    let x = process.platform === 'win32' ? area.x + 8 : area.x + area.width - FOCUS_WIDTH - 24, y = area.y + 88
    try {
      const saved = JSON.parse(readFileSync(this.settingsFile, 'utf8'))
      if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) { x = saved.x; y = saved.y }
      this.docked = this.docked && saved.docked !== false
      this.alwaysOnTop = process.platform !== 'darwin' || saved.alwaysOnTop !== false
      this.menuBar = process.platform === 'darwin' && saved.menuBar !== false
      this.dimensions = focusDimensions(saved)
    } catch { /* Use the platform's default placement on first use. */ }
    this.anchor = { x, y }
    const window = new BrowserWindow({ x, y, width: this.dimensions.stripWidth, height: FOCUS_COMPACT_HEIGHT, title: (process.env.DAYWEAVE_DEV === '1' ? 'Dayweave 开发版' : 'Dayweave') + ' · 当前安排', show: false,
      frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, alwaysOnTop: this.alwaysOnTop,
      resizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, autoHideMenuBar: true,
      webPreferences: { preload: this.preload, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } })
    this.window = window
    if (process.platform === 'darwin') {
      window.setAlwaysOnTop(this.alwaysOnTop, 'floating')
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    }
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', event => event.preventDefault())
    window.on('page-title-updated', event => event.preventDefault())
    window.on('will-move', (event, proposedBounds) => {
      if (this.menuBar) { event.preventDefault(); return }
      this.nativeMoving = true
      if (process.platform === 'win32' && this.docked) {
        const anchor = { x: proposedBounds.x + (this.left ? proposedBounds.width - this.dimensions.stripWidth : 0), y: proposedBounds.y + (this.above ? proposedBounds.height - FOCUS_COMPACT_HEIGHT : 0) }
        const display = screen.getDisplayMatching({ ...anchor, width: this.dimensions.stripWidth, height: FOCUS_COMPACT_HEIGHT })
        if (isBottomDockCandidate(anchor, display.workArea)) {
          event.preventDefault()
          this.anchor = anchor
          this.keepVisible()
          if (this.positionTimer) clearTimeout(this.positionTimer)
          this.positionTimer = setTimeout(() => this.finishNativeMove(), 300)
          return
        }
      }
      this.docked = false
    })
    window.on('move', () => {
      if (this.applyingBounds) return
      const bounds = window.getContentBounds()
      if (this.appliedPosition && bounds.x === this.appliedPosition.x && bounds.y === this.appliedPosition.y) return
      this.anchor = { x: bounds.x + (this.left ? bounds.width - this.dimensions.stripWidth : 0), y: bounds.y + (this.above ? bounds.height - FOCUS_COMPACT_HEIGHT : 0) }
      if (this.positionTimer) clearTimeout(this.positionTimer)
      this.positionTimer = setTimeout(() => { if (this.nativeMoving) this.finishNativeMove(); else this.savePosition() }, 300)
    })
    // On macOS `moved` aliases every `move`, rather than ending the drag.
    // Let the quiet-period timer finish it so snapping does not fight each move.
    window.on('moved', () => { if (!this.applyingBounds && process.platform !== 'darwin' && this.nativeMoving) this.finishNativeMove() })
    window.on('close', event => { event.preventDefault(); window.hide() })
    window.on('blur', () => this.finishDimensionResize())
    window.webContents.on('render-process-gone', () => { if (!window.isDestroyed()) window.reload() })
    if (process.env.ELECTRON_RENDERER_URL) {
      const url = new URL(process.env.ELECTRON_RENDERER_URL)
      url.searchParams.set('surface', 'focus')
      await window.loadURL(url.href)
    } else await window.loadFile(join(__dirname, '../renderer/index.html'), { query: { surface: 'focus' } })
    this.keepVisible()
    await Promise.all([this.feed.load(), this.google.load(), this.ticktick.load(), this.microsoft.load(), this.links.load()])
    if (!this.menuBar) this.show()
    try {
      this.readPointer = createPointerReader()
      this.pointerWasDown = this.readPointer?.().down ?? false
      if (this.readPointer) this.pointerTimer = setInterval(() => this.pollPointer(), 32)
    } catch (error) { console.warn('Pointer state monitoring unavailable:', error instanceof Error ? error.message : String(error)) }
    if (process.platform === 'win32') {
      try {
        const probe = createTaskbarProbe(window)
        if (probe) this.dockVisibilityTimer = setInterval(() => {
          if (window.isDestroyed() || !this.docked || !window.isVisible() || window.isMinimized() || this.nativeMoving || this.dimensionGesture || window.getOpacity() === 0) return
          try {
            if (shouldRecoverDock({ docked: this.docked, visible: true, minimized: false, moving: false, samples: probe() })) {
              window.setAlwaysOnTop(true, 'pop-up-menu')
              window.moveTop() // Z-order only: preserve the user's foreground app.
            }
          } catch { /* A destroyed or changing foreign HWND is transient. */ }
        }, 500)
      } catch (error) { console.warn('Taskbar visibility monitoring unavailable:', error instanceof Error ? error.message : String(error)) }
    }
  }
  private savePosition() {
    if (!this.window || this.window.isDestroyed()) return
    const { x, y } = this.anchor
    try { writeFileSync(this.settingsFile, JSON.stringify({ x, y, docked: this.docked, alwaysOnTop: this.alwaysOnTop, menuBar: this.menuBar, ...this.dimensions }), 'utf8') } catch { /* Movement and resizing remain usable for this session. */ }
  }
  private finishNativeMove() {
    if (!this.window || this.window.isDestroyed()) return
    this.nativeMoving = false
    if (this.positionTimer) { clearTimeout(this.positionTimer); this.positionTimer = null }
    const display = screen.getDisplayMatching({ ...this.anchor, width: this.dimensions.stripWidth, height: FOCUS_COMPACT_HEIGHT })
    this.docked = process.platform === 'win32' && isBottomDockCandidate(this.anchor, display.workArea)
    this.keepVisible()
    this.savePosition()
  }
  dockToBottom() {
    if (process.platform !== 'win32') return
    this.docked = true
    this.keepVisible()
    this.savePosition()
    this.window?.showInactive()
    this.statusListener?.(this.menuStatus)
  }
  isMenuBarMode() { return this.menuBar }
  beginStripDrag(source: 'tray' | 'strip', point = screen.getCursorScreenPoint()) {
    if (process.platform !== 'darwin' || !this.readPointer || !this.window) return
    const bounds = this.window.getContentBounds()
    const anchor = source === 'tray' ? { x: point.x - this.dimensions.stripWidth / 2, y: point.y - 16 }
      : { x: bounds.x + (this.left ? bounds.width - this.dimensions.stripWidth : 0), y: bounds.y }
    this.stripDrag = { source, origin: point, anchor, active: false }
  }
  private pollPointer() {
    if (!this.readPointer || !this.window || this.window.isDestroyed()) return
    const { point, down } = this.readPointer()
    const pressed = down && !this.pointerWasDown
    this.pointerWasDown = down
    const drag = this.stripDrag
    if (drag) {
      const dx = point.x - drag.origin.x, dy = point.y - drag.origin.y
      if (down && !drag.active && Math.hypot(dx, dy) > 6) {
        drag.active = true
        this.menuBar = false; this.docked = false; this.expanded = false; this.calendarOpen = false; this.contentHeight = FOCUS_COMPACT_HEIGHT
        this.window.webContents.send('focus:collapse')
        this.window.showInactive()
        this.statusListener?.(this.menuStatus)
      }
      if (drag.active) {
        this.anchor = { x: drag.anchor.x + dx, y: drag.anchor.y + dy }
        this.keepVisible()
      }
      if (!down) {
        this.stripDrag = null
        if (drag.active) {
          this.dragEndedAt = Date.now()
          const display = screen.getDisplayMatching({ ...point, width: 1, height: 1 })
          if (point.y <= display.workArea.y + 12) this.useMenuBar()
          else this.savePosition()
        }
      }
      return
    }
    if (!pressed || !this.window.isVisible() || this.nativeMoving || this.dimensionGesture) return
    const inside = (rect: Electron.Rectangle) => point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height
    const tray = this.menuBarBounds?.()
    if (inside(this.window.getContentBounds()) || tray && inside(tray)) return
    if (this.expanded || this.calendarOpen) this.window.webContents.send('focus:outside-click')
  }
  useFloatingStrip() {
    if (process.platform !== 'darwin') return
    this.finishDimensionResize()
    this.menuBar = false
    this.docked = false
    this.expanded = false
    this.calendarOpen = false
    this.contentHeight = FOCUS_COMPACT_HEIGHT
    this.keepVisible()
    this.window?.webContents.send('focus:collapse')
    this.savePosition()
    this.window?.showInactive()
    this.statusListener?.(this.menuStatus)
  }
  useMenuBar() {
    if (process.platform !== 'darwin') return
    this.finishDimensionResize()
    this.menuBar = true
    this.keepVisible()
    this.window?.webContents.send('focus:collapse')
    this.savePosition()
    this.window?.hide()
    this.statusListener?.(this.menuStatus)
  }
  toggleFromMenuBar() {
    if (this.stripDrag?.active || Date.now() - this.dragEndedAt < 200) return
    this.toggle()
  }
  setMenuBarAnchor(provider: () => Electron.Rectangle | undefined) { this.menuBarBounds = provider; if (this.menuBar) this.keepVisible() }
  onMenuStatus(listener: (status: FocusMenuStatus) => void) { this.statusListener = listener; listener(this.menuStatus) }
  isAlwaysOnTop() { return this.alwaysOnTop }
  setAlwaysOnTop(value: boolean) {
    if (process.platform !== 'darwin') return
    this.alwaysOnTop = value
    this.window?.setAlwaysOnTop(value, 'floating')
    this.savePosition()
  }
  private validResize(target: unknown, edge: unknown) {
    return typeof edge === 'string' && resizeEdges.includes(edge as ResizeEdge) && (target === 'strip' ? !this.menuBar && !this.expanded && (edge === 'left' || edge === 'right') : target === 'calendar' && this.calendarOpen)
  }
  private dimensionStart(target: ResizeTarget, edge: ResizeEdge): DimensionGesture {
    const point = screen.getCursorScreenPoint()
    const dimensions = { ...this.dimensions }
    if (target === 'calendar' && this.window) dimensions.calendarWidth = this.window.getContentBounds().width - Math.max(FOCUS_WIDTH, dimensions.stripWidth) - FOCUS_GAP
    const bounds = this.window?.getContentBounds()
    const anchor = this.menuBar && bounds ? { x: bounds.x + (this.left ? bounds.width - dimensions.stripWidth : 0), y: bounds.y } : { ...this.anchor }
    return { target, edge, x: point.x, y: point.y, dimensions, anchor, left: this.left, above: this.above }
  }
  private applyDimensions(gesture: DimensionGesture, dx: number, dy: number) {
    const area = screen.getDisplayMatching({ ...gesture.anchor, width: gesture.dimensions.stripWidth, height: FOCUS_COMPACT_HEIGHT }).workArea
    const horizontal = gesture.edge.includes('left') ? -dx : gesture.edge.includes('right') ? dx : 0
    const vertical = gesture.edge.includes('top') ? -dy : gesture.edge.includes('bottom') ? dy : 0
    const requested = gesture.target === 'strip'
      ? { ...gesture.dimensions, stripWidth: Math.min(area.width, gesture.dimensions.stripWidth + horizontal) }
      : { ...gesture.dimensions, calendarWidth: Math.min(Math.max(400, area.width - Math.max(FOCUS_WIDTH, gesture.dimensions.stripWidth) - FOCUS_GAP), gesture.dimensions.calendarWidth + horizontal), calendarHeight: Math.min(area.height - FOCUS_PADDING, gesture.dimensions.calendarHeight + vertical) }
    this.dimensions = focusDimensions(requested)
    if (!this.menuBar) {
      this.anchor = { ...gesture.anchor }
      if (gesture.target === 'strip' && gesture.edge === 'left') this.anchor.x += gesture.dimensions.stripWidth - this.dimensions.stripWidth
    }
    this.keepVisible()
  }
  private finishDimensionResize() {
    if (!this.dimensionGesture) return
    this.dimensionGesture = null
    this.savePosition()
  }
  keepVisible() {
    if (!this.window || this.window.isDestroyed()) return
    const tray = this.menuBar ? this.menuBarBounds?.() : undefined
    const display = screen.getDisplayMatching(tray ?? { ...this.anchor, width: this.dimensions.stripWidth, height: FOCUS_COMPACT_HEIGHT })
    const area = display.workArea
    const sidebarWidth = this.expanded ? Math.max(FOCUS_WIDTH, this.dimensions.stripWidth) : this.dimensions.stripWidth
    const width = sidebarWidth + (this.calendarOpen ? FOCUS_GAP + this.dimensions.calendarWidth : 0)
    const layout = this.menuBar
      ? menuBarWindowLayout(tray ?? { x: area.x + area.width - 24, y: area.y, width: 24, height: 0 }, this.contentHeight, area, width, this.dimensions.stripWidth)
      : this.docked
      ? bottomDockLayout(this.contentHeight, display.bounds, area, width, this.dimensions.stripWidth, this.anchor.x)
      : focusWindowLayout(this.anchor, this.contentHeight, area, width, this.dimensions.stripWidth, this.dimensionGesture?.left, this.dimensionGesture?.above ?? false)
    if (!this.menuBar) this.anchor = layout.anchor
    this.above = layout.above
    this.left = layout.left
    if (process.platform === 'win32') this.window.setAlwaysOnTop(true, this.docked ? 'pop-up-menu' : 'floating')
    const availableHeight = this.menuBar ? area.y + area.height - layout.anchor.y : this.docked ? this.anchor.y - (process.platform === 'darwin' ? area.y : display.bounds.y) + FOCUS_COMPACT_HEIGHT : area.height
    this.window.webContents.send('focus:placement', { above: this.above, left: this.left, docked: !this.menuBar && this.docked, menuBar: this.menuBar, availableHeight, availableWidth: area.width, dimensions: this.dimensions })
    const current = this.window.getContentBounds()
    if (current.x === layout.bounds.x && current.y === layout.bounds.y && current.width === layout.bounds.width && current.height === layout.bounds.height) return
    this.applyingBounds = true
    try {
      this.window.setContentBounds(layout.bounds)
      const bounds = this.window.getContentBounds()
      this.appliedPosition = { x: bounds.x, y: bounds.y }
    } finally { this.applyingBounds = false }
  }
  show() {
    if (!this.window || this.window.isDestroyed()) return
    this.keepVisible()
    if (this.menuBar) { this.window.webContents.send('focus:open-details'); this.window.show() }
    else this.window.showInactive()
  }
  toggle() { if (this.window?.isVisible()) this.window.hide(); else this.show() }
  openCalendar() { this.show(); this.window?.webContents.send('focus:open-calendar') }
  openSettings() { this.show(); this.window?.webContents.send('focus:open-settings') }
  stop() {
    if (this.pointerTimer) clearInterval(this.pointerTimer)
    if (this.dockVisibilityTimer) clearInterval(this.dockVisibilityTimer)
    if (this.positionTimer) clearTimeout(this.positionTimer)
    this.savePosition()
    this.feed.stop()
    this.google.stop()
    this.ticktick.stop()
    this.microsoft.stop()
    this.links.stop()
    this.window?.destroy()
    this.window = null
  }
}
