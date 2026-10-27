export const TASK_COMPLETION_KEY = 'dayweave.tasks.completed.v1'
export type TaskCompletion = Record<string, number>

export function readTaskCompletion(): TaskCompletion {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(TASK_COMPLETION_KEY) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([, stamp]) => typeof stamp === 'number' && Number.isFinite(stamp) && stamp > 0))
  } catch { return {} }
}
