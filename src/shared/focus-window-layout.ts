export const FOCUS_WIDTH = 300
export const FOCUS_COMPACT_HEIGHT = 44
export const FOCUS_CALENDAR_WIDTH = 1068
export const FOCUS_GAP = 8
export const FOCUS_PADDING = 12
export interface FocusDimensions { stripWidth: number; calendarWidth: number; calendarHeight: number }
export type ResizeTarget = 'strip' | 'calendar'
export type ResizeEdge = 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export const DEFAULT_FOCUS_DIMENSIONS: FocusDimensions = { stripWidth: FOCUS_WIDTH, calendarWidth: FOCUS_CALENDAR_WIDTH - FOCUS_WIDTH - FOCUS_GAP, calendarHeight: 620 }
export interface FocusPlacement { above: boolean; left: boolean; availableHeight: number; availableWidth?: number; dimensions?: FocusDimensions }
export interface FocusAnchor { x: number; y: number }
interface Area { x: number; y: number; width: number; height: number }
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))
export function focusDimensions(value: Partial<FocusDimensions> = {}): FocusDimensions {
  const size = (key: keyof FocusDimensions, low: number, high: number) => {
    const saved = value[key]
    return typeof saved === 'number' && Number.isFinite(saved) ? Math.round(clamp(saved, low, high)) : DEFAULT_FOCUS_DIMENSIONS[key]
  }
  return { stripWidth: size('stripWidth', 180, 600), calendarWidth: size('calendarWidth', 400, 1400), calendarHeight: size('calendarHeight', 420, 1000) }
}

// Anchor the small task strip while its details open above or below it.
export function focusWindowLayout(anchor: FocusAnchor, requestedHeight: number, area: Area, requestedWidth = FOCUS_WIDTH, compactWidth = FOCUS_WIDTH, preferredLeft?: boolean, preferredAbove?: boolean) {
  compactWidth = Math.min(compactWidth, area.width)
  const width = Math.min(Math.max(compactWidth, requestedWidth), area.width)
  const height = clamp(Math.ceil(requestedHeight), Math.min(FOCUS_COMPACT_HEIGHT, area.height), area.height)
  const compactX = clamp(anchor.x, area.x, area.x + area.width - compactWidth)
  const left = width > compactWidth && (preferredLeft ?? compactX + width > area.x + area.width)
  const x = clamp(left ? compactX - (width - compactWidth) : compactX, area.x, area.x + area.width - width)
  const compactY = clamp(anchor.y, area.y, area.y + area.height - Math.min(FOCUS_COMPACT_HEIGHT, height))
  const above = preferredAbove ?? (compactY + height > area.y + area.height && compactY - (height - FOCUS_COMPACT_HEIGHT) >= area.y)
  const y = above ? compactY - (height - FOCUS_COMPACT_HEIGHT) : clamp(compactY, area.y, area.y + area.height - height)
  return { bounds: { x: Math.round(x), y: Math.round(y), width, height }, above, left,
    anchor: { x: Math.round(left ? x + width - compactWidth : x), y: Math.round(above ? y + height - FOCUS_COMPACT_HEIGHT : y) } }
}
