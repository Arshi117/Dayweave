import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, X, GripVertical, PanelTop } from 'lucide-react'
import { cornerControlBounds } from '../../shared/desktop-layout'
import { BACKDROP_KEY, readBackdrop } from './appearance'
import { useCalendarFrame } from './useCalendarFrame'
import type { FrameHandle } from './calendar-frame'
import { EditModeButton } from './components/EditModeButton'
import { addDays, dateKey, isTimedEntry, startOfWeek } from './calendar'
import { WeekCalendar } from './components/WeekCalendar'
import { EventDialog } from './components/EventDialog'
import type { DesktopState, PlannerEntry, TimedEntry } from './types'
const STORAGE_KEY = 'dayweave.entries.v1'

const VIEW_KEY = 'dayweave.view-date'
const HINT_KEY = 'dayweave.corner-edit-used.v1'
const IS_WALLPAPER = new URLSearchParams(window.location.search).get('surface') === 'wallpaper'
function readAnchor(): Date {
  try {
    const saved = localStorage.getItem(VIEW_KEY)
    if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) {
      const value = new Date(saved + 'T12:00:00')
      if (!Number.isNaN(value.getTime())) return value
    }
  } catch { /* Use this week when saved view settings are unavailable. */ }
  return new Date()
}
function readEntries(): PlannerEntry[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = saved ? JSON.parse(saved) : []
    return Array.isArray(parsed) ? parsed as PlannerEntry[] : []
  } catch { return [] }
}
function needsHint() {
  try { return localStorage.getItem(HINT_KEY) !== 'yes' } catch { return true }
}
export default function App() {
  const [entries, setEntries] = useState(readEntries)
  const [anchor, setAnchor] = useState(readAnchor)
  const [clock, setClock] = useState(new Date())
  const [editing, setEditing] = useState<TimedEntry | null>(null)
  const [backdrop, setBackdrop] = useState(readBackdrop)
  const [storageError, setStorageError] = useState('')
  const [desktop, setDesktop] = useState<DesktopState>({ mode: window.desktopControls ? 'desktop' : 'editing', surface: IS_WALLPAPER ? 'wallpaper' : 'editor', shortcutAvailable: false, wallpaperStatus: 'starting', wallpaperError: '' })
  const [actionError, setActionError] = useState('')
  const [switching, setSwitching] = useState(false)
  const layout = useCalendarFrame(!IS_WALLPAPER && desktop.mode === 'editing' && !editing && !switching)
  const [showHint, setShowHint] = useState(needsHint)
  const [saved, setSaved] = useState(false)
  const corner = cornerControlBounds(layout.frame)
  const week = useMemo(() => startOfWeek(anchor), [anchor])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week])
  const timed = entries.filter((entry) => entry && isTimedEntry(entry))
  const last = days[6]
  const monthTitle = week.getFullYear() + '年' + (week.getMonth() + 1) + '月'
    + (week.getMonth() !== last.getMonth() ? ' — ' + (last.getFullYear() !== week.getFullYear() ? last.getFullYear() + '年' : '') + (last.getMonth() + 1) + '月' : '')
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const controls = window.desktopControls
    if (!controls) return
    void controls.getState().then(setDesktop).catch(() => setActionError('暂时无法获取桌面状态，请重新打开 Dayweave。'))
    return controls.onState(setDesktop)
  }, [])
  useEffect(() => {
    if (IS_WALLPAPER) window.desktopControls?.reportCalendarFrame(layout.frame)
  }, [layout.frame])
  useEffect(() => {
    if (!IS_WALLPAPER && desktop.mode === 'editing') {
      setShowHint(false)
      try { localStorage.setItem(HINT_KEY, 'yes') } catch { /* Hint stays dismissed for this window. */ }
    }
  }, [desktop.mode])
  useEffect(() => {
    if (!IS_WALLPAPER) window.desktopControls?.reportEditorBusy(Boolean(editing) || Boolean(storageError) || layout.adjusting || Boolean(layout.layoutError))
  }, [editing, storageError, layout.adjusting, layout.layoutError])
  useEffect(() => window.desktopControls?.onPrepare(() => {
    if (IS_WALLPAPER) {
      setEntries(readEntries())
      setAnchor(readAnchor())
      setBackdrop(readBackdrop())
      setShowHint(needsHint())
    }
    window.dispatchEvent(new Event('dayweave:prepare-view'))
  }), [])
  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key === STORAGE_KEY || event.key === null) setEntries(readEntries())
      if (event.key === BACKDROP_KEY || event.key === null) setBackdrop(readBackdrop())
      if (event.key === VIEW_KEY || event.key === null) setAnchor(readAnchor())
      if (event.key === HINT_KEY || event.key === null) setShowHint(needsHint())
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  function navigate(date: Date) {
    setAnchor(date)
    try { localStorage.setItem(VIEW_KEY, dateKey(date)) } catch { /* Navigation remains usable. */ }
  }
  function persist(next: PlannerEntry[]) {
    setEntries(next)
    try {
      // Preserve the pre-upgrade list, including any deadline-only tasks.
      if (localStorage.getItem('dayweave.entries.before-week-view') === null) {
        const previous = localStorage.getItem(STORAGE_KEY)
        if (previous) localStorage.setItem('dayweave.entries.before-week-view', previous)
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setStorageError('')
      setSaved(true)
      return true
    } catch { setStorageError('这次修改还没保存到本机。'); setSaved(false); return false }
  }
  function saveEntry(entry: TimedEntry) {
    if (IS_WALLPAPER) return
    if (persist(entries.some(item => item.id === entry.id) ? entries.map(item => item.id === entry.id ? entry : item) : [...entries, entry])) setEditing(null)
  }
  function createEntry(date: string, startTime: string, endTime: string) {
    if (IS_WALLPAPER) return
    setEditing({ id: crypto.randomUUID(), title: '', date, startTime, endTime, kind: 'block', completed: false, color: 'blue' })
  }
  function changeBackdrop(value: number) {
    setBackdrop(value)
    try { localStorage.setItem(BACKDROP_KEY, String(value)) } catch { /* Display remains usable for this session. */ }
  }
  async function pinCalendar(retry = false) {
    if (!window.desktopControls || switching || editing || storageError || layout.adjusting || layout.layoutError) return
    setSwitching(true)
    setActionError('')
    try {
      setDesktop(await (retry ? window.desktopControls.retryDesktop() : window.desktopControls.pinToDesktop()))
    } catch { setActionError('暂时无法返回桌面，请再试一次。') }
    finally { setSwitching(false) }
  }
  return <main className="calendar-stage" style={{ '--panel-opacity': backdrop / 100 } as CSSProperties}>
    <section className={'calendar-app' + (IS_WALLPAPER ? ' is-wallpaper' : '')} data-mode={desktop.mode} style={{ left: layout.frame.x, top: layout.frame.y, width: layout.frame.width, height: layout.frame.height, '--event-opacity': backdrop / 100, '--panel-opacity': backdrop / 100 } as CSSProperties}>
    <header className="calendar-toolbar" onPointerDown={event => { if (!(event.target as HTMLElement).closest('button, input, label')) layout.begin(event, 'move') }} {...layout.handlers}>
      <button className="calendar-move-handle editor-tools" aria-label="拖动日历位置" title="按住拖动，移动日历" onPointerDown={event => layout.begin(event, 'move')} {...layout.handlers}><GripVertical size={18} /></button>
      <div className="brand"><CalendarDays size={23} /><span>Dayweave</span></div>
      <div className="week-navigation">
        <div className="navigation-buttons editor-tools"><button onClick={() => navigate(new Date())}>今天</button>
        <button className="icon-button" onClick={() => navigate(addDays(anchor, -7))} aria-label="上一周"><ChevronLeft size={19} /></button>
        <button className="icon-button" onClick={() => navigate(addDays(anchor, 7))} aria-label="下一周"><ChevronRight size={19} /></button></div>
        <h1>{monthTitle}</h1>
      </div>
      <div className="toolbar-actions editor-tools">
        <label className="opacity-control" title="同时调整日历背景、时间块和栏位的深浅"><span>日历深浅</span><input aria-label="日历深浅" type="range" min="10" max="90" value={backdrop} onChange={e => changeBackdrop(Number(e.target.value))} /></label>
        <button className="icon-button" onClick={() => window.desktopControls?.showFocus()} aria-label="显示悬浮条" title="显示当前安排悬浮条"><PanelTop size={17} /></button>
        <button className="add-button" onClick={() => createEntry(dateKey(anchor), '09:00', '10:00')}><Plus size={16} />新建日程</button>
        <button className="icon-button close-button" onClick={() => window.desktopControls?.close()} aria-label="退出 Dayweave" title="退出 Dayweave"><X size={18} /></button>
      </div>
    </header>
    <WeekCalendar days={days} entries={timed} now={clock} readOnly={IS_WALLPAPER} onCreate={createEntry} onEdit={setEditing} onChange={saveEntry} />
    <footer className="calendar-footer">
      <span>{IS_WALLPAPER ? '桌面浏览 · 悬停右上角铅笔图标，更改日历' : '拖选添加日程 · 拖顶部移动 · 拖边角缩放'}</span>
      <span className="editing-status" role="status">{IS_WALLPAPER ? '周视图 · 15 分钟刻度' : '编辑中' + (saved && !storageError ? ' · 已保存' : '')}</span>
    </footer>
    {!IS_WALLPAPER && <div className="calendar-resize-handles" aria-hidden="true">
      {(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as FrameHandle[]).map(handle => <div key={handle} className={'calendar-resize-handle resize-' + handle} title="拖动调整日历大小" onPointerDown={event => layout.begin(event, handle)} {...layout.handlers} />)}
    </div>}
    {layout.layoutError && <div className="storage-message" role="alert">{layout.layoutError}<button onClick={layout.save}>重试保存</button></div>}
    {storageError && <div className="storage-message" role="alert">{storageError}<button onClick={() => persist(entries)}>重试保存</button></div>}
    {!IS_WALLPAPER && (desktop.wallpaperError || actionError) && <div className="desktop-message" role="status"><span>{actionError || desktop.wallpaperError}</span><button disabled={desktop.wallpaperStatus === 'starting'} onClick={() => { void pinCalendar(true) }}>重试贴到桌面</button></div>}
    {editing && <EventDialog key={editing.id} entry={editing} existing={entries.some(item => item.id === editing.id)} onSave={saveEntry} onClose={() => setEditing(null)} onDelete={() => { if (persist(entries.filter(item => item.id !== editing.id))) setEditing(null) }} />}
    </section>
    {!IS_WALLPAPER && window.desktopControls && <div className="mode-button-slot" style={{ left: corner.x, top: corner.y, width: corner.width, height: corner.height }}>
      <EditModeButton editing={desktop.mode === 'editing'} busy={switching || desktop.wallpaperStatus === 'starting' || Boolean(storageError) || Boolean(editing) || layout.adjusting || Boolean(layout.layoutError)} onClick={() => { void pinCalendar() }} />
    </div>}
    {IS_WALLPAPER && showHint && <div className="first-edit-hint" style={{ left: corner.x - 190, top: corner.y + 42 }}>点击铅笔图标，更改日历<span aria-hidden="true">→</span></div>}
  </main>
}
