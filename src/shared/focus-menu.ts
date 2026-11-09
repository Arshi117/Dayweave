export interface FocusMenuStatus { title: string; timer: string }

export function focusMenuLabel(status: FocusMenuStatus): string {
  const segments = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(status.title), part => part.segment)
  const title = segments.length > 12 ? segments.slice(0, 12).join('') + '…' : status.title
  return [title, status.timer].filter(Boolean).join(' · ')
}

export function readFocusMenuStatus(value: unknown): FocusMenuStatus | null {
  if (!value || typeof value !== 'object') return null
  const { title, timer } = value as Record<string, unknown>
  if (typeof title !== 'string' || title.length > 500 || typeof timer !== 'string' || timer !== '' && !/^\d{1,4}:\d{2}(?::\d{2})?$/.test(timer)) return null
  return { title: title.replace(/[\r\n\t]/g, ' ').trim(), timer }
}
