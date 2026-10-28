import { useEffect, useRef, useState, type ComponentProps, type PointerEvent, type ReactNode } from 'react'
import { ImportedTasks } from './ImportedTasks'
import '../calendar-task-split.css'

const STORAGE_KEY = 'dayweave.calendar-task-ratio.v1'
const DEFAULT_RATIO = 0.32
const HANDLE_HEIGHT = 10
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function readRatio() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    const value = stored === null ? DEFAULT_RATIO : Number(stored)
    return Number.isFinite(value) && value > 0 && value < 1 ? value : DEFAULT_RATIO
  } catch { return DEFAULT_RATIO }
}

export function CalendarTaskSplit({ taskProps, children, onAdjust }: { taskProps: ComponentProps<typeof ImportedTasks>; children: ReactNode; onAdjust?: () => void }) {
  const container = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ pointerId: number; y: number; height: number } | null>(null)
  const [ratio, setRatio] = useState(readRatio)
  const currentRatio = useRef(ratio)
  const [height, setHeight] = useState(0)
  const [expanded, setExpanded] = useState(true)
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(() => setHeight(element.clientHeight))
    observer.observe(element)
    setHeight(element.clientHeight)
    return () => observer.disconnect()
  }, [])
  const available = Math.max(0, height - HANDLE_HEIGHT)
  // Keep both panes usable, adapting the limits when the whole drawer is short.
  const minimum = Math.min(88, available * 0.35)
  const maximum = Math.max(minimum, available - Math.min(190, available * 0.6))
  const taskHeight = clamp(available * ratio, minimum, maximum)
  const percent = available > 0 ? Math.round(taskHeight / available * 100) : Math.round(ratio * 100)
  function update(nextHeight: number, persist = false) {
    if (!available) return
    const next = clamp(nextHeight, minimum, maximum) / available
    currentRatio.current = next
    setRatio(next)
    if (persist) save(next)
  }
  function save(value = currentRatio.current) {
    try { localStorage.setItem(STORAGE_KEY, String(value)) } catch { /* Resizing still works without local storage. */ }
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (gesture.current?.pointerId !== event.pointerId) return
    gesture.current = null
    setDragging(false)
    save()
    onAdjust?.()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return <div ref={container} className={'calendar-task-split' + (expanded ? '' : ' tasks-collapsed') + (dragging ? ' is-resizing' : '')}>
    <div className="calendar-task-pane" style={expanded ? { height: taskHeight } : undefined}>
      <ImportedTasks {...taskProps} onExpandedChange={setExpanded} />
    </div>
    {expanded && <div className="calendar-task-separator" role="separator" aria-label="调整待办与日历占比" aria-orientation="horizontal" tabIndex={0}
      aria-valuemin={available ? Math.round(minimum / available * 100) : 0} aria-valuemax={available ? Math.round(maximum / available * 100) : 100} aria-valuenow={percent} aria-valuetext={'待办占 ' + percent + '%'}
      title="上下拖动调整待办与日历占比；双击恢复默认"
      onPointerDown={event => {
        if (event.button !== 0) return
        event.preventDefault(); event.stopPropagation()
        gesture.current = { pointerId: event.pointerId, y: event.clientY, height: taskHeight }
        setDragging(true)
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={event => {
        const current = gesture.current
        if (current?.pointerId === event.pointerId) update(current.height + event.clientY - current.y)
      }}
      onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
      onDoubleClick={() => { currentRatio.current = DEFAULT_RATIO; setRatio(DEFAULT_RATIO); save(DEFAULT_RATIO); onAdjust?.() }}
      onKeyDown={event => {
        const step = event.shiftKey ? 40 : 10
        const next = event.key === 'ArrowUp' ? taskHeight - step : event.key === 'ArrowDown' ? taskHeight + step : event.key === 'Home' ? minimum : event.key === 'End' ? maximum : null
        if (next === null) return
        event.preventDefault(); event.stopPropagation(); update(next, true); onAdjust?.()
      }}><span /></div>}
    {children}
  </div>
}
