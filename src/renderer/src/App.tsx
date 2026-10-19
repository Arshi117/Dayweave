import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { cornerControlBounds } from '../../shared/desktop-layout'
import { EditModeButton } from './components/EditModeButton'
import { addDays, dateKey, isTimedEntry, startOfWeek } from './calendar'
import { WeekCalendar } from './components/WeekCalendar'
import { EventDialog } from './components/EventDialog'
import type { DesktopState, PlannerEntry, TimedEntry } from './types'
const STORAGE_KEY = 'dayweave.entries.v1'
const OPACITY_KEY = 'dayweave.event-opacity'
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
function readOpacity(): number {
  try {
    const saved = localStorage.getItem(OPACITY_KEY)
    const value = saved === null ? 55 : Number(saved)
    return Number.isFinite(value) ? Math.min(90, Math.max(20, value)) : 55
  } catch { return 55 }
}
function needsHint() {
  try { return localStorage.getItem(HINT_KEY) !== 'yes' } catch { return true }
}
export default function App() {
  const [entries, setEntries] = useState(readEntries)
  const [anchor, setAnchor] = useState(readAnchor)
  const [clock, setClock] = useState(new Date())
  const [editing, setEditing] = useState<TimedEntry | null>(null)
  const [opacity, setOpacity] = useState(readOpacity)
  const [storageError, setStorageError] = useState('')
  const [desktop, setDesktop] = useState<DesktopState>({ mode: window.desktopControls ? 'desktop' : 'editing', surface: IS_WALLPAPER ? 'wallpaper' : 'editor', shortcutAvailable: false, wallpaperStatus: 'starting', wallpaperError: '' })
  const [actionError, setActionError] = useState('')
  const [switching, setSwitching] = useState(false)
  const [showHint, setShowHint] = useState(needsHint)
  const [saved, setSaved] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth)
  const corner = cornerControlBounds(viewportWidth)
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
    const resize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  useEffect(() => {
    if (!IS_WALLPAPER && desktop.mode === 'editing') {
      setShowHint(false)
      try { localStorage.setItem(HINT_KEY, 'yes') } catch { /* Hint stays dismissed for this window. */ }
    }
  }, [desktop.mode])
  useEffect(() => {
    if (!IS_WALLPAPER) window.desktopControls?.reportEditorBusy(Boolean(editing) || Boolean(storageError))
  }, [editing, storageError])
  useEffect(() => window.desktopControls?.onPrepare(() => {
    if (IS_WALLPAPER) {
      setEntries(readEntries())
      setAnchor(readAnchor())
      setOpacity(readOpacity())
      setShowHint(needsHint())
    }
    window.dispatchEvent(new Event('dayweave:prepare-view'))
  }), [])
  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key === STORAGE_KEY || event.key === null) setEntries(readEntries())
      if (event.key === OPACITY_KEY || event.key === null) setOpacity(readOpacity())
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
  function changeOpacity(value: number) {
    setOpacity(value)
    try { localStorage.setItem(OPACITY_KEY, String(value)) } catch { /* Display remains usable for this session. */ }
  }
  async function pinCalendar(retry = false) {
    if (!window.desktopControls || switching || editing || storageError) return
    setSwitching(true)
    setActionError('')
    try {
      setDesktop(await (retry ? window.desktopControls.retryDesktop() : window.desktopControls.pinToDesktop()))
    } catch { setActionError('暂时无法返回桌面，请再试一次。') }
    finally { setSwitching(false) }
  }
  return <main className={'calendar-app' + (IS_WALLPAPER ? ' is-wallpaper' : '')} data-mode={desktop.mode} style={{ '--event-opacity': opacity / 100 } as CSSProperties}>
    <header className="calendar-toolbar">
      <div className="brand"><CalendarDays size={23} /><span>Dayweave</span></div>
      <div className="week-navigation">
        <div className="navigation-buttons editor-tools"><button onClick={() => navigate(new Date())}>今天</button>
        <button className="icon-button" onClick={() => navigate(addDays(anchor, -7))} aria-label="上一周"><ChevronLeft size={19} /></button>
        <button className="icon-button" onClick={() => navigate(addDays(anchor, 7))} aria-label="下一周"><ChevronRight size={19} /></button></div>
        <h1>{monthTitle}</h1>
      </div>
      <div className="toolbar-actions editor-tools">
        <label className="opacity-control" title="只改变日程块的深浅，空白处始终透明"><span>日程深浅</span><input aria-label="日程深浅" type="range" min="20" max="90" value={opacity} onChange={e => changeOpacity(Number(e.target.value))} /></label>
        <button className="add-button" onClick={() => createEntry(dateKey(anchor), '09:00', '10:00')}><Plus size={16} />新建日程</button>
        <button className="icon-button close-button" onClick={() => window.desktopControls?.close()} aria-label="退出 Dayweave" title="退出 Dayweave"><X size={18} /></button>
      </div>
    </header>
    {!IS_WALLPAPER && window.desktopControls && <div className="mode-button-slot" style={{ left: corner.x, top: corner.y, width: corner.width, height: corner.height }}>
      <EditModeButton editing={desktop.mode === 'editing'} busy={switching || desktop.wallpaperStatus === 'starting' || Boolean(storageError) || Boolean(editing)} onClick={() => { void pinCalendar() }} />
    </div>}
    {IS_WALLPAPER && showHint && <div className="first-edit-hint" style={{ right: viewportWidth - corner.x + 12, top: corner.y + 3 }}>点右上角“编辑日程”开始安排<span aria-hidden="true">→</span></div>}
    <WeekCalendar days={days} entries={timed} now={clock} readOnly={IS_WALLPAPER} onCreate={createEntry} onEdit={setEditing} onChange={saveEntry} />
    <footer className="calendar-footer">
      <span>{IS_WALLPAPER ? '桌面浏览 · 点击右上角“编辑日程”修改安排' : '拖选添加 · 拖动调整时间 · 完成后点右上角“固定桌面”'}</span>
      <span className="editing-status" role="status">{IS_WALLPAPER ? '周视图 · 15 分钟刻度' : '编辑中' + (saved && !storageError ? ' · 已保存' : '')}</span>
    </footer>
    {storageError && <div className="storage-message" role="alert">{storageError}<button onClick={() => persist(entries)}>重试保存</button></div>}
    {!IS_WALLPAPER && (desktop.wallpaperError || actionError) && <div className="desktop-message" role="status"><span>{actionError || desktop.wallpaperError}</span><button disabled={desktop.wallpaperStatus === 'starting'} onClick={() => { void pinCalendar(true) }}>重试贴到桌面</button></div>}
    {editing && <EventDialog key={editing.id} entry={editing} existing={entries.some(item => item.id === editing.id)} onSave={saveEntry} onClose={() => setEditing(null)} onDelete={() => { if (persist(entries.filter(item => item.id !== editing.id))) setEditing(null) }} />}
  </main>
}
