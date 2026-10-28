import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import type { CalendarRange, SubscriptionSnapshot } from '../../../shared/focus'
import { localFocusEvents } from '../../../shared/focus'
import { addDays, dateKey, HOUR_HEIGHT, isTimedEntry, startOfWeek } from '../calendar'
import { importedCalendarEntries } from '../calendar-imports'
import { WeekCalendar } from './WeekCalendar'
import { EventDialog } from './EventDialog'
import { CalendarTaskSplit } from './CalendarTaskSplit'
import { ResizeGrip } from './ResizeGrip'
import { FirstUseHint } from './FirstUseHint'
import type { TaskCompletion } from '../task-completion'
import type { ImportedTask } from '../../../shared/imports'
import type { PlannerEntry, TimedEntry } from '../types'
import '../calendar-panel.css'

interface Props {
  entries: unknown
  subscription: SubscriptionSnapshot
  taskCompletion: TaskCompletion
  onTaskCompletion: (id: string, done: boolean) => void
  now: number
  height: number
  left?: boolean
  above?: boolean
  onSave: (entries: PlannerEntry[]) => boolean
  onRangeChange: (range: CalendarRange) => void
  onClose: () => void
  showSplitHint?: boolean
  onDismissSplitHint?: () => void
}
export function CalendarPanel({ entries, subscription, taskCompletion, onTaskCompletion, now, height, left = false, above = false, onSave, onRangeChange, onClose, showSplitHint, onDismissSplitHint }: Props) {
  const imported = subscription.events
  const panel = useRef<HTMLElement>(null)
  const local = useMemo<PlannerEntry[]>(() => Array.isArray(entries) ? entries.filter(entry => entry && typeof entry.id === 'string') : [], [entries])
  const all = useMemo(() => [...localFocusEvents(entries), ...imported], [entries, imported])
  const [anchor, setAnchor] = useState(() => new Date(now))
  const [source, setSource] = useState<'all' | 'local' | 'subscription'>('all')
  const [editing, setEditing] = useState<TimedEntry | null>(null)
  const [schedulingTask, setSchedulingTask] = useState(false)
  const [inspecting, setInspecting] = useState<TimedEntry | null>(null)
  const week = startOfWeek(anchor)
  const weekKey = dateKey(week)
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(week, index)), [weekKey])
  const timed = useMemo(() => local.filter(isTimedEntry).filter(entry => !entry.readOnly), [local])
  const subscribed = useMemo(() => importedCalendarEntries(imported, days), [imported, days])
  const from = days[0].getTime(), until = addDays(days[6], 1).getTime()
  const visible = useMemo(() => all.filter(event => event.start < until && event.end > from && (source === 'all' || event.source === source)), [all, from, until, source])
  const importedCount = imported.filter(event => event.start < until && event.end > from).length
  const localCount = all.filter(event => event.source === 'local' && event.start < until && event.end > from).length
  const covered = subscription.hasTimedSource === false || subscription.range?.from === from && subscription.range?.to === until
  const loading = subscription.configured && source !== 'local' && !covered && subscription.refreshing
  const hiddenTitles = imported.length > 0 && subscription.redactedCount === imported.length
  const hasEvents = visible.length > 0
  const nearest = [...all].filter(event => event.end > now).sort((a, b) => a.start - b.start)[0]
  const month = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(anchor)
  useEffect(() => { onRangeChange({ from, to: until }) }, [from, until, onRangeChange])
  useEffect(() => {
    // Open at a relevant time instead of restoring the former wallpaper's scroll and week.
    const target = [...visible].sort((a, b) => a.start - b.start).find(event => event.end > now) ?? visible[0]
    const hour = target ? new Date(Math.max(from, target.start)).getHours() : new Date(now).getHours()
    const frame = requestAnimationFrame(() => {
      const scroll = panel.current?.querySelector('.calendar-scroll')
      if (scroll) scroll.scrollTop = Math.max(0, hour - 1) * HOUR_HEIGHT
    })
    setInspecting(null)
    return () => cancelAnimationFrame(frame)
  }, [weekKey, hasEvents])
  function create(date: string, startTime: string, endTime: string) {
    setSchedulingTask(false)
    setInspecting(null)
    setEditing({ id: crypto.randomUUID(), title: '', date, startTime, endTime, kind: 'block', completed: false, color: 'violet' })
  }
  function save(entry: TimedEntry) {
    if (entry.readOnly) return
    if (onSave(local.some(item => item.id === entry.id) ? local.map(item => item.id === entry.id ? entry : item) : [...local, entry])) setEditing(null)
  }
  function scheduleTask(task: ImportedTask) {
    const today = dateKey(new Date(now))
    const date = task.dueDate && task.dueDate > today ? task.dueDate : today
    const hour = new Date(now).getHours()
    setInspecting(null)
    setSchedulingTask(true)
    setEditing({ id: crypto.randomUUID(), title: task.title, date, startTime: String(hour).padStart(2, '0') + ':00',
      endTime: hour === 23 ? '24:00' : String(hour + 1).padStart(2, '0') + ':00', kind: 'block', completed: false, color: 'amber' })
  }
  function dropTask(id: string, date: string, startTime: string, endTime: string) {
    const task = subscription.tasks?.find(item => item.id === id && !taskCompletion[item.id])
    if (!task) return
    setInspecting(null); setSchedulingTask(true)
    setEditing({ id: crypto.randomUUID(), title: task.title, date, startTime, endTime, kind: 'block', completed: false, color: 'amber' })
  }
  const calendar = <div className="calendar-schedule-pane"><WeekCalendar days={days} entries={[...(source === 'subscription' ? [] : timed), ...(source === 'local' ? [] : subscribed.filter(entry => !entry.allDay))]} allDayEntries={source === 'local' ? [] : subscribed.filter(entry => entry.allDay)} now={new Date(now)} onCreate={create} onEdit={entry => { setSchedulingTask(false); if (entry.readOnly) setInspecting(entry); else setEditing(entry) }} onChange={save} onTaskDrop={dropTask} />
    {!hasEvents && !loading && <div className="drawer-empty-week"><span>{subscription.configured && !covered && source !== 'local' ? '这一周的订阅尚未读取完整' : source === 'subscription' ? '此订阅在这一周没有安排' : '这一周还没有安排'}</span>{nearest && <button onClick={() => setAnchor(new Date(nearest.start))}>查看最近安排</button>}</div>}
  </div>
  return <section ref={panel} className={'focus-calendar-panel' + (height < 520 ? ' is-short' : '')} style={{ height, '--calendar-panel-height': height + 'px' } as CSSProperties} aria-label="日历时间表">
    <header className="drawer-calendar-header">
      <div><span className="drawer-eyebrow">一周安排</span><h2>{month}</h2></div>
      <nav aria-label="切换查看周次">
        <button onClick={() => setAnchor(new Date())}>今天</button>
        <button className="drawer-icon" aria-label="上一周" title="上一周" onClick={() => setAnchor(addDays(anchor, -7))}><ChevronLeft size={16} /></button>
        <button className="drawer-icon" aria-label="下一周" title="下一周" onClick={() => setAnchor(addDays(anchor, 7))}><ChevronRight size={16} /></button>
        <button className="drawer-add" onClick={() => { const hour = new Date().getHours(); create(dateKey(anchor), String(hour).padStart(2, '0') + ':00', hour === 23 ? '24:00' : String(hour + 1).padStart(2, '0') + ':00') }}><Plus size={14} />新建</button>
        <button className="drawer-icon" aria-label="收起日历" title="收起日历" onClick={onClose}><X size={16} /></button>
      </nav>
    </header>
    <div className="drawer-calendar-source"><span title={subscription.calendarName || subscription.sourceLabel}>{subscription.configured ? '订阅：' + (subscription.calendarName || subscription.sourceLabel) : '尚未连接订阅日历'}</span><label>显示<select aria-label="显示哪些日程" value={source} onChange={event => setSource(event.target.value as typeof source)}><option value="all">全部安排</option><option value="subscription">仅订阅日历</option><option value="local">仅本机日程</option></select></label></div>
    <div className="drawer-calendar-summary"><span>{days[0].getMonth() + 1}月{days[0].getDate()}日 — {days[6].getMonth() + 1}月{days[6].getDate()}日</span><span>{loading ? '正在读取这一周…' : visible.length + ' 项安排'}</span></div>
    {subscription.configured && source !== 'local' && hiddenTitles && <div className="drawer-source-notice" role="status">{subscription.connectionType === 'google' ? '这些安排的名称未向当前账号开放，请检查该日历的访问权限。' : subscription.sourceEventCount && subscription.sourceBusyCount === subscription.sourceEventCount ? '来源文件仅提供忙闲信息，未提供课程名称。' : '此订阅中的安排名称为“Busy”（忙碌），未提供课程名称。'}{subscription.addressKind === 'public' ? ' 当前连接的是公开 iCal 订阅。' : ''}</div>}
    {subscription.configured && subscription.error && source !== 'local' && <div className="drawer-source-notice" role="alert">{subscription.error}</div>}
    {source !== 'local' && subscription.importWarnings?.map(warning => <div key={warning} className="drawer-source-notice" role="status">{warning}</div>)}
    {showSplitHint && source !== 'local' && Boolean(subscription.tasks?.length) && <FirstUseHint kind="split" onDismiss={() => onDismissSplitHint?.()} />}
    {source !== 'local' && Boolean(subscription.tasks?.length) ? <CalendarTaskSplit onAdjust={onDismissSplitHint} taskProps={{ tasks: subscription.tasks || [], completed: taskCompletion, onCompletion: onTaskCompletion, today: dateKey(new Date(now)), onSchedule: scheduleTask }}>{calendar}</CalendarTaskSplit> : calendar}
    <footer className="drawer-calendar-footer"><span><i className="local-dot" />本机 {localCount}<i className="subscription-dot" />订阅 {importedCount}</span><span>拖边缘调整大小 · 拖选空白新建日程</span></footer>
    <ResizeGrip target="calendar" edge={left ? 'left' : 'right'} />
    <ResizeGrip target="calendar" edge={above ? 'top' : 'bottom'} />
    <ResizeGrip target="calendar" edge={above ? left ? 'top-left' : 'top-right' : left ? 'bottom-left' : 'bottom-right'} />
    {inspecting && <aside className="calendar-inspection"><button aria-label="关闭日程详情" onClick={() => setInspecting(null)}><X size={14} /></button><span>{inspecting.calendarName || '订阅日程'}</span><h3>{inspecting.title}</h3><p>{inspecting.date} · {inspecting.allDay ? '全天' : inspecting.startTime + ' — ' + inspecting.endTime}</p>
      {inspecting.sourceTitle && <p>原名称：{inspecting.sourceTitle}</p>}
      {inspecting.location && <p className="calendar-event-location">{inspecting.location}</p>}{inspecting.description && <div className="calendar-event-description">{inspecting.description}</div>}
      {Boolean(inspecting.sourceDetails?.length) && <details className="calendar-source-fields"><summary>更多来源信息</summary><dl>{inspecting.sourceDetails?.map((field, index) => <div key={index}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl></details>}
      {inspecting.provider === 'google' && inspecting.sourceEventId && inspecting.webUrl && <button className="calendar-original-link" onClick={() => { void window.focusControls?.openGoogleEvent(inspecting.sourceEventId!) }}>在 Google 日历中查看</button>}
      <button className="calendar-create-parallel" onClick={() => { const hour = new Date(now).getHours(); create(inspecting.date, inspecting.allDay ? String(hour).padStart(2, '0') + ':00' : inspecting.startTime, inspecting.allDay ? hour === 23 ? '24:00' : String(hour + 1).padStart(2, '0') + ':00' : inspecting.endTime) }}><Plus size={13} />{inspecting.allDay ? '为此事项安排时间' : '同一时段新建日程'}</button>
      <small>请在原日历中修改此安排。</small></aside>}
    {editing && <EventDialog key={editing.id} entry={editing} notice={schedulingTask ? '确认时间后保存为本机日程。原应用的待办不会被修改或标记完成。' : undefined} existing={local.some(item => item.id === editing.id)} onSave={save} onClose={() => setEditing(null)} onCreateParallel={() => create(editing.date, editing.startTime, editing.endTime)} onDelete={() => { if (onSave(local.filter(item => item.id !== editing.id))) setEditing(null) }} />}
  </section>
}
