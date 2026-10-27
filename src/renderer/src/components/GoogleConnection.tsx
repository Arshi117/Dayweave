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
  async function action(kind: 'configure' | 'connect' | 'refresh' | 'disconnect' | 'select' | 'cancel') {
    const api = window.focusControls
    if (!api || pending && kind !== 'cancel') return
    if (kind !== 'cancel') setPending(true)
    setError('')
    try {
      const result = await (kind === 'configure' ? api.configureGoogle() : kind === 'connect' ? api.connectGoogle()
        : kind === 'refresh' ? api.refreshGoogle() : kind === 'disconnect' ? api.disconnectGoogle()
          : kind === 'select' ? api.selectGoogleCalendars(selection) : api.cancelGoogle())
      if (result) onState(result)
      if (kind === 'select' || kind === 'disconnect') setDirty(false)
    } catch { setError('Google 连接操作未完成，请重试。') }
    finally { if (kind !== 'cancel') setPending(false) }
  }
  const busy = pending || state.refreshing || state.authorizing
  return <section className="google-connection" aria-label="Google 账号连接">
    <div className="google-connection-heading"><CalendarDays size={14} /><strong>Google 日历</strong>{state.connected && <span><Check size={11} />已连接 · 只读</span>}</div>
    {!state.connected && <p>使用 Google 账号读取课程名称、时间、地点和说明。</p>}
    {!state.configured ? <>
      <button className="google-connect-button" disabled={busy} onClick={() => { void action('configure') }}>导入桌面应用配置 JSON</button>
      <details className="google-setup-help"><summary>首次配置步骤</summary><ol>
        <li>在 Google Cloud 创建项目，启用 Google Calendar API。</li>
        <li>在 Google Auth platform 设置应用名和测试用户。</li>
        <li>添加日历列表和事件的两项只读权限。</li>
        <li>在 Clients 创建 Desktop app，下载并导入 JSON。</li>
      </ol><p>详细步骤见项目中的 GOOGLE_SETUP.md。</p></details>
    </> : <>
      {state.authorizing ? <div className="google-auth-wait" role="status"><span>请在系统浏览器完成登录授权…</span><button onClick={() => { void action('cancel') }}>取消</button></div>
        : !state.connected || state.reconnectRequired ? <button className="google-connect-button" disabled={busy} onClick={() => { void action('connect') }}>{state.reconnectRequired ? '重新授权 Google 账号' : '连接 Google 账号'}</button> : null}
      {!state.connected && !state.authorizing && <button className="google-secondary" disabled={busy} onClick={() => { void action('configure') }}>更换应用配置</button>}
      {state.connected && <>
        <p>勾选需要显示的日历，包含学校课程日历。</p>
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
        <p className="google-connection-count">{state.refreshing ? '正在读取课程…' : '已读取 ' + state.events.length + ' 条安排'}{dirty ? ' · 选择尚未同步' : ''}{selection.length > 20 ? ' · 最多选择 20 本日历' : ''}</p>
        <button className="google-secondary" disabled={busy} onClick={() => { void action('disconnect') }}>断开 Google 账号</button>
      </>}
    </>}
    {(error || state.error) && <div className="google-connection-error" role="alert">{error || state.error}</div>}
    <p className="google-connection-note">只读取日历，不更改原安排。可读取的详情受账号和学校权限限制。</p>
  </section>
}
