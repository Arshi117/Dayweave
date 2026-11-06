import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import type { ImportedTask } from '../../../shared/imports'

const groups = [
  { id: 'today', title: '今天' }, { id: 'upcoming', title: '接下来' },
  { id: 'undated', title: '未设日期' }, { id: 'overdue', title: '已过期' },
] as const
function TaskGroup({ id, title, count, children }: { id: string; title: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(() => {
    try { const saved = localStorage.getItem('dayweave.task-group.' + id); return saved === null ? id !== 'overdue' : saved === 'open' }
    catch { return id !== 'overdue' }
  })
  return <section className={'task-date-group group-' + id}>
    <button type="button" className="task-group-heading" aria-expanded={open} onClick={() => {
      const next = !open; setOpen(next)
      try { localStorage.setItem('dayweave.task-group.' + id, next ? 'open' : 'closed') } catch { /* The current view still updates. */ }
    }}><ChevronDown size={11} /><span>{title}</span><small>{count}</small></button>
    {open && <div className="task-group-items">{children}</div>}
  </section>
}
export function TaskGroups({ tasks, today, render }: { tasks: ImportedTask[]; today: string; render: (task: ImportedTask) => ReactNode }) {
  return <>{groups.map(group => {
    const items = tasks.filter(task => group.id === 'undated' ? !task.dueDate : group.id === 'today' ? task.dueDate === today : group.id === 'overdue' ? Boolean(task.dueDate && task.dueDate < today) : Boolean(task.dueDate && task.dueDate > today))
    return items.length > 0 && <TaskGroup key={group.id} {...group} count={items.length}>{items.map(render)}</TaskGroup>
  })}</>
}
