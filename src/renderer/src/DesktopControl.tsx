import { useEffect, useState, type CSSProperties } from 'react'
import { EditModeButton } from './components/EditModeButton'
import { BACKDROP_KEY, readBackdrop } from './appearance'

/** This desktop-owned tool window receives clicks; the calendar stays click-through. */
export function DesktopControl() {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [backdrop, setBackdrop] = useState(readBackdrop)
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === BACKDROP_KEY || event.key === null) setBackdrop(readBackdrop()) }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  async function edit() {
    if (busy || !window.desktopControls) return
    setBusy(true)
    setFailed(false)
    try { await window.desktopControls.editCalendar() }
    catch { setFailed(true) }
    finally { setBusy(false) }
  }
  return <div className="desktop-control" style={{ '--panel-opacity': backdrop / 100 } as CSSProperties} title={failed ? '暂时无法打开，请使用右下角 Dayweave 图标。' : '更改日历'}>
    <EditModeButton busy={busy} onClick={() => { void edit() }} />
  </div>
}
