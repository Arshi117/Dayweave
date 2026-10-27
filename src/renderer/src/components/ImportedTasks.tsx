import { useMemo, useState } from 'react'
import { CalendarPlus, ChevronDown, ListTodo } from 'lucide-react'
import type { ImportedTask } from '../../../shared/imports'
import { taskProviderName } from '../../../shared/imports'
import type { TaskCompletion } from '../task-completion'

interface Props { tasks: ImportedTask[]; completed: TaskCompletion; today: string; onCompletion: (id: string, done: boolean) => void; onSchedule: (task: ImportedTask) => void; onExpandedChange?: (expanded: boolean) => void }
export function ImportedTasks({ tasks, completed, today, onCompletion, onSchedule, onExpandedChange }: Props) {
  const [filter, setFilter] = useState('all')
  const [showCompleted, setShowCompleted] = useState(false)
  const pendingCount = tasks.filter(task => !completed[task.id]).length
  const completedCount = tasks.length - pendingCount
  const visible = useMemo(() => tasks.filter(task => Boolean(completed[task.id]) === showCompleted && (filter === 'all' || task.provider === filter))
    .sort((a, b) => showCompleted ? completed[b.id] - completed[a.id] : (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.title.localeCompare(b.title)), [tasks, filter, completed, showCompleted])
  if (!tasks.length) return null
  return <details className="imported-tasks" open onToggle={event => onExpandedChange?.(event.currentTarget.open)}>
    <summary><ListTodo size={13} />待办事项 <span>{pendingCount}</span><small>勾选完成仅保存在 Dayweave</small><ChevronDown size={13} className="imported-tasks-chevron" /></summary>
    <div className="imported-tasks-toolbar"><button className="task-completion-view" type="button" aria-pressed={showCompleted} onClick={() => setShowCompleted(value => !value)}>{showCompleted ? '返回待办（' + pendingCount + '）' : '已完成（' + completedCount + '）'}</button><select aria-label="筛选待办来源" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">全部来源</option><option value="ticktick">TickTick</option><option value="microsoft-todo">Microsoft To Do</option><option value="ical">日历订阅</option></select></div>
    <div className="imported-task-list">{visible.map(task => <article key={task.id} className={showCompleted ? 'is-completed' : task.dueDate && task.dueDate < today ? 'is-overdue' : ''}>
      <input className="task-completion-checkbox" type="checkbox" checked={showCompleted} aria-label={(showCompleted ? '恢复待办：' : '完成待办：') + task.title} title={showCompleted ? '取消勾选，恢复到待办' : '仅在 Dayweave 标记完成，不会更改原应用'} onChange={event => onCompletion(task.id, event.target.checked)} />
      <div><strong title={task.title}>{task.title}</strong><span>{taskProviderName(task)}{task.provider !== 'ical' ? ' · ' + task.listName : ''} · {task.dueDate ? task.dueDate + (task.dueAt ? ' ' + new Date(task.dueAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '') + (task.dueDate < today ? ' 已过截止日期' : ' 截止') : '未设置截止日期'}</span>{task.description && <p>{task.description}</p>}</div>
      {!showCompleted && <button title={'为“' + task.title + '”安排时间'} onClick={() => onSchedule(task)}><CalendarPlus size={12} />安排时间</button>}
    </article>)}{!visible.length && <p className="imported-tasks-empty">{showCompleted ? '暂无已完成的待办。' : '暂无待办事项。'}</p>}</div>
  </details>
}
