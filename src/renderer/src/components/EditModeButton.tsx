import { Pin, Pencil } from 'lucide-react'

interface Props {
  editing?: boolean
  busy?: boolean
  onClick: () => void
}

export function EditModeButton({ editing = false, busy = false, onClick }: Props) {
  const label = editing ? '固定桌面' : '更改日历'
  return <button type="button" className={'edit-mode-button' + (editing ? ' is-editing' : '')}
    disabled={busy} aria-busy={busy} aria-label={label} title={label} onClick={onClick}>
    {editing ? <Pin size={16} aria-hidden="true" /> : <Pencil size={16} aria-hidden="true" />}
  </button>
}
