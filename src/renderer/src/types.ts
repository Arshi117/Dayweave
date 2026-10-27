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
  readOnly?: boolean
  sourceTitle?: string
  allDay?: boolean
  sourceDetails?: { label: string; value: string }[]
  description?: string
  location?: string
  calendarName?: string
  sourceEventId?: string
  webUrl?: string
  provider?: import('../../shared/focus').FocusEvent['provider']
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
      showFocus: () => void
      editCalendar: () => Promise<void>
      reportEditorBusy: (busy: boolean) => void
      reportCalendarFrame: (frame: { x: number; y: number; width: number; height: number }) => void
      onPrepare: (listener: () => void | Promise<void>) => () => void
      pinToDesktop: () => Promise<DesktopState>
      retryDesktop: () => Promise<DesktopState>
      getState: () => Promise<DesktopState>
      onState: (listener: (state: DesktopState) => void) => () => void
    }
  }
}
declare global {
  interface Window {
    focusControls?: {
      hide: () => void
      resize: (height: number, calendar?: boolean, expanded?: boolean) => void
      beginDimensionResize: (target: import('../../shared/focus-window-layout').ResizeTarget, edge: import('../../shared/focus-window-layout').ResizeEdge) => void
      moveDimensionResize: () => void
      endDimensionResize: () => void
      stepDimensionResize: (target: import('../../shared/focus-window-layout').ResizeTarget, edge: import('../../shared/focus-window-layout').ResizeEdge, dx: number, dy: number) => void
      onPlacement: (listener: (placement: import('../../shared/focus-window-layout').FocusPlacement) => void) => () => void
      onOpenCalendar: (listener: () => void) => () => void
      onOpenSettings: (listener: () => void) => () => void
      openCalendar: () => Promise<void>
      getSubscription: () => Promise<import('../../shared/focus').SubscriptionSnapshot>
      getCalendarSource: (id: string) => Promise<import('../../shared/focus').CalendarSource | null>
      saveSubscription: (url: string) => Promise<import('../../shared/focus').SubscriptionSnapshot>
      refreshSubscription: () => Promise<import('../../shared/focus').SubscriptionSnapshot>
      removeSubscription: () => Promise<import('../../shared/focus').SubscriptionSnapshot>
      setCalendarRange: (range: import('../../shared/focus').CalendarRange) => Promise<import('../../shared/focus').SubscriptionSnapshot>
      getGoogle: () => Promise<import('../../shared/google-calendar').GoogleCalendarState>
      configureGoogle: () => Promise<import('../../shared/google-calendar').GoogleCalendarState>
      connectGoogle: () => Promise<import('../../shared/google-calendar').GoogleCalendarState>
      cancelGoogle: () => Promise<import('../../shared/google-calendar').GoogleCalendarState>
      refreshGoogle: () => Promise<import('../../shared/google-calendar').GoogleCalendarState>
      disconnectGoogle: () => Promise<import('../../shared/google-calendar').GoogleCalendarState>
      selectGoogleCalendars: (ids: string[]) => Promise<import('../../shared/google-calendar').GoogleCalendarState>
      setGoogleRange: (range: import('../../shared/focus').CalendarRange) => Promise<import('../../shared/google-calendar').GoogleCalendarState>
      openGoogleEvent: (id: string) => Promise<void>
      onGoogle: (listener: (state: import('../../shared/google-calendar').GoogleCalendarState) => void) => () => void
      getTickTick: () => Promise<import('../../shared/focus').SubscriptionSnapshot>
      getCalendarLinks: () => Promise<import('../../shared/import-links').CalendarLinksState>
      addCalendarLink: (url: string) => Promise<import('../../shared/import-links').CalendarLinkResult>
      refreshCalendarLink: (id: string) => Promise<import('../../shared/import-links').CalendarLinksState>
      removeCalendarLink: (id: string) => Promise<import('../../shared/import-links').CalendarLinksState>
      setCalendarLinksRange: (range: import('../../shared/focus').CalendarRange) => Promise<import('../../shared/import-links').CalendarLinksState>
      onCalendarLinks: (listener: (state: import('../../shared/import-links').CalendarLinksState) => void) => () => void
      saveTickTick: (url: string) => Promise<import('../../shared/focus').SubscriptionSnapshot>
      refreshTickTick: () => Promise<import('../../shared/focus').SubscriptionSnapshot>
      removeTickTick: () => Promise<import('../../shared/focus').SubscriptionSnapshot>
      setTickTickRange: (range: import('../../shared/focus').CalendarRange) => Promise<import('../../shared/focus').SubscriptionSnapshot>
      onTickTick: (listener: (state: import('../../shared/focus').SubscriptionSnapshot) => void) => () => void
      getMicrosoft: () => Promise<import('../../shared/imports').MicrosoftTodoState>
      configureMicrosoft: (id: string) => Promise<import('../../shared/imports').MicrosoftTodoState>
      connectMicrosoft: () => Promise<import('../../shared/imports').MicrosoftTodoState>
      cancelMicrosoft: () => Promise<import('../../shared/imports').MicrosoftTodoState>
      refreshMicrosoft: () => Promise<import('../../shared/imports').MicrosoftTodoState>
      disconnectMicrosoft: () => Promise<import('../../shared/imports').MicrosoftTodoState>
      selectMicrosoftLists: (ids: string[]) => Promise<import('../../shared/imports').MicrosoftTodoState>
      onMicrosoft: (listener: (state: import('../../shared/imports').MicrosoftTodoState) => void) => () => void
      onSubscription: (listener: (state: import('../../shared/focus').SubscriptionSnapshot) => void) => () => void
    }
  }
}
