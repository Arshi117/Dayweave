import { useState } from 'react'
import { normalizedSourceName } from '../../../shared/import-links'

export function SourceNameEditor({ name, busy, onSave }: { name: string; busy: boolean; onSave: (name: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false), [value, setValue] = useState(name)
  return editing ? <form className="source-name-editor" onSubmit={event => {
    event.preventDefault()
    const next = normalizedSourceName(value)
    if (next && !busy) void onSave(next).then(saved => { if (saved) setEditing(false) })
  }}>
    <label>来源名称<input value={value} maxLength={200} autoFocus disabled={busy} onChange={event => setValue(event.target.value)} /></label>
    <div className="google-connection-actions"><button type="submit" disabled={busy || !normalizedSourceName(value)}>{busy ? '保存中…' : '保存名称'}</button><button type="button" disabled={busy} onClick={() => setEditing(false)}>取消重命名</button></div>
  </form> : <div className="google-connection-actions"><button disabled={busy} onClick={() => { setValue(name); setEditing(true) }}>重命名</button></div>
}
