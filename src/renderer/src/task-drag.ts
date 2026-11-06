export const TASK_DRAG_TYPE = 'application/x-dayweave-task'
export function startTaskDrag(data: DataTransfer, id: string) {
  data.effectAllowed = 'copy'
  data.setData(TASK_DRAG_TYPE, id)
}
