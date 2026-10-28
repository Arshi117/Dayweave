import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, ChevronRight, Link2, RefreshCw, Settings2 } from 'lucide-react'
import type { CalendarSource, SubscriptionSnapshot } from '../../../shared/focus'
import type { GoogleCalendarState } from '../../../shared/google-calendar'
import type { MicrosoftTodoState } from '../../../shared/imports'
import { identifyImportLink, type CalendarLinksState } from '../../../shared/import-links'
import { GoogleConnection } from './GoogleConnection'
import { MicrosoftTodoConnection } from './TaskConnections'

interface Props {
  initialView?: string
  google: GoogleCalendarState; feed: SubscriptionSnapshot; ticktick: SubscriptionSnapshot; microsoft: MicrosoftTodoState; links: CalendarLinksState
  onGoogle: (value: GoogleCalendarState) => void; onFeed: (value: SubscriptionSnapshot) => void
  onTickTick: (value: SubscriptionSnapshot) => void; onMicrosoft: (value: MicrosoftTodoState) => void
  onLinks: (value: CalendarLinksState) => void
}
export function ImportConnections({ initialView = 'home', google, feed, ticktick, microsoft, links, onGoogle, onFeed, onTickTick, onMicrosoft, onLinks }: Props) {
  const [address, setAddress] = useState(''), [pending, setPending] = useState(false)
  const [error, setError] = useState(''), [message, setMessage] = useState('')
  const [view, setView] = useState(initialView)
  const [setup, setSetup] = useState<'google' | 'microsoft' | null>(null)
  const [sourceFile, setSourceFile] = useState<CalendarSource | null>(null)
  const [sourcePending, setSourcePending] = useState(false)
  const sourceRequest = useRef(0)
  const detected = useMemo(() => identifyImportLink(address), [address])
  const fallback = google.connected && /(^|\.)google\.com$/i.test(feed.sourceLabel)
  const rows = [
    ...(google.connected ? [{ id: 'google', name: 'Google 日历', count: google.events.length, error: google.error, active: true }] : []),
    ...(feed.configured ? [{ id: 'legacy', name: (feed.calendarName || '日历订阅') + (fallback ? '（备用）' : ''), count: feed.events.length, error: feed.error, active: !fallback }] : []),
    ...(ticktick.configured ? [{ id: 'ticktick', name: ticktick.calendarName || 'TickTick', count: ticktick.events.length + (ticktick.tasks?.length || 0), error: ticktick.error, active: true }] : []),
    ...(microsoft.connected ? [{ id: 'microsoft', name: 'Microsoft To Do', count: microsoft.tasks.length, error: microsoft.error, active: true }] : []),
    ...links.sources.map(source => ({ id: source.id, name: source.snapshot.calendarName || (source.provider === 'ticktick' ? 'TickTick' : source.snapshot.sourceLabel),
      count: source.snapshot.events.length + (source.snapshot.tasks?.length || 0), error: source.snapshot.error, active: source.snapshot.configured })),
  ]
  const connected = rows.filter(row => row.active).length
  const busy = pending || google.authorizing || microsoft.authorizing
  const authorizing = google.authorizing || microsoft.authorizing
  const hint = detected ? detected.mode === 'feed' ? '已识别：' + detected.label + ' · 将读取订阅内容'
    : detected.provider === 'ticktick' ? '已识别 TickTick 页面，请复制“订阅到其他日历”的链接'
      : '已识别：' + detected.label + ' · 需要账号授权读取' : address.trim() ? '请输入完整的 HTTPS 或 webcal 链接' : '自动识别来源，已有安排会保留。'
  async function connect() {
    const api = window.focusControls
    if (!api || busy || !detected) return
    setError(''); setMessage(''); setSetup(null)
    if (detected.provider === 'ticktick' && detected.mode === 'account') {
      setError('这是 TickTick 网页或分享链接。请在 TickTick 中复制“订阅到其他日历”的链接。'); return
    }
    if (detected.mode === 'account' && (detected.provider === 'google' && !google.configured || detected.provider === 'microsoft' && !microsoft.configured)) {
      const provider = detected.provider === 'google' ? 'google' : 'microsoft'
      setSetup(provider); setMessage('已识别来源，但此开发版尚未配置账号连接。'); return
    }
    setPending(true)
    try {
      if (detected.mode === 'feed') {
        const result = await api.addCalendarLink(address)
        if (!result) throw new Error('Unavailable bridge')
        onLinks({ sources: result.sources, error: result.error })
        if (result.error) setError(result.error)
        else { setAddress(''); setMessage('来源已添加，安排会自动更新。') }
      } else if (detected.provider === 'google') {
        const result = await (google.connected && !google.reconnectRequired ? api.refreshGoogle() : api.connectGoogle())
        if (!result) throw new Error('Unavailable bridge')
        onGoogle(result)
        if (result.error) setError(result.error)
        else if (result.connected) { setAddress(''); setMessage('Google 日历已连接，可在管理中选择日历。') }
      } else if (detected.provider === 'microsoft') {
        const result = await (microsoft.connected && !microsoft.reconnectRequired ? api.refreshMicrosoft() : api.connectMicrosoft())
        if (!result) throw new Error('Unavailable bridge')
        onMicrosoft(result)
        if (result.error) setError(result.error)
        else if (result.connected) { setAddress(''); setMessage('微软待办已连接，可在管理中选择清单。') }
      }
    } catch { setError('连接未完成，请重试。') }
    finally { setPending(false) }
  }
  async function feedAction(kind: 'refresh' | 'remove') {
    const api = window.focusControls
    if (!api || busy) return
    setPending(true); setError(''); setMessage('')
    try {
      if (view === 'legacy') {
        const result = await (kind === 'refresh' ? api.refreshSubscription() : api.removeSubscription())
        if (!result) throw new Error('Unavailable bridge')
        onFeed(result); if (result.error) { setError(result.error); return }
      } else if (view === 'ticktick') {
        const result = await (kind === 'refresh' ? api.refreshTickTick() : api.removeTickTick())
        if (!result) throw new Error('Unavailable bridge')
        onTickTick(result); if (result.error) { setError(result.error); return }
      } else {
        const result = await (kind === 'refresh' ? api.refreshCalendarLink(view) : api.removeCalendarLink(view))
        if (!result) throw new Error('Unavailable bridge')
        onLinks(result); if (result.error) { setError(result.error); return }
      }
      if (kind === 'remove') setView('manage')
    } catch { setError('来源管理操作未保存，请重试。') }
    finally { setPending(false) }
  }
  function navigate(next: string) { ++sourceRequest.current; setSourceFile(null); setSourcePending(false); setView(next); setError(''); setMessage(''); setSetup(null); if (links.error) onLinks({ ...links, error: '' }) }
  async function viewSource() {
    if (sourceFile) { ++sourceRequest.current; setSourceFile(null); return }
    const request = ++sourceRequest.current
    setSourcePending(true)
    try {
      const result = await window.focusControls?.getCalendarSource(view)
      if (request === sourceRequest.current) setSourceFile(result || { text: '', downloadedAt: 0, error: '暂时无法读取源文件，请重试。' })
    } catch { if (request === sourceRequest.current) setSourceFile({ text: '', downloadedAt: 0, error: '暂时无法读取源文件，请重试。' }) }
    finally { if (request === sourceRequest.current) setSourcePending(false) }
  }
  const selected = view === 'legacy' ? feed : view === 'ticktick' ? ticktick : links.sources.find(source => source.id === view)?.snapshot
  const row = rows.find(row => row.id === view)
  return <section className="import-connections" aria-label="统一导入">
    {view === 'home' ? <>
      <div className="unified-import-title"><Link2 size={15} /><strong>添加日程来源</strong></div>
      <form onSubmit={event => { event.preventDefault(); void connect() }}>
        <label className="unified-link-label" htmlFor="import-address">粘贴日历或待办链接</label>
        <div className="unified-import-input"><input id="import-address" type="password" autoComplete="off" spellCheck={false} disabled={busy} placeholder="粘贴链接，自动识别来源" value={address}
          onChange={event => { setAddress(event.target.value); setError(''); setMessage(''); setSetup(null); if (links.error) onLinks({ ...links, error: '' }) }} /><button type="submit" disabled={!detected || busy}>{pending ? '连接中' : '添加'}</button></div>
      </form>
      <p className="unified-import-hint" role="status">{hint}</p>
      {authorizing && <div className="google-auth-wait"><span>请在浏览器中完成账号授权…</span><button onClick={() => { void (google.authorizing ? window.focusControls?.cancelGoogle() : window.focusControls?.cancelMicrosoft()) }}>取消</button></div>}
      {message && <p className="unified-import-success" role="status"><Check size={12} />{message}</p>}
      {setup && <button className="unified-text-button" onClick={() => navigate(setup)}>打开连接设置</button>}
      <button className="unified-import-summary" disabled={busy} onClick={() => navigate('manage')}><span><i className={connected ? 'is-connected' : ''} />{connected ? '已连接 ' + connected + ' 个来源' : '尚未连接来源'}</span><span>管理<ChevronRight size={12} /></span></button>
      <details className="unified-more"><summary>更多连接方式</summary><p>没有订阅链接时，可以直接连接账号。</p><div><button disabled={busy} onClick={() => navigate('google')}>Google 账号</button><button disabled={busy} onClick={() => navigate('microsoft')}>微软账号</button></div></details>
    </> : <>
      <button className="unified-import-back" disabled={busy} onClick={() => navigate(view === 'manage' ? 'home' : 'manage')}><ArrowLeft size={12} />{view === 'manage' ? '返回添加来源' : '返回来源管理'}</button>
      {view === 'manage' ? <div className="unified-source-list">
        <h3>来源管理</h3>
        {rows.length ? rows.map(source => <button key={source.id} onClick={() => navigate(source.id)}><span><strong>{source.name}</strong><small>{source.error ? '需要检查连接' : source.count + ' 条安排与待办'}</small></span><ChevronRight size={13} /></button>) : <p>添加链接后，已连接的来源会出现在这里。</p>}
      </div> : view === 'google' ? <GoogleConnection state={google} onState={onGoogle} /> : view === 'microsoft' ? <MicrosoftTodoConnection state={microsoft} onState={onMicrosoft} /> : selected ? <div className="unified-source-detail">
        <h3>{row?.name || '日历订阅'}</h3>
        <p>{selected.events.filter(event => !event.allDay).length} 个时间块 · {selected.events.filter(event => event.allDay).length} 个全天安排 · {selected.tasks?.length || 0} 条待办</p>
        {selected.sourceEventCount !== undefined && <p>源文件包含 {selected.sourceEventCount} 条事件、{selected.sourceTaskCount || 0} 条待办；时间表按查看的日期展开。</p>}
        {selected.lastSynced && <p>最近更新：{new Date(selected.lastSynced).toLocaleString('zh-CN')}</p>}
        {selected.sourceEventCount && selected.sourceBusyCount === selected.sourceEventCount ? <p>来源只提供忙闲信息，未提供日程名称。</p> : null}
        {selected.error && <p className="google-connection-error" role="alert">{selected.error}</p>}
        {selected.importWarnings?.map(warning => <p key={warning} role="status">{warning}</p>)}
        <div className="google-connection-actions"><button disabled={busy || selected.refreshing} onClick={() => { void feedAction('refresh') }}><RefreshCw size={12} />{selected.refreshing ? '更新中' : '刷新'}</button><button disabled={busy || selected.refreshing} onClick={() => { void feedAction('remove') }}>移除来源</button></div>
        <div className="calendar-source-view"><button className="unified-text-button" disabled={sourcePending} onClick={() => { void viewSource() }}>{sourcePending ? '读取源文件…' : sourceFile ? '收起源文件' : '查看完整源文件'}</button>
          {sourceFile && <>{sourceFile.error ? <p role="alert">{sourceFile.error}</p> : <><p>以下是最近下载的原文，包含未显示在当前日期中的事件和扩展字段。{sourceFile.redacted ? '订阅地址已隐藏。' : ''}</p><pre tabIndex={0} aria-label="日历源文件原文">{sourceFile.text}</pre></>}</>}
        </div>
        <p className="unified-import-hint">移除来源不会修改原应用或删除本机日程。</p>
      </div> : <p>该来源已移除。</p>}
    </>}
    {(error || links.error) && <p className="google-connection-error" role="alert">{error || links.error}</p>}
    {view === 'home' && <p className="unified-import-note"><Settings2 size={10} />自动更新，只读取已获准访问的内容。</p>}
  </section>
}
