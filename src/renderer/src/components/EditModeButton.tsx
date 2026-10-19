import { Pin, Pencil } from 'lucide-react'

interface Props {
  editing?: boolean
  busy?: boolean
  onClick: () => void
}

export function EditModeButton({ editing = false, busy = false, onClick }: Props) {
  return <button type="button" className={'edit-mode-button' + (editing ? ' is-editing' : '')}
    disabled={busy} aria-busy={busy} onClick={onClick}>
    {editing ? <Pin size={14} aria-hidden="true" /> : <Pencil size={14} aria-hidden="true" />}
    <span>{editing ? '固定桌面' : '编辑日程'}</span>
  </button>
}
