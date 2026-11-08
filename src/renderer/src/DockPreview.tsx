import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { Folder, Search, Globe, Wifi, Volume2, BatteryMedium } from 'lucide-react'
import './dock-preview.css'

// Browser-only stage: the actual FocusBar is rendered over a simulated taskbar.
// No Explorer window, Windows setting or installed application is modified.
export function DockPreview({ children }: { children: ReactNode }) {
  const home = () => ({ x: 8, y: window.innerHeight - 50 })
  const [position, setPosition] = useState(home)
  const [docked, setDocked] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [calendar, setCalendar] = useState(false)
  const drag = useRef<{ id: number; x: number; y: number; anchor: { x: number; y: number } } | null>(null)
  const [clock, setClock] = useState(new Date())
  useEffect(() => { window.dispatchEvent(new CustomEvent('dayweave-preview-position', { detail: { y: position.y, docked } })) }, [position.y, docked])
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000)
    const resize = () => { if (docked) setPosition(home()); else setPosition(p => ({ x: Math.min(p.x, Math.max(8, window.innerWidth - 360)), y: Math.min(p.y, window.innerHeight - 50) })) }
    const calendarChanged = (event: Event) => setCalendar(Boolean((event as CustomEvent).detail))
    window.addEventListener('resize', resize)
    window.addEventListener('dayweave-preview-calendar', calendarChanged)
    return () => { clearInterval(timer); window.removeEventListener('resize', resize); window.removeEventListener('dayweave-preview-calendar', calendarChanged) }
  }, [docked])
  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !(event.target as Element).closest('.focus-pill')) return
    event.preventDefault(); event.stopPropagation()
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, anchor: position }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const gesture = drag.current
    if (!gesture || gesture.id !== event.pointerId) return
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y
    if (Math.hypot(dx, dy) < 4) return
    setDragging(true); setDocked(false)
    setPosition({ x: Math.max(4, Math.min(window.innerWidth - 360, gesture.anchor.x + dx)), y: Math.max(60, Math.min(window.innerHeight - 50, gesture.anchor.y + dy)) })
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.id !== event.pointerId) return
    drag.current = null; setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (position.x < 100 && position.y > window.innerHeight - 115) { setDocked(true); setPosition(home()) }
  }
  return <div className="dock-preview-stage">
    <header className="dock-preview-caption"><span>Dayweave · 任务栏停靠预览</span><p>按住小条拖动 · 点击或拉动边缘细横线展开 · 拖回左下角停靠</p></header>
    <div className="dock-preview-wallpaper" aria-hidden="true"><i /><i /><i /></div>
    <div className="dock-preview-taskbar" aria-label="模拟 Windows 任务栏">
      <div className="dock-preview-apps" aria-hidden="true"><span className="dock-preview-start"><i /><i /><i /><i /></span><Search size={21} /><Folder size={23} className="dock-preview-folder" /><Globe size={23} className="dock-preview-browser" /></div>
      <div className="dock-preview-system" aria-hidden="true"><Wifi size={15} /><Volume2 size={16} /><BatteryMedium size={18} /><span>{clock.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}<small>{clock.toLocaleDateString('zh-CN')}</small></span></div>
    </div>
    <div className={'dock-preview-widget' + (calendar ? ' has-calendar' : '')} data-docked={docked} data-dragging={dragging}
      style={{ left: calendar ? Math.min(position.x, Math.max(8, window.innerWidth - 1068)) : position.x,
        ...(docked ? { bottom: window.innerHeight - position.y - 44 } : { top: position.y }) } as CSSProperties}
      onPointerDownCapture={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
      {children}
    </div>
  </div>
}
