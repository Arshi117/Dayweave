import { useState } from 'react'
import { X } from 'lucide-react'
export type HintKind = 'move' | 'pull' | 'split' | 'completion'
const KEY = 'dayweave.hints.seen.v1'
export function useFirstUseHints() {
  const [seen, setSeen] = useState<Partial<Record<HintKind, boolean>>>(() => {
    try { const value = JSON.parse(localStorage.getItem(KEY) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {} } catch { return {} }
  })
  function dismiss(kind: HintKind) {
    setSeen(current => {
      if (current[kind]) return current
      const next = { ...current, [kind]: true }
      try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* Hints can still be dismissed for this session. */ }
      return next
    })
  }
  return { seen, dismiss }
}
const messages: Record<HintKind, string> = {
  move: '按住长条任意位置，就能拖动它。',
  pull: '拉动细横线，或点击它，查看安排详情。',
  split: '上下拖动待办与日历之间的横线，调整两部分大小。',
  completion: '已在本机标记完成，可在日历的「更多 → 已完成」中恢复。原应用不会更改。',
}
export function FirstUseHint({ kind, onDismiss }: { kind: HintKind; onDismiss: () => void }) {
  return <aside className={'first-use-hint hint-' + kind} aria-label="使用提示"><span>{messages[kind]}</span><button type="button" aria-label="知道了，不再显示此提示" onClick={onDismiss}><X size={12} /></button></aside>
}
