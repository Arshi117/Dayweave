import { useEffect, useState } from 'react'
import { CalendarDays, Check, RefreshCw } from 'lucide-react'
import type { GoogleCalendarState } from '../../../shared/google-calendar'

interface Props { state: GoogleCalendarState; onState: (state: GoogleCalendarState) => void }
export function GoogleConnection({ state, onState }: Props) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [selection, setSelection] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  useEffect(() => { if (!dirty) setSelection(state.calendars.filter(calendar => calendar.selected).map(calendar => calendar.id)) }, [state.calendars, dirty])
  async function action(kind: 'connect' | 'refresh' | 'select' | 'cancel') {
    const api = window.focusControls
    if (!api || pending && kind !== 'cancel') return
    if (kind !== 'cancel') setPending(true)
    setError('')
    try {
      const result = await (kind === 'connect' ? api.connectGoogle() : kind === 'refresh' ? api.refreshGoogle()
        : kind === 'select' ? api.selectGoogleCalendars(selection) : api.cancelGoogle())
      if (result) onState(result)
      if (kind === 'select' && !result?.error) setDirty(false)
    } catch { setError('Google 连接操作未完成，请重试。') }
    finally { if (kind !== 'cancel') setPending(false) }
  }
  const busy = pending || state.refreshing || state.authorizing
  const visibleError = error || state.error || (!state.configured ? '此版本暂时无法连接 Google 账号，请更新应用。' : selection.length > 20 ? '最多选择 20 本日历。' : '')
  return <section className="google-connection" aria-label="Google 账号连接">
    <div className="google-connection-heading"><CalendarDays size={14} /><strong>Google 日历</strong>{state.connected && <span><Check size={11} />已连接 · 只读</span>}</div>
      {state.authorizing ? <div className="google-auth-wait" role="status"><span>请在系统浏览器完成登录授权…</span><button onClick={() => { void action('cancel') }}>取消</button></div>
        : !state.connected || state.reconnectRequired ? <button className="google-connect-button" disabled={busy || !state.configured} onClick={() => { void action('connect') }}>{state.reconnectRequired ? '重新授权 Google 账号' : '连接 Google 账号'}</button> : null}
      {state.connected && <>
        <div className="google-calendar-list" aria-label="选择 Google 日历">
          {state.calendars.map(calendar => {
            const readable = ['reader', 'writer', 'writerWithoutPrivateAccess', 'owner'].includes(calendar.accessRole)
            return <label key={calendar.id} title={calendar.name}><input type="checkbox" checked={selection.includes(calendar.id)} disabled={busy || !readable}
              onChange={event => { setDirty(true); setSelection(current => event.target.checked ? [...current, calendar.id] : current.filter(id => id !== calendar.id)) }} />
              <span>{calendar.name}<small>{!readable ? '仅忙闲权限，无法读取详情' : calendar.primary ? '主日历' : '可读取事件'}</small></span></label>
          })}
          {!state.calendars.length && <span className="google-list-empty">{state.refreshing ? '正在读取日历列表…' : '尚未读到日历列表，请重试刷新。'}</span>}
        </div>
        <div className="google-connection-actions"><button disabled={busy || !dirty || selection.length > 20} onClick={() => { void action('select') }}>同步所选日历</button><button disabled={busy} title="刷新日历列表与安排" onClick={() => { void action('refresh') }}><RefreshCw size={11} />刷新</button></div>
      </>}
    {visibleError && <div className="google-connection-error" role="alert">{visibleError}</div>}
  </section>
}
