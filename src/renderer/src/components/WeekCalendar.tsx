import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { colorRgb, dateKey, DAY_MINUTES, HOUR_HEIGHT, layoutDay, snapMinutes, timeLabel, toMinutes } from '../calendar'
import type { TimedEntry } from '../types'
interface Props {
  days: Date[]; entries: TimedEntry[]; now: Date
  readOnly?: boolean
  onCreate: (date: string, start: string, end: string) => void
  onEdit: (entry: TimedEntry) => void
  onChange: (entry: TimedEntry) => void
}
interface Gesture {
  type: 'create' | 'move' | 'resize'
  pointerId: number; originX: number; originY: number; originMinute: number
  day: number; start: number; end: number; moved: boolean; entry?: TimedEntry
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const SCROLL_KEY = 'dayweave.view-scroll'
export function WeekCalendar({ days, entries, now, readOnly = false, onCreate, onEdit, onChange }: Props) {
  const scroll = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const today = dateKey(now)
  useEffect(() => {
    function restore() {
      let top = HOUR_HEIGHT * 7
      try {
        const saved = localStorage.getItem(SCROLL_KEY)
        if (saved !== null && Number.isFinite(Number(saved))) top = Math.max(0, Number(saved))
      } catch { /* Start at 07:00 if storage is unavailable. */ }
      if (scroll.current) scroll.current.scrollTop = top
    }
    restore()
    function sync(event: StorageEvent) { if (event.key === SCROLL_KEY || event.key === null) restore() }
    window.addEventListener('storage', sync)
    window.addEventListener('dayweave:prepare-view', restore)
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('dayweave:prepare-view', restore) }
  }, [])
  function saveScroll() {
    if (readOnly || !scroll.current) return
    try { localStorage.setItem(SCROLL_KEY, String(scroll.current.scrollTop)) } catch { /* Scrolling remains usable. */ }
  }
  function begin(event: PointerEvent, day: number, type: Gesture['type'], entry?: TimedEntry) {
    if (readOnly || event.button !== 0 || gestureRef.current || !content.current) return
    event.preventDefault()
    event.stopPropagation()
    const rect = content.current.getBoundingClientRect()
    const minute = clamp(Math.floor((event.clientY - rect.top) / HOUR_HEIGHT * 60 / 15) * 15, 0, DAY_MINUTES - 15)
    const start = entry ? toMinutes(entry.startTime) : minute
    const end = entry ? toMinutes(entry.endTime) : Math.min(start + 60, DAY_MINUTES)
    const next: Gesture = { type, pointerId: event.pointerId, originX: event.clientX, originY: event.clientY, originMinute: minute, day, start, end, entry, moved: false }
    gestureRef.current = next
    setGesture(next)
    content.current.setPointerCapture(event.pointerId)
  }
  function move(event: PointerEvent) {
    const current = gestureRef.current
    if (!current || current.pointerId !== event.pointerId || !content.current) return
    const rect = content.current.getBoundingClientRect()
    const moved = current.moved || Math.hypot(event.clientX - current.originX, event.clientY - current.originY) > 5
    if (!moved) return
    let { start, end, day } = current
    if (current.type === 'create') {
      const minute = clamp(snapMinutes((event.clientY - rect.top) / HOUR_HEIGHT * 60), 0, DAY_MINUTES)
      start = Math.min(current.originMinute, minute)
      end = Math.max(start + 15, current.originMinute, minute)
    } else if (current.entry) {
      const delta = snapMinutes((event.clientY - current.originY) / HOUR_HEIGHT * 60)
      const originalStart = toMinutes(current.entry.startTime), originalEnd = toMinutes(current.entry.endTime)
      if (current.type === 'move') {
        const duration = originalEnd - originalStart
        start = clamp(originalStart + delta, 0, DAY_MINUTES - duration)
        end = start + duration
        day = clamp(Math.floor((event.clientX - rect.left - 64) / ((rect.width - 64) / 7)), 0, 6)
      } else end = clamp(originalEnd + delta, originalStart + 15, DAY_MINUTES)
    }
    const next = { ...current, start, end, day, moved }
    gestureRef.current = next
    setGesture(next)
  }
  function finish(event: PointerEvent) {
    const current = gestureRef.current
    if (!current || current.pointerId !== event.pointerId) return
    gestureRef.current = null
    setGesture(null)
    if (content.current?.hasPointerCapture(event.pointerId)) content.current.releasePointerCapture(event.pointerId)
    if (current.type === 'create') onCreate(dateKey(days[current.day]), timeLabel(current.start), timeLabel(current.end))
    else if (current.entry && current.moved) onChange({ ...current.entry, date: dateKey(days[current.day]), startTime: timeLabel(current.start), endTime: timeLabel(current.end) })
    else if (current.entry) onEdit(current.entry)
  }
  function cancel() { gestureRef.current = null; setGesture(null) }
  return <section className="week-calendar" aria-label="每周时间安排">
    <div className="week-headings">
      <div className="time-zone">本地时间</div>
      {days.map(day => <div className={'day-heading' + (dateKey(day) === today ? ' today' : '')} key={dateKey(day)}>
        <span>{new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(day)}</span><strong>{day.getDate()}</strong>
      </div>)}
    </div>
    <div className="calendar-scroll" ref={scroll} onScroll={saveScroll}>
      <div ref={content} className="week-content" style={{ height: HOUR_HEIGHT * 24, '--hour-height': HOUR_HEIGHT + 'px' } as CSSProperties} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}>
        <div className="time-axis">{Array.from({ length: 24 }, (_, hour) => <div className="hour-label" key={hour} style={{ top: hour * HOUR_HEIGHT }}>{String(hour).padStart(2, '0')}:00</div>)}</div>
        {days.map((day, index) => {
          const key = dateKey(day)
          const events = layoutDay(entries.filter(entry => entry.date === key))
          const currentMinute = now.getHours() * 60 + now.getMinutes()
          return <div key={key} className="day-column" aria-label={key + '的时间安排'} onPointerDown={event => begin(event, index, 'create')}>
            {events.map(({ entry, lane, laneCount }) => <button key={entry.id} className={'calendar-event' + (gesture?.entry?.id === entry.id && gesture.moved ? ' being-dragged' : '')} style={{
              top: toMinutes(entry.startTime) / 60 * HOUR_HEIGHT,
              height: (toMinutes(entry.endTime) - toMinutes(entry.startTime)) / 60 * HOUR_HEIGHT,
              left: 'calc(' + (lane / laneCount * 100) + '% + 3px)',
              width: 'calc(' + (100 / laneCount) + '% - 6px)',
              '--event-rgb': colorRgb(entry.color),
            } as CSSProperties} tabIndex={readOnly ? -1 : 0} title={entry.title + '\n' + entry.startTime + ' – ' + entry.endTime} onPointerDown={event => begin(event, index, 'move', entry)} onClick={event => { if (!readOnly && event.detail === 0) onEdit(entry) }}>
              <strong>{entry.title}</strong><span>{entry.startTime} – {entry.endTime}</span>
              <span className="event-resize" title="拖动调整结束时间" onPointerDown={event => begin(event, index, 'resize', entry)} />
            </button>)}
            {key === today && <div className="now-line" style={{ top: currentMinute / 60 * HOUR_HEIGHT }}><span /></div>}
            {gesture?.day === index && <div className="selection-block" style={{ top: gesture.start / 60 * HOUR_HEIGHT, height: (gesture.end - gesture.start) / 60 * HOUR_HEIGHT }}>
              <strong>{gesture.entry?.title ?? '新日程'}</strong><span>{timeLabel(gesture.start)} – {timeLabel(gesture.end)}</span>
            </div>}
          </div>
        })}
      </div>
    </div>
  </section>
}
