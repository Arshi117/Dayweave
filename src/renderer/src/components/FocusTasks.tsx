import type { ImportedTask } from '../../../shared/imports'
import { taskProviderName } from '../../../shared/imports'

export function taskDeadline(task: ImportedTask, today: string) {
  if (!task.dueDate) return '未设截止日期'
  const date = task.dueDate === today ? '今天' : task.dueDate
  const clock = task.dueAt && Number.isFinite(task.dueAt) ? ' ' + new Date(task.dueAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''
  return date + clock + (task.dueDate < today ? ' · 已过截止日期' : ' 截止')
}
export function FocusTasks({ tasks, selectedId, today, onSelect, onComplete }: {
  tasks: ImportedTask[]; selectedId?: string; today: string; onSelect: (id: string) => void; onComplete: (id: string) => void
}) {
  if (!tasks.length) return null
  return <div className="focus-task-picker" aria-label="选择显示的待办">
    <div className="focus-task-picker-heading"><span>具体待办</span><small>勾选完成 · 点击名称切换</small></div>
    <div className="focus-task-list">{tasks.map(task => <div className="focus-task-row" key={task.id}>
      <input className="task-completion-checkbox" type="checkbox" checked={false} aria-label={'完成待办：' + task.title} title="仅在 Dayweave 标记完成" onChange={() => onComplete(task.id)} />
      <button aria-pressed={task.id === selectedId} title={task.title + '\n' + taskDeadline(task, today)} onClick={() => onSelect(task.id)}>
        <span className="focus-task-item"><strong>{task.title}</strong><small>{taskProviderName(task)} · {taskDeadline(task, today)}</small></span>
      </button>
    </div>)}</div>
  </div>
}
