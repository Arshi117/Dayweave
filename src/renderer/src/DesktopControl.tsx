import { useState } from 'react'
import { EditModeButton } from './components/EditModeButton'

/** This desktop-owned tool window receives clicks; the calendar stays click-through. */
export function DesktopControl() {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  async function edit() {
    if (busy || !window.desktopControls) return
    setBusy(true)
    setFailed(false)
    try { await window.desktopControls.editCalendar() }
    catch { setFailed(true) }
    finally { setBusy(false) }
  }
  return <div className="desktop-control" title={failed ? '暂时无法打开，请使用右下角 Dayweave 图标。' : '编辑日程'}>
    <EditModeButton busy={busy} onClick={() => { void edit() }} />
  </div>
}
