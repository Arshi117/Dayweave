export interface FocusMenuStatus { title: string; timer: string }

export function readFocusMenuStatus(value: unknown): FocusMenuStatus | null {
  if (!value || typeof value !== 'object') return null
  const { title, timer } = value as Record<string, unknown>
  if (typeof title !== 'string' || title.length > 500 || typeof timer !== 'string' || timer !== '' && !/^\d{1,4}:\d{2}(?::\d{2})?$/.test(timer)) return null
  return { title: title.replace(/[\r\n\t]/g, ' ').trim(), timer }
}
