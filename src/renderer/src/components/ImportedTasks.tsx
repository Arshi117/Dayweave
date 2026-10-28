import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarPlus, ChevronDown, GripVertical, ListTodo } from 'lucide-react'
import type { ImportedTask } from '../../../shared/imports'
import { taskProviderName } from '../../../shared/imports'
import type { TaskCompletion } from '../task-completion'
import { startTaskDrag } from '../task-drag'

const categories = [
  { id: 'all', label: '全部', empty: '暂无待办事项。' },
  { id: 'today', label: '今天', empty: '今天没有待办事项。' },
  { id: 'upcoming', label: '接下来', empty: '接下来没有待办事项。' },
  { id: 'undated', label: '未设日期', empty: '没有未设日期的待办。' },
  { id: 'overdue', label: '已过期', empty: '没有已过期的待办。' },
  { id: 'completed', label: '已完成', empty: '暂无已完成的待办。' },
] as const
type Category = typeof categories[number]['id']
function matchesCategory(task: ImportedTask, category: Category, completed: TaskCompletion, today: string) {
  if (category === 'completed') return Boolean(completed[task.id])
  if (completed[task.id]) return false
  if (category === 'all') return true
  if (category === 'undated') return !task.dueDate
  if (category === 'today') return task.dueDate === today
  return Boolean(task.dueDate && (category === 'upcoming' ? task.dueDate > today : task.dueDate < today))
}
function dateOrder(task: ImportedTask, today: string) {
  return task.dueDate === today ? 0 : !task.dueDate ? 2 : task.dueDate > today ? 1 : 3
}
interface Props { tasks: ImportedTask[]; completed: TaskCompletion; today: string; onCompletion: (id: string, done: boolean) => void; onSchedule: (task: ImportedTask) => void; onExpandedChange?: (expanded: boolean) => void }
export function ImportedTasks({ tasks, completed, today, onCompletion, onSchedule, onExpandedChange }: Props) {
  const [filter, setFilter] = useState('all')
  const [category, setCategory] = useState<Category>('all')
  const list = useRef<HTMLDivElement>(null)
  const showCompleted = category === 'completed'
  const pendingCount = tasks.filter(task => !completed[task.id]).length
  const sourceTasks = useMemo(() => tasks.filter(task => filter === 'all' || task.provider === filter), [tasks, filter])
  const counts = useMemo(() => Object.fromEntries(categories.map(item => [item.id, sourceTasks.filter(task => matchesCategory(task, item.id, completed, today)).length])), [sourceTasks, completed, today])
  const visible = useMemo(() => sourceTasks.filter(task => matchesCategory(task, category, completed, today))
    .sort((a, b) => showCompleted ? completed[b.id] - completed[a.id] : dateOrder(a, today) - dateOrder(b, today) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || (a.dueAt || 0) - (b.dueAt || 0) || a.title.localeCompare(b.title)), [sourceTasks, category, completed, today, showCompleted])
  useEffect(() => { if (list.current) list.current.scrollTop = 0 }, [category, filter])
  if (!tasks.length) return null
  const renderTask = (task: ImportedTask) => <article key={task.id} className={showCompleted ? 'is-completed' : task.dueDate && task.dueDate < today ? 'is-overdue' : ''}>
    <input className="task-completion-checkbox" type="checkbox" checked={showCompleted} aria-label={(showCompleted ? '恢复待办：' : '完成待办：') + task.title} title={showCompleted ? '取消勾选，恢复到待办' : '仅在 Dayweave 标记完成，不会更改原应用'} onChange={event => onCompletion(task.id, event.target.checked)} />
    <div><div className="task-drag-title" draggable={!showCompleted} title={showCompleted ? task.title : '拖入日历安排时间：' + task.title} onDragStart={event => { if (!showCompleted) startTaskDrag(event.dataTransfer, task.id) }}>
      {!showCompleted && <GripVertical size={12} aria-hidden="true" />}<strong>{task.title}</strong></div>
      <span>{taskProviderName(task)}{task.provider !== 'ical' ? ' · ' + task.listName : ''} · {task.dueDate ? task.dueDate + (task.dueAt ? ' ' + new Date(task.dueAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '') + (task.dueDate < today ? ' 已过截止日期' : ' 截止') : '未设置截止日期'}</span>{task.description && <p>{task.description}</p>}</div>
    {!showCompleted && <button title={'为“' + task.title + '”安排时间'} onClick={() => onSchedule(task)}><CalendarPlus size={12} />安排时间</button>}
  </article>
  return <details className="imported-tasks" open onToggle={event => onExpandedChange?.(event.currentTarget.open)}>
    <summary><ListTodo size={13} />待办事项 <span>{pendingCount}</span><small>勾选完成仅保存在 Dayweave</small><ChevronDown size={13} className="imported-tasks-chevron" /></summary>
    <div className="imported-tasks-toolbar"><div className="task-filter-chips" role="group" aria-label="筛选待办状态">{categories.map(item => <button key={item.id} type="button" className="task-filter-chip" data-filter={item.id} aria-pressed={category === item.id} title={item.id === 'all' ? '全部未完成事项' : item.label} onClick={() => setCategory(item.id)}>{item.label}<small>{counts[item.id]}</small></button>)}</div><select aria-label="筛选待办来源" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">全部来源</option><option value="ticktick">TickTick</option><option value="microsoft-todo">Microsoft To Do</option><option value="ical">日历订阅</option></select></div>
    <div ref={list} className="imported-task-list">{visible.map(renderTask)}{!visible.length && <p className="imported-tasks-empty">{categories.find(item => item.id === category)?.empty}</p>}</div>
  </details>
}
