export type EntryKind = 'block' | 'deadline'
export type EventColor = 'blue' | 'mint' | 'violet' | 'amber' | 'rose'
export interface PlannerEntry {
  id: string
  title: string
  date: string
  kind: EntryKind
  startTime?: string
  endTime?: string
  completed: boolean
  color?: EventColor
}
export interface TimedEntry extends PlannerEntry {
  kind: 'block'
  startTime: string
  endTime: string
}
export interface DesktopState {
  mode: 'desktop' | 'editing' | 'hidden'
  surface: 'editor' | 'wallpaper' | 'control'
  shortcutAvailable: boolean
  wallpaperStatus: 'starting' | 'attached' | 'unavailable'
  wallpaperError: string
}
declare global {
  interface Window {
    desktopControls?: {
      minimize: () => void
      close: () => void
      editCalendar: () => Promise<void>
      reportEditorBusy: (busy: boolean) => void
      onPrepare: (listener: () => void | Promise<void>) => () => void
      pinToDesktop: () => Promise<DesktopState>
      retryDesktop: () => Promise<DesktopState>
      getState: () => Promise<DesktopState>
      onState: (listener: (state: DesktopState) => void) => () => void
    }
  }
}
