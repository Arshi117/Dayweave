import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { COLORS, toMinutes } from '../calendar'
import type { TimedEntry } from '../types'
interface Props {
  entry: TimedEntry; existing: boolean
  onSave: (entry: TimedEntry) => void
  onClose: () => void; onDelete: () => void
  onCreateParallel?: () => void
}
export function EventDialog({ entry, existing, onSave, onClose, onDelete, onCreateParallel }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState(entry)
  const [error, setError] = useState('')
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!draft.title.trim()) return setError('请填写日程名称。')
    if (!draft.date || toMinutes(draft.startTime) >= toMinutes(draft.endTime)
      || !Number.isFinite(toMinutes(draft.startTime)) || !Number.isFinite(toMinutes(draft.endTime))) {
      return setError('结束时间需要晚于开始时间。跨午夜的安排请分成两天添加。')
    }
    onSave({ ...draft, title: draft.title.trim() })
  }
  return <dialog ref={dialog} className="event-dialog" onCancel={e => { e.preventDefault(); onClose() }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
    <form onSubmit={submit}>
      <div className="dialog-heading"><h2>{existing ? '编辑日程' : '新建日程'}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="关闭编辑"><X size={19} /></button></div>
      <label>日程名称<input autoFocus required maxLength={120} placeholder="例如：上课、学习、参加讲座" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
      <label>日期<input required type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></label>
      <div className="time-fields">
        <label>开始时间<input required type="time" step="60" value={draft.startTime} onChange={e => setDraft({ ...draft, startTime: e.target.value })} /></label>
        <label>结束时间{draft.endTime === '24:00'
          ? <select value="24:00" onChange={e => setDraft({ ...draft, endTime: e.target.value })}><option value="24:00">当天结束（24:00）</option><option value="23:59">改为 23:59</option></select>
          : <input required type="time" step="60" value={draft.endTime} onChange={e => setDraft({ ...draft, endTime: e.target.value })} />}</label>
      </div>
      <fieldset className="color-picker"><legend>日程颜色</legend>{COLORS.map(color => <button type="button" key={color.id} aria-label={color.name} aria-pressed={(draft.color ?? 'blue') === color.id} className={(draft.color ?? 'blue') === color.id ? 'chosen' : ''} style={{ background: 'rgb(' + color.rgb + ')' }} onClick={() => setDraft({ ...draft, color: color.id })} />)}</fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      {existing && onCreateParallel && <button className="create-parallel-button" type="button" onClick={onCreateParallel}><Plus size={14} />在原时段新建另一条日程</button>}
      <div className="dialog-actions">{existing && <button type="button" className="delete-button" onClick={onDelete}><Trash2 size={15} />删除</button>}<button type="button" onClick={onClose}>取消</button><button className="save-button" type="submit">保存日程</button></div>
    </form>
  </dialog>
}
