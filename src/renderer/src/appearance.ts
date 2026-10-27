export const BACKDROP_KEY = 'dayweave.background-opacity'

export function readBackdrop(): number {
  try {
    const saved = localStorage.getItem(BACKDROP_KEY)
    const value = saved === null ? 35 : Number(saved)
    return Number.isFinite(value) ? Math.max(10, Math.min(90, value)) : 35
  } catch { return 35 }
}

export const APPEARANCE_KEY = 'dayweave.appearance.v1'
export const APPEARANCES = [
  { id: 'paper', name: '纸感留白', description: '暖白底色 · 清晰留白' },
  { id: 'graphite', name: '专注胶囊', description: '深色胶囊 · 环形计时' },
  { id: 'silver', name: '冷灰悬浮', description: '冷灰底色 · 居中倒计时' },
] as const
export type Appearance = typeof APPEARANCES[number]['id']
export function isAppearance(value: unknown): value is Appearance {
  return APPEARANCES.some(option => option.id === value)
}
export function readAppearance(): Appearance {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? 'null')
    return isAppearance(value) ? value : 'silver'
  } catch { return 'silver' }
}
