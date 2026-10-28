import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { AlertCircle, ArrowLeft, ArrowUpRight, CalendarDays, Check, Clock3, ListTodo, Palette, Plus, RefreshCw, Settings2, X } from 'lucide-react'
import { extendFocus, focusView, localFocusEvents, type CalendarRange, type FocusSession, type SubscriptionSnapshot } from '../../shared/focus'
import { DEFAULT_FOCUS_DIMENSIONS, FOCUS_WIDTH, type FocusPlacement } from '../../shared/focus-window-layout'
import type { PlannerEntry } from './types'
import { CalendarPanel } from './components/CalendarPanel'
import { ImportConnections } from './components/ImportConnections'
import { EMPTY_GOOGLE, type GoogleCalendarState } from '../../shared/google-calendar'
import { combinedImports, EMPTY_MICROSOFT, EMPTY_SUBSCRIPTION, type MicrosoftTodoState } from '../../shared/imports'
import type { CalendarLinksState } from '../../shared/import-links'
import { FocusTasks, taskDeadline } from './components/FocusTasks'
import { dateKey } from './calendar'
import { AppearancePicker } from './components/AppearancePicker'
import { ResizeGrip } from './components/ResizeGrip'
import { APPEARANCE_KEY, readAppearance, type Appearance } from './appearance'
import { TASK_COMPLETION_KEY, readTaskCompletion } from './task-completion'
import { SyncStatus, syncSummary, type SyncSource } from './components/SyncStatus'
import { FirstUseHint, useFirstUseHints } from './components/FirstUseHint'
import './focus.css'
import './focus-theme.css'
import './focus-resize.css'
import './task-completion.css'
import './calendar-source.css'
import './usability.css'

const ENTRY_KEY = 'dayweave.entries.v1'
const SESSION_KEY = 'dayweave.focus.session.v1'
const DONE_KEY = 'dayweave.focus.completed.v1'
const TASK_KEY = 'dayweave.focus.task.v1'
function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback } catch { return fallback }
}
function readSession(): FocusSession | null {
  const session = read<FocusSession | null>(SESSION_KEY, null)
  if (!session || typeof session.eventId !== 'string' || session.extendedUntil !== undefined && (typeof session.extendedUntil !== 'number' || !Number.isFinite(session.extendedUntil))) return null
  // Retain the current selection and explicit extension, ignoring retired session fields.
  return session.extendedUntil === undefined ? { eventId: session.eventId } : { eventId: session.eventId, extendedUntil: session.extendedUntil }
}
function readCompleted(): Record<string, number> {
  const saved = read<Record<string, number>>(DONE_KEY, {})
  return Object.fromEntries(Object.entries(saved).filter(([, time]) => typeof time === 'number' && time > Date.now() - 3 * 86_400_000))
}
function time(value: number) { return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(value) }
function duration(ms: number) {
  const minutes = Math.max(1, Math.ceil(Math.max(0, ms) / 60_000))
  return minutes >= 60 ? Math.floor(minutes / 60) + '小时' + (minutes % 60 ? minutes % 60 + '分' : '') : minutes + '分钟'
}
const EMPTY_FEED: SubscriptionSnapshot = { configured: false, sourceLabel: '', events: [], lastSynced: null, refreshing: false, error: '' }

export function FocusBar() {
  const [now, setNow] = useState(Date.now())
  const [entries, setEntries] = useState(() => read<unknown>(ENTRY_KEY, []))
  const [session, setSession] = useState(readSession)
  const [completed, setCompleted] = useState(readCompleted)
  const [taskCompletion, setTaskCompletion] = useState(readTaskCompletion)
  const [feed, setFeed] = useState<SubscriptionSnapshot>(EMPTY_FEED)
  const [google, setGoogle] = useState<GoogleCalendarState>(EMPTY_GOOGLE)
  const [ticktick, setTickTick] = useState<SubscriptionSnapshot>(EMPTY_SUBSCRIPTION)
  const [microsoft, setMicrosoft] = useState<MicrosoftTodoState>(EMPTY_MICROSOFT)
  const [links, setLinks] = useState<CalendarLinksState>({ sources: [], error: '' })
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => { const saved = read<unknown>(TASK_KEY, null); return typeof saved === 'string' ? saved : null })
  const [syncOpen, setSyncOpen] = useState(false)
  const [connectionTarget, setConnectionTarget] = useState('home')
  const hints = useFirstUseHints()
  const activeFeed = useMemo(() => combinedImports(google, feed, ticktick, microsoft, links.sources), [google, feed, ticktick, microsoft, links.sources])
  const [feedLoaded, setFeedLoaded] = useState(false)
  const [settings, setSettings] = useState(false)
  const [appearance, setAppearance] = useState(readAppearance)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [calendar, setCalendar] = useState(false)
  const [placement, setPlacement] = useState<FocusPlacement>({ above: false, left: false, availableHeight: 800 })
  const dimensions = placement.dimensions ?? DEFAULT_FOCUS_DIMENSIONS
  const shell = useRef<HTMLElement>(null)
  const pull = useRef<{ id: number; y: number; moved: boolean; direction: number } | null>(null)
  const showDetails = expanded
  function collapse() { setExpanded(false); setSettings(false); setAppearanceOpen(false); setCalendar(false); setSyncOpen(false) }
  function openCalendar() { setExpanded(true); setCalendar(true); setSettings(false); setAppearanceOpen(false) }
  function openConnections(id = 'home') { setConnectionTarget(id); setExpanded(true); setSettings(true); setAppearanceOpen(false); setSyncOpen(false) }
  useEffect(() => { if (expanded) hints.dismiss('pull') }, [expanded])
  useEffect(() => {
    if (expanded || hints.seen.move) return
    let x = window.screenX, y = window.screenY
    const settledAfter = Date.now() + 750
    const timer = window.setInterval(() => {
      if (Date.now() < settledAfter) { x = window.screenX; y = window.screenY; return }
      if (Math.hypot(window.screenX - x, window.screenY - y) > 8) hints.dismiss('move')
    }, 250)
    return () => window.clearInterval(timer)
  }, [expanded, hints.seen.move])
  function pullStart(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    event.preventDefault(); event.stopPropagation()
    pull.current = { id: event.pointerId, y: event.screenY, moved: false, direction: placement.above ? -1 : 1 }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function pullMove(event: PointerEvent<HTMLButtonElement>) {
    const current = pull.current
    if (!current || current.id !== event.pointerId) return
    const delta = (event.screenY - current.y) * current.direction
    if (Math.abs(delta) > 5) current.moved = true
    if (delta > 12) setExpanded(true)
    else if (delta < -12) collapse()
  }
  function pullEnd(event: PointerEvent<HTMLButtonElement>) {
    const current = pull.current
    if (!current || current.id !== event.pointerId) return
    pull.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!current.moved) { if (expanded) collapse(); else setExpanded(true) }
  }
  useEffect(() => {
    const offPlacement = window.focusControls?.onPlacement(setPlacement)
    const offCalendar = window.focusControls?.onOpenCalendar(openCalendar)
    const offSettings = window.focusControls?.onOpenSettings(() => openConnections())
    return () => { offPlacement?.(); offCalendar?.(); offSettings?.() }
  }, [])
  useLayoutEffect(() => {
    if (!shell.current) return
    let last = 0
    const resize = () => {
      const height = Math.ceil(shell.current?.getBoundingClientRect().height ?? 44)
      if (height !== last) { last = height; window.focusControls?.resize(height, calendar, expanded) }
    }
    const observer = new ResizeObserver(resize)
    observer.observe(shell.current)
    resize()
    return () => observer.disconnect()
  }, [calendar, expanded])
  const [error, setError] = useState('')
  const requestCalendarRange = useCallback((range: CalendarRange) => {
    const api = window.focusControls
    if (!api) return
    const requests: Promise<unknown>[] = [api.setTickTickRange(range), api.setCalendarLinksRange(range)]
    if (google.connected) requests.push(api.setGoogleRange(range))
    if (!google.connected || !/(^|\.)google\.com$/i.test(feed.sourceLabel)) requests.push(api.setCalendarRange(range))
    void Promise.all(requests).catch(() => setError('部分来源的本周安排未读取，请检查连接设置。'))
  }, [google.connected, feed.sourceLabel])
  const events = useMemo(() => [...localFocusEvents(entries), ...activeFeed.events], [entries, activeFeed.events])
  const view = focusView(events, session, completed, now)

  function persist(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)); setError(''); return true }
    catch { setError('本次操作未保存，请重试。'); return false }
  }
  function changeSession(next: FocusSession | null) { if (persist(SESSION_KEY, next)) setSession(next) }
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    const refreshClock = () => setNow(Date.now())
    const sync = (event: StorageEvent) => {
      if (event.key === ENTRY_KEY || event.key === null) setEntries(read<unknown>(ENTRY_KEY, []))
      if (event.key === SESSION_KEY || event.key === null) setSession(readSession())
      if (event.key === DONE_KEY || event.key === null) setCompleted(readCompleted())
      if (event.key === TASK_COMPLETION_KEY || event.key === null) setTaskCompletion(readTaskCompletion())
      if (event.key === TASK_KEY || event.key === null) { const saved = read<unknown>(TASK_KEY, null); setSelectedTaskId(typeof saved === 'string' ? saved : null) }
      if (event.key === APPEARANCE_KEY || event.key === null) setAppearance(readAppearance())
    }
    window.addEventListener('storage', sync)
    window.addEventListener('focus', refreshClock)
    document.addEventListener('visibilitychange', refreshClock)
    return () => { clearInterval(timer); window.removeEventListener('storage', sync); window.removeEventListener('focus', refreshClock); document.removeEventListener('visibilitychange', refreshClock) }
  }, [])
  useEffect(() => {
    const api = window.focusControls
    if (!api) return
    let disposed = false
    void Promise.all([api.getSubscription(), api.getGoogle(), api.getTickTick(), api.getMicrosoft(), api.getCalendarLinks()]).then(([snapshot, account, ticks, todo, extra]) => {
      if (disposed) return
      if (snapshot) setFeed(snapshot)
      if (account) setGoogle(account)
      if (ticks) setTickTick(ticks)
      if (todo) setMicrosoft(todo)
      if (extra) setLinks(extra)
      setFeedLoaded(true)
    }).catch(() => { if (!disposed) { setError('无法读取日历连接设置，请重新打开应用。'); setFeedLoaded(true) } })
    const offFeed = api.onSubscription(setFeed)
    const offGoogle = api.onGoogle(setGoogle)
    const offTickTick = api.onTickTick(setTickTick)
    const offMicrosoft = api.onMicrosoft(setMicrosoft)
    const offLinks = api.onCalendarLinks(setLinks)
    return () => { disposed = true; offFeed(); offGoogle(); offTickTick(); offMicrosoft(); offLinks() }
  }, [])
  useEffect(() => {
    if (!feedLoaded && session && !session.eventId.startsWith('local:')) return
    if (view.current && session?.eventId !== view.current.id) changeSession({ eventId: view.current.id })
    // A subscription can arrive after the renderer loads. Do not discard its saved session before that first response.
    else if (!view.current && session && feedLoaded) changeSession(null)
  }, [view.current?.id, session?.eventId, feedLoaded])

  function complete() {
    if (!view.current) return
    const next = { ...readCompleted(), [view.current.id]: Date.now() }
    if (persist(DONE_KEY, next)) { setCompleted(next); changeSession(null) }
  }
  function toggleTaskCompletion(id: string, done: boolean) {
    const next = { ...readTaskCompletion() }
    if (done) next[id] = Date.now()
    else delete next[id]
    if (persist(TASK_COMPLETION_KEY, next)) setTaskCompletion(next)
  }
  function toggleSettings() {
    setExpanded(true)
    setAppearanceOpen(false)
    setSyncOpen(false); setConnectionTarget('home')
    setSettings(current => !current)
  }
  function changeAppearance(next: Appearance) {
    if (persist(APPEARANCE_KEY, next)) setAppearance(next)
  }
  function saveEntries(next: PlannerEntry[]) {
    if (!persist(ENTRY_KEY, next)) return false
    setEntries(next)
    return true
  }
  async function retrySource(id: string) {
    const api = window.focusControls
    if (!api) throw new Error('Unavailable app connection')
    if (id === 'google') setGoogle(await api.refreshGoogle())
    else if (id === 'microsoft') setMicrosoft(await api.refreshMicrosoft())
    else if (id === 'legacy') setFeed(await api.refreshSubscription())
    else if (id === 'ticktick') setTickTick(await api.refreshTickTick())
    else setLinks(await api.refreshCalendarLink(id))
  }
  const syncSources: SyncSource[] = []
  const addSyncSource = (id: string, name: string, state: Pick<SyncSource, 'lastSynced' | 'refreshing' | 'error' | 'reconnectRequired'>) => syncSources.push({ id, name, ...state, retry: () => retrySource(id) })
  if (google.connected || google.reconnectRequired || google.error) addSyncSource('google', 'Google 日历', google)
  if (feed.configured && !(google.connected && /(^|\.)google\.com$/i.test(feed.sourceLabel))) addSyncSource('legacy', feed.calendarName || '日历订阅', feed)
  if (ticktick.configured) addSyncSource('ticktick', ticktick.calendarName || 'TickTick', ticktick)
  if (microsoft.connected || microsoft.reconnectRequired || microsoft.error) addSyncSource('microsoft', 'Microsoft To Do', microsoft)
  for (const source of links.sources) addSyncSource(source.id, source.snapshot.calendarName || (source.provider === 'ticktick' ? 'TickTick' : source.snapshot.sourceLabel), source.snapshot)
  const syncProblem = syncSources.some(source => source.error || source.reconnectRequired)
  const syncBusy = syncSources.some(source => source.refreshing)
  const today = dateKey(new Date(now))
  const tasks = useMemo(() => (activeFeed.tasks || []).filter(task => !taskCompletion[task.id]).sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'))
    || (a.dueAt || 0) - (b.dueAt || 0) || a.title.localeCompare(b.title)), [activeFeed.tasks, taskCompletion])
  const selectedTask = view.current ? null : tasks.find(task => task.id === selectedTaskId)
    || tasks.find(task => task.dueDate === today) || (!view.next ? tasks.find(task => !task.dueDate) || tasks.find(task => task.dueDate && task.dueDate > today) || tasks[0] : null)
  function selectTask(id: string) { if (persist(TASK_KEY, id)) setSelectedTaskId(id) }
  const nextDate = view.next && new Date(view.next.start).toDateString() !== new Date(now).toDateString()
    ? new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(view.next.start) + ' ' : ''
  const nextLabel = view.next ? nextDate + time(view.next.start) + ' ' + view.next.title : '暂无后续安排'
  const upcomingConflicts = view.conflicts.filter(event => event.start > now)
  const focusNote = upcomingConflicts.length ? '将与“' + upcomingConflicts[0].title + '”时间重叠' : ''
  const minutes = view.current ? Math.max(1, Math.ceil(Math.max(0, view.end - now) / 60_000)) : 0
  const briefTime = minutes >= 60 ? Math.floor(minutes / 60) + '时' + (minutes % 60 ? minutes % 60 + '分' : '') : minutes + '分'
  const timerValue = minutes >= 60 ? Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0') : String(minutes)
  const seconds = Math.max(0, Math.ceil((view.end - now) / 1000))
  const digitalTime = (seconds >= 3600 ? Math.floor(seconds / 3600) + ':' : '') + String(Math.floor(seconds / 60) % 60).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0')
  const stateLabel = view.current ? '正在进行' : selectedTask ? '待办事项' : '下一项安排'
  const problem = error || activeFeed.error
  return <main ref={shell} data-appearance={appearance} style={{ '--focus-details-max': Math.max(120, placement.availableHeight - 64) + 'px', '--focus-sidebar-width': Math.max(FOCUS_WIDTH, dimensions.stripWidth) - 12 + 'px' } as CSSProperties} className={'focus-shell' + (expanded ? ' is-expanded' : '') + (settings || appearanceOpen ? ' is-settings' : '') + (calendar ? ' has-calendar' : '') + (placement.left ? ' calendar-left' : '') + (placement.above ? ' opens-above' : '')}
    onKeyDown={event => {
      if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return
      if (calendar) setCalendar(false); else collapse()
    }}>
    <div className="focus-sidebar">
    <div className="focus-strip">
    <section className={'focus-pill' + (problem ? ' has-problem' : '')} aria-label="当前安排悬浮条" title={expanded ? '按住长条拖动；收起后可拖左右边缘调整长度' : '按住长条拖动；拖左右边缘调长度；拉动下沿展开'}>
      <span className={'focus-pill-marker' + (view.current ? ' is-active' : '')}><span className="focus-status-badge">{view.current ? <Clock3 size={12} strokeWidth={1.7} /> : selectedTask ? <ListTodo size={12} strokeWidth={1.7} /> : <CalendarDays size={12} strokeWidth={1.7} />}</span></span>
      <div className="focus-pill-summary">
        <span className="focus-pill-title" title={view.current?.title ?? selectedTask?.title ?? view.next?.title}>{view.current?.title ?? selectedTask?.title ?? view.next?.title ?? '暂时空闲'}</span>
        {view.current ? <span className="focus-pill-time">{briefTime}</span> : selectedTask ? <span className="focus-pill-time">待办</span> : view.next ? <span className="focus-pill-time">{time(view.next.start)}</span> : null}
      </div>
      <div className="focus-pill-progress" role="progressbar" aria-label="时间段已过去的比例" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(view.progress * 100)}
        style={{ '--focus-progress': view.current ? view.progress * 100 + '%' : '0%' } as CSSProperties}><span /></div>
    </section>
      {!expanded && <><ResizeGrip target="strip" edge="left" /><ResizeGrip target="strip" edge="right" /></>}
      <button className="focus-pull-handle" title={showDetails ? '向回推或点击收起' : '拉动下沿或点击展开'} aria-label={showDetails ? '收起当前安排' : '拉开当前安排'} aria-expanded={showDetails}
        onPointerDown={pullStart} onPointerMove={pullMove} onPointerUp={pullEnd} onPointerCancel={() => { pull.current = null }} onLostPointerCapture={() => { pull.current = null }}
        onClick={event => { if (event.detail === 0) { if (expanded) collapse(); else setExpanded(true) } }}><span /></button>
    </div>
    {!hints.seen.move ? <FirstUseHint kind="move" onDismiss={() => hints.dismiss('move')} /> : !expanded && !hints.seen.pull ? <FirstUseHint kind="pull" onDismiss={() => hints.dismiss('pull')} /> : null}
    {showDetails && <section className="focus-details" aria-label={appearanceOpen ? '外观设置' : settings ? '连接与导入' : '当前安排详情'}>
      <header className="focus-details-header">
        {(settings || appearanceOpen) && <button title="返回当前安排" aria-label="返回当前安排" onClick={() => { setSettings(false); setAppearanceOpen(false) }}><ArrowLeft size={14} /></button>}
        <span className="focus-panel-label">{appearanceOpen ? '外观' : settings ? '连接与导入' : 'Dayweave'}</span>
        <div className="focus-header-actions">
          <button className={syncProblem ? 'sync-status-trigger has-error' : 'sync-status-trigger'} aria-label="同步状态" aria-expanded={syncOpen} title={syncSummary(syncSources, now)} onClick={() => setSyncOpen(value => !value)}>{syncProblem ? <AlertCircle size={14} /> : <RefreshCw size={14} className={syncBusy ? 'is-spinning' : undefined} />}</button>
          <button title={calendar ? '收起日历' : '展开日历'} aria-label="展开日历" aria-pressed={calendar} onClick={() => { if (calendar) setCalendar(false); else openCalendar() }}><CalendarDays size={14} /></button>
          <button title="切换外观" aria-label="切换外观" aria-pressed={appearanceOpen} onClick={() => { setSettings(false); setAppearanceOpen(current => !current) }}><Palette size={14} /></button>
          {!settings && <button title="连接与导入" aria-label="连接与导入" onClick={toggleSettings}><Settings2 size={14} /></button>}
          <button title="收起面板" aria-label="收起面板" onClick={collapse}><X size={14} /></button>
        </div>
      </header>
      {syncOpen && <SyncStatus sources={syncSources} now={now} onManage={openConnections} />}
      {appearanceOpen ? <AppearancePicker value={appearance} onChange={changeAppearance} /> : settings ? <div className="focus-settings">
        <ImportConnections key={connectionTarget} initialView={connectionTarget} google={google} feed={feed} ticktick={ticktick} microsoft={microsoft} links={links}
          onGoogle={setGoogle} onFeed={setFeed} onTickTick={setTickTick} onMicrosoft={setMicrosoft} onLinks={setLinks} />
      </div> : <>
        <div className="focus-main">
          {view.current ? <div className="focus-session">
            <div className="focus-session-copy"><span className="focus-eyebrow"><i />{stateLabel}</span><h2 title={view.current.title}>{view.current.title}</h2><p><Clock3 size={10} />{time(view.current.start)} — {time(view.end)}{session?.extendedUntil ? ' · 已延长' : ''}</p></div>
            <div className="focus-session-timer" aria-label={'剩余 ' + duration(view.end - now)}>
              {appearance === 'graphite' && <svg className="focus-timer-ring" viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="37" /><circle cx="42" cy="42" r="37" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - view.progress * 100} /></svg>}
              <strong>{appearance === 'silver' ? digitalTime : timerValue}</strong><span>还剩 · {appearance === 'silver' ? seconds >= 3600 ? '时:分:秒' : '分:秒' : minutes >= 60 ? '时:分' : '分钟'}</span>
            </div>
          </div> : selectedTask ? <div className="focus-session is-task"><div className="focus-session-copy"><span className="focus-eyebrow"><i />待办事项</span><h2 title={selectedTask.title}>{selectedTask.title}</h2><p>{taskDeadline(selectedTask, today)}</p></div><label className="focus-selected-task-complete" title="仅在 Dayweave 标记完成，不会更改原应用"><input className="task-completion-checkbox" type="checkbox" checked={false} aria-label={'完成待办：' + selectedTask.title} onChange={event => toggleTaskCompletion(selectedTask.id, event.target.checked)} /><span>完成</span></label></div>
            : view.next ? <div className="focus-session is-upcoming"><div className="focus-session-copy"><span className="focus-eyebrow"><i />下一项安排</span><h2 title={view.next.title}>{view.next.title}</h2><p>{nextDate}{time(view.next.start)} 开始</p></div><span className="focus-session-symbol"><ArrowUpRight size={20} strokeWidth={1.5} /></span></div>
              : <div className="focus-rest"><span className="focus-session-symbol"><CalendarDays size={20} strokeWidth={1.5} /></span><div><h2>当前没有安排</h2><p>连接日历，或为今天添加一项安排。</p></div></div>}
          {view.concurrent.length > 0 && <div className="focus-concurrent" aria-label="其他正在进行的安排"><span>同时进行</span><div>{view.concurrent.map(event => <div key={event.id} title={event.title + '\n' + time(event.start) + ' — ' + time(event.end)}><strong>{event.title}</strong><small>{time(event.start)} — {time(event.end)}</small></div>)}</div></div>}
          {view.current && <div className={'focus-next' + (!view.next ? ' is-empty' : '')} title={nextLabel}><span><ArrowUpRight size={11} />下一项</span><strong>{nextLabel}</strong></div>}
          {!view.current && <FocusTasks tasks={tasks} selectedId={selectedTask?.id} today={today} onSelect={selectTask} onComplete={id => toggleTaskCompletion(id, true)} />}
          {upcomingConflicts.length > 0 && <div className="focus-conflict" role="status" title={focusNote}>{focusNote}</div>}
        </div>
        {view.current && <footer className="focus-actions">
          <button onClick={complete} title="只在 Dayweave 标记完成"><Check size={13} />完成</button>
          <button title="继续 15 分钟" onClick={() => view.current && changeSession(extendFocus(view.current, view.end, Date.now()))}><Plus size={13} />延长 15 分钟</button>
        </footer>}
      </>}
      {error && <div className="focus-error" role="alert">{error}</div>}
    </section>}
    </div>
    {calendar && <CalendarPanel entries={entries} subscription={activeFeed} taskCompletion={taskCompletion} onTaskCompletion={toggleTaskCompletion} now={now} height={Math.max(240, Math.min(dimensions.calendarHeight, placement.availableHeight - 12))} left={placement.left} above={placement.above} onSave={saveEntries} onRangeChange={requestCalendarRange} onClose={() => setCalendar(false)} showSplitHint={!hints.seen.split} onDismissSplitHint={() => hints.dismiss('split')} />}
  </main>
}

