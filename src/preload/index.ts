import { contextBridge, ipcRenderer } from 'electron'
import type { CalendarRange, SubscriptionSnapshot } from '../shared/focus'
import type { FocusPlacement, ResizeTarget, ResizeEdge } from '../shared/focus-window-layout'
import type { GoogleCalendarState } from '../shared/google-calendar'
import type { MicrosoftTodoState } from '../shared/imports'
import type { CalendarLinksState } from '../shared/import-links'

contextBridge.exposeInMainWorld('focusControls', {
  hide: () => ipcRenderer.send('focus:hide'),
  resize: (height: number, calendar = false, expanded = false) => ipcRenderer.send('focus:resize', height, calendar, expanded),
  beginDimensionResize: (target: ResizeTarget, edge: ResizeEdge) => ipcRenderer.send('focus:dimension-start', target, edge),
  moveDimensionResize: () => ipcRenderer.send('focus:dimension-move'),
  endDimensionResize: () => ipcRenderer.send('focus:dimension-end'),
  stepDimensionResize: (target: ResizeTarget, edge: ResizeEdge, dx: number, dy: number) => ipcRenderer.send('focus:dimension-step', target, edge, dx, dy),
  onPlacement: (listener: (placement: FocusPlacement) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, placement: FocusPlacement) => listener(placement)
    ipcRenderer.on('focus:placement', handler)
    return () => ipcRenderer.removeListener('focus:placement', handler)
  },
  onOpenCalendar: (listener: () => void) => {
    const handler = () => listener()
    ipcRenderer.on('focus:open-calendar', handler)
    return () => ipcRenderer.removeListener('focus:open-calendar', handler)
  },
  onOpenSettings: (listener: () => void) => {
    const handler = () => listener()
    ipcRenderer.on('focus:open-settings', handler)
    return () => ipcRenderer.removeListener('focus:open-settings', handler)
  },
  openCalendar: () => ipcRenderer.invoke('focus:calendar'),
  getSubscription: () => ipcRenderer.invoke('focus:subscription-state'),
  getCalendarSource: (id: string) => ipcRenderer.invoke('focus:calendar-source', id),
  saveSubscription: (url: string) => ipcRenderer.invoke('focus:subscription-save', url),
  refreshSubscription: () => ipcRenderer.invoke('focus:subscription-refresh'),
  removeSubscription: () => ipcRenderer.invoke('focus:subscription-remove'),
  setCalendarRange: (range: CalendarRange) => ipcRenderer.invoke('focus:subscription-range', range),
  getGoogle: () => ipcRenderer.invoke('focus:google-state'),
  configureGoogle: () => ipcRenderer.invoke('focus:google-configure'),
  connectGoogle: () => ipcRenderer.invoke('focus:google-connect'),
  cancelGoogle: () => ipcRenderer.invoke('focus:google-cancel'),
  refreshGoogle: () => ipcRenderer.invoke('focus:google-refresh'),
  disconnectGoogle: () => ipcRenderer.invoke('focus:google-disconnect'),
  selectGoogleCalendars: (ids: string[]) => ipcRenderer.invoke('focus:google-select', ids),
  setGoogleRange: (range: CalendarRange) => ipcRenderer.invoke('focus:google-range', range),
  openGoogleEvent: (id: string) => ipcRenderer.invoke('focus:google-open-event', id),
  onGoogle: (listener: (snapshot: GoogleCalendarState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: GoogleCalendarState) => listener(snapshot)
    ipcRenderer.on('focus:google-state', handler)
    return () => ipcRenderer.removeListener('focus:google-state', handler)
  },
  getTickTick: () => ipcRenderer.invoke('focus:ticktick-state'),
  getCalendarLinks: () => ipcRenderer.invoke('focus:links-state'),
  addCalendarLink: (url: string) => ipcRenderer.invoke('focus:links-add', url),
  refreshCalendarLink: (id: string) => ipcRenderer.invoke('focus:links-refresh', id),
  removeCalendarLink: (id: string) => ipcRenderer.invoke('focus:links-remove', id),
  setCalendarLinksRange: (range: CalendarRange) => ipcRenderer.invoke('focus:links-range', range),
  onCalendarLinks: (listener: (state: CalendarLinksState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: CalendarLinksState) => listener(state)
    ipcRenderer.on('focus:links-state', handler)
    return () => ipcRenderer.removeListener('focus:links-state', handler)
  },
  saveTickTick: (url: string) => ipcRenderer.invoke('focus:ticktick-save', url),
  refreshTickTick: () => ipcRenderer.invoke('focus:ticktick-refresh'),
  removeTickTick: () => ipcRenderer.invoke('focus:ticktick-remove'),
  setTickTickRange: (range: CalendarRange) => ipcRenderer.invoke('focus:ticktick-range', range),
  onTickTick: (listener: (snapshot: SubscriptionSnapshot) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: SubscriptionSnapshot) => listener(snapshot)
    ipcRenderer.on('focus:ticktick-state', handler)
    return () => ipcRenderer.removeListener('focus:ticktick-state', handler)
  },
  getMicrosoft: () => ipcRenderer.invoke('focus:microsoft-state'),
  configureMicrosoft: (id: string) => ipcRenderer.invoke('focus:microsoft-configure', id),
  connectMicrosoft: () => ipcRenderer.invoke('focus:microsoft-connect'),
  cancelMicrosoft: () => ipcRenderer.invoke('focus:microsoft-cancel'),
  refreshMicrosoft: () => ipcRenderer.invoke('focus:microsoft-refresh'),
  disconnectMicrosoft: () => ipcRenderer.invoke('focus:microsoft-disconnect'),
  selectMicrosoftLists: (ids: string[]) => ipcRenderer.invoke('focus:microsoft-select', ids),
  onMicrosoft: (listener: (snapshot: MicrosoftTodoState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: MicrosoftTodoState) => listener(snapshot)
    ipcRenderer.on('focus:microsoft-state', handler)
    return () => ipcRenderer.removeListener('focus:microsoft-state', handler)
  },
  onSubscription: (listener: (snapshot: SubscriptionSnapshot) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: SubscriptionSnapshot) => listener(snapshot)
    ipcRenderer.on('focus:subscription', handler)
    return () => ipcRenderer.removeListener('focus:subscription', handler)
  },
})
