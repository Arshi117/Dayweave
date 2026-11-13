import { EMPTY_GOOGLE } from '../../shared/google-calendar'
import { EMPTY_MICROSOFT, EMPTY_SUBSCRIPTION } from '../../shared/imports'
import { DEFAULT_FOCUS_DIMENSIONS, type FocusPlacement } from '../../shared/focus-window-layout'
import type { SubscriptionSnapshot } from '../../shared/focus'
import type { CalendarLinksState } from '../../shared/import-links'
import './ui-preview.css'

// Development-only visual preview. It uses the real React components, isolated
// browser storage and synthetic fixtures; no desktop profile or credentials.
export function initializeUiPreview() {
  const dock = new URLSearchParams(window.location.search).get('preview') === 'dock'
  const now = new Date(), start = new Date(now); start.setMinutes(Math.floor(start.getMinutes() / 15) * 15, 0, 0)
  const end = new Date(start.getTime() + 45 * 60000)
  const date = (value: Date) => [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-')
  const clock = (value: Date) => String(value.getHours()).padStart(2, '0') + ':' + String(value.getMinutes()).padStart(2, '0')
  if (!localStorage.getItem('dayweave.entries.v1')) localStorage.setItem('dayweave.entries.v1', JSON.stringify([
    { id: 'preview-study', title: '课程复习', date: date(start), kind: 'block', startTime: clock(start), endTime: clock(end), completed: false, color: 'violet' },
  ]))
  if (!localStorage.getItem('dayweave.appearance.v1')) localStorage.setItem('dayweave.appearance.v1', JSON.stringify('paper'))
  const sample: SubscriptionSnapshot = { ...EMPTY_SUBSCRIPTION, configured: true, calendarName: '学校课表', sourceLabel: '课程日历', lastSynced: Date.now(), events: [] }
  const google = { ...EMPTY_GOOGLE, configured: true, connected: true, lastSynced: Date.now(), calendars: [{ id: 'preview-google', name: '课程日历', selected: true, primary: true, accessRole: 'reader' }] }
  const ticktick: SubscriptionSnapshot = { ...sample, calendarName: 'TickTick', tasks: [{ id: 'preview-task-1', title: '整理课程笔记', provider: 'ticktick', listId: 'preview', listName: '学习' }] }
  const microsoft = { ...EMPTY_MICROSOFT, configured: true, connected: true, lastSynced: Date.now(), lists: [{ id: 'preview-list', name: '待办清单', selected: true }], tasks: [{ id: 'preview-task-2', title: '准备下周的小组讨论', provider: 'microsoft-todo' as const, listId: 'preview-list', listName: '待办清单' }] }
  const links: CalendarLinksState = { sources: [{ id: 'preview-school', provider: 'ical', kind: 'feed', snapshot: sample }], error: '' }
  const unavailable = '这是界面预览，请在桌面版操作真实账号和日程来源。'
  const events = new EventTarget()
  const subscribe = (name: string, callback: () => void) => { events.addEventListener(name, callback); return () => events.removeEventListener(name, callback) }
  const placements = new Set<(value: FocusPlacement) => void>()
  let dockY = window.innerHeight - 50
  let previewDocked = true
  const placement = (): FocusPlacement => {
    const above = dock && previewDocked
    return { above, docked: dock && previewDocked, left: false, availableHeight: dock ? Math.max(180, above ? dockY - 20 : window.innerHeight - dockY - 70) : Math.max(620, window.innerHeight - 100), availableWidth: window.innerWidth - 48, dimensions: dock ? { ...DEFAULT_FOCUS_DIMENSIONS, stripWidth: 360 } : DEFAULT_FOCUS_DIMENSIONS }
  }
  window.addEventListener('dayweave-preview-position', event => { const detail = (event as CustomEvent).detail; dockY = detail.y; previewDocked = detail.docked === true; placements.forEach(callback => callback(placement())) })
  window.addEventListener('resize', () => placements.forEach(callback => callback(placement())))
  window.focusControls = {
    async renameCalendarSource() { return { error: unavailable } },
    hide() {}, resize(_height, calendar) { document.getElementById('root')!.style.width = dock ? '100%' : (calendar ? 1068 : 300) + 'px'; if (dock) window.dispatchEvent(new CustomEvent('dayweave-preview-calendar', {detail: calendar})) },
    beginDimensionResize() {}, moveDimensionResize() {}, endDimensionResize() {}, stepDimensionResize() {},
    onPlacement(callback) { placements.add(callback); queueMicrotask(() => { if (placements.has(callback)) callback(placement()) }); return () => { placements.delete(callback) } },
    onOpenCalendar(callback) { return subscribe('calendar', callback) },
    onOpenSettings(callback) { const remove = subscribe('settings', callback); if (!dock) queueMicrotask(() => events.dispatchEvent(new Event('settings'))); return remove },
    async openCalendar() { events.dispatchEvent(new Event('calendar')) },
    async getSubscription() { return EMPTY_SUBSCRIPTION }, async saveSubscription() { return { ...sample, error: unavailable } }, async refreshSubscription() { return sample }, async removeSubscription() { return EMPTY_SUBSCRIPTION }, async setCalendarRange() { return sample },
    async getCalendarSource() { return { text: 'BEGIN:VCALENDAR\nVERSION:2.0\nX-WR-CALNAME:示例课表\nEND:VCALENDAR', downloadedAt: Date.now(), error: '' } },
    async getGoogle() { return google }, async configureGoogle() { return { ...google, error: unavailable } }, async connectGoogle() { return { ...google, error: unavailable } }, async cancelGoogle() { return google }, async refreshGoogle() { return google }, async disconnectGoogle() { return { ...EMPTY_GOOGLE, configured: true } }, async selectGoogleCalendars() { return google }, async setGoogleRange() { return google }, async openGoogleEvent() {}, onGoogle() { return () => {} },
    async getTickTick() { return ticktick }, async saveTickTick() { return { ...ticktick, error: unavailable } }, async refreshTickTick() { return ticktick }, async removeTickTick() { return EMPTY_SUBSCRIPTION }, async setTickTickRange() { return ticktick }, onTickTick() { return () => {} },
    async getMicrosoft() { return microsoft }, async configureMicrosoft() { return { ...microsoft, error: unavailable } }, async connectMicrosoft() { return { ...microsoft, error: unavailable } }, async cancelMicrosoft() { return microsoft }, async refreshMicrosoft() { return microsoft }, async disconnectMicrosoft() { return { ...EMPTY_MICROSOFT, configured: true } }, async selectMicrosoftLists() { return microsoft }, onMicrosoft() { return () => {} },
    async getCalendarLinks() { return links }, async addCalendarLink() { return { ...links, error: unavailable } }, async refreshCalendarLink() { return links }, async removeCalendarLink() { return { sources: [], error: '' } }, async setCalendarLinksRange() { return links }, onCalendarLinks() { return () => {} },
    async previewCalendarFile() { return { token: '', name: '', eventCount: 0, taskCount: 0, examples: [], warnings: [], error: unavailable } }, async commitCalendarFile() { return { ...links, error: unavailable } }, async cancelCalendarFile() {}, onSubscription() { return () => {} },
  }
  document.documentElement.classList.add('dayweave-ui-preview')
  if (dock) document.documentElement.classList.add('dayweave-dock-preview')
  document.title = 'Dayweave · 界面预览'
}
