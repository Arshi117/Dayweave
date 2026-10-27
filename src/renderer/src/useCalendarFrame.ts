import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { changeFrame, defaultFrame, fitFrame, type CalendarFrame, type FrameHandle } from './calendar-frame'

const FRAME_KEY = 'dayweave.calendar-frame.v1'
const viewport = () => ({ width: window.innerWidth, height: window.innerHeight })
function readFrame(): CalendarFrame {
  try {
    const frame = JSON.parse(localStorage.getItem(FRAME_KEY) ?? 'null')
    if (frame && ['x', 'y', 'width', 'height'].every(key => typeof frame[key] === 'number' && Number.isFinite(frame[key]))) return fitFrame(frame, viewport())
  } catch { /* Recover from unavailable or invalid saved settings. */ }
  return defaultFrame(viewport())
}
export function useCalendarFrame(enabled: boolean) {
  const [frame, setFrame] = useState(readFrame)
  const [adjusting, setAdjusting] = useState(false)
  const [layoutError, setLayoutError] = useState('')
  const current = useRef(frame)
  const gesture = useRef<{ id: number; x: number; y: number; handle: FrameHandle; frame: CalendarFrame } | null>(null)
  function update(next: CalendarFrame) { current.current = next; setFrame(next) }
  function save() {
    try { localStorage.setItem(FRAME_KEY, JSON.stringify(current.current)); setLayoutError('') }
    catch { setLayoutError('日历的位置和大小还没保存，请重试。') }
  }
  useEffect(() => {
    const reload = () => { if (!gesture.current) update(readFrame()) }
    const sync = (event: StorageEvent) => { if (event.key === FRAME_KEY || event.key === null) reload() }
    const resize = () => {
      gesture.current = null
      setAdjusting(false)
      update(fitFrame(current.current, viewport()))
    }
    window.addEventListener('storage', sync)
    window.addEventListener('dayweave:prepare-view', reload)
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('dayweave:prepare-view', reload)
      window.removeEventListener('resize', resize)
    }
  }, [])
  function begin(event: PointerEvent<HTMLElement>, handle: FrameHandle) {
    if (!enabled || event.button !== 0 || gesture.current) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, handle, frame: current.current }
    setAdjusting(true)
  }
  function move(event: PointerEvent<HTMLElement>) {
    const start = gesture.current
    if (!start || start.id !== event.pointerId) return
    update(changeFrame(start.frame, start.handle, event.clientX - start.x, event.clientY - start.y, viewport()))
  }
  function finish(event: PointerEvent<HTMLElement>) {
    if (gesture.current?.id !== event.pointerId) return
    gesture.current = null
    setAdjusting(false)
    save()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const handlers = { onPointerMove: move, onPointerUp: finish, onPointerCancel: finish, onLostPointerCapture: finish }
  return { frame, adjusting, layoutError, save, begin, handlers }
}
