import { useMemo, useState } from 'react'
import { AlertCircle, ArrowLeft, Check, ChevronRight, FileUp, Link2, RefreshCw } from 'lucide-react'
import type { SubscriptionSnapshot } from '../../../shared/focus'
import type { GoogleCalendarState } from '../../../shared/google-calendar'
import type { MicrosoftTodoState } from '../../../shared/imports'
import { identifyImportLink, importLinkInputError, type CalendarLinksState } from '../../../shared/import-links'
import { GoogleConnection } from './GoogleConnection'
import { MicrosoftTodoConnection } from './TaskConnections'
import { CalendarFileImport } from './CalendarFileImport'

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
  const [invalidAddress, setInvalidAddress] = useState(false)
  const [view, setView] = useState(initialView)
  const [linkedPdf, setLinkedPdf] = useState<File | null>(null)
  const detected = useMemo(() => identifyImportLink(address), [address])
  const fallback = google.connected && /(^|\.)google\.com$/i.test(feed.sourceLabel)
  const rows = [
    ...(google.connected ? [{ id: 'google', name: 'Google 日历', error: google.error }] : []),
    ...(feed.configured ? [{ id: 'legacy', name: (feed.calendarName || '日历订阅') + (fallback ? '（备用）' : ''), error: feed.error }] : []),
    ...(ticktick.configured ? [{ id: 'ticktick', name: ticktick.calendarName || 'TickTick', error: ticktick.error }] : []),
    ...(microsoft.connected ? [{ id: 'microsoft', name: 'Microsoft To Do', error: microsoft.error }] : []),
    ...links.sources.map(source => ({ id: source.id, name: source.snapshot.calendarName || (source.provider === 'ticktick' ? 'TickTick' : source.snapshot.sourceLabel),
      error: source.snapshot.error })),
  ]
  const connected = rows.length
  const busy = pending || google.authorizing || microsoft.authorizing
  const authorizing = google.authorizing || microsoft.authorizing
  const visibleError = error || links.error
  function validateAddress() {
    const issue = importLinkInputError(address)
    setInvalidAddress(Boolean(issue))
    if (issue) { setError(issue); setMessage('') }
    return !issue
  }
  async function connect() {
    const api = window.focusControls
    if (busy) return
    if (!validateAddress() || !detected) return
    if (!api) { setError('暂时无法连接，请重启 Dayweave 后重试。'); return }
    setError(''); setMessage('')
    if (detected.provider === 'ticktick' && detected.mode === 'account') {
      setError('这是 TickTick 网页或分享链接。请在 TickTick 中复制“订阅到其他日历”的链接。'); return
    }
    if (detected.mode === 'account' && (detected.provider === 'google' && !google.configured || detected.provider === 'microsoft' && !microsoft.configured)) {
      setError('此版本暂时无法连接该账号，请更新应用。'); return
    }
    setPending(true)
    try {
      if (detected.mode === 'feed') {
        const result = await api.addCalendarLink(address)
        if (!result) throw new Error('Unavailable bridge')
        onLinks({ sources: result.sources, error: result.error })
        if (result.error) setError(result.error)
        else if (result.pdf) {
          const bytes = Uint8Array.from(atob(result.pdf.base64), character => character.charCodeAt(0))
          setLinkedPdf(new File([bytes], result.pdf.name, { type: 'application/pdf' }))
          setAddress(''); navigate('file')
        }
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
  function navigate(next: string) { if (next !== 'file') setLinkedPdf(null); setView(next); setError(''); setInvalidAddress(false); setMessage(''); if (links.error) onLinks({ ...links, error: '' }) }
  const selected = view === 'legacy' ? feed : view === 'ticktick' ? ticktick : links.sources.find(source => source.id === view)?.snapshot
  const selectedFile = links.sources.find(source => source.id === view)?.kind === 'file'
  const row = rows.find(row => row.id === view)
  return <section className="import-connections" aria-label="统一导入">
    {view === 'home' ? <>
      <div className="unified-import-title"><Link2 size={15} /><strong>添加日程链接</strong></div>
      <form onSubmit={event => { event.preventDefault(); void connect() }}>
        <label className="visually-hidden" htmlFor="import-address">日历、课表 PDF 或待办链接</label>
        <div className="unified-import-input"><input id="import-address" type="password" autoComplete="off" spellCheck={false} disabled={busy} value={address}
          aria-invalid={invalidAddress || undefined} aria-describedby={visibleError ? 'import-link-feedback' : undefined}
          onBlur={() => { if (address.trim() && !busy) validateAddress() }}
          onChange={event => { setAddress(event.target.value); setError(''); setInvalidAddress(false); setMessage(''); if (links.error) onLinks({ ...links, error: '' }) }} /><button type="submit" disabled={!address.trim() || busy}>{pending ? '读取中' : '添加'}</button></div>
      </form>
      {visibleError && <p id="import-link-feedback" className="unified-import-error google-connection-error" role="alert"><AlertCircle size={12} aria-hidden="true" /><span>{visibleError}</span></p>}
      <button className="calendar-file-entry" disabled={busy} onClick={() => navigate('file')}><FileUp size={15} /><span><strong>导入文件</strong></span><ChevronRight size={13} /></button>
      {authorizing && <div className="google-auth-wait"><span>请在浏览器中完成账号授权…</span><button onClick={() => { void (google.authorizing ? window.focusControls?.cancelGoogle() : window.focusControls?.cancelMicrosoft()) }}>取消</button></div>}
      {message && <p className="unified-import-success" role="status"><Check size={12} />{message}</p>}
      <button className="unified-import-summary" disabled={busy} onClick={() => navigate('manage')}><span><i className={connected ? 'is-connected' : ''} />{connected ? '已连接 ' + connected + ' 个来源' : '尚未连接来源'}</span><span>管理<ChevronRight size={12} /></span></button>
      <details className="unified-more"><summary>通过账号连接</summary><div><button disabled={busy} onClick={() => navigate('google')}>Google 账号</button><button disabled={busy} onClick={() => navigate('microsoft')}>微软账号</button></div></details>
    </> : <>
      <button className="unified-import-back" disabled={busy} onClick={() => navigate(view === 'manage' ? 'home' : 'manage')}><ArrowLeft size={12} />{view === 'manage' ? '返回添加来源' : '返回来源管理'}</button>
      {view === 'manage' ? <div className="unified-source-list">
        <h3>来源管理</h3>
        {rows.length ? rows.map(source => <button key={source.id} onClick={() => navigate(source.id)}><span><strong>{source.name}</strong>{source.error ? <small>需要检查来源</small> : links.sources.find(item => item.id === source.id)?.kind === 'file' ? <small>本地文件</small> : null}</span><ChevronRight size={13} /></button>) : <p>添加链接或导入文件后，来源会出现在这里。</p>}
      </div> : view === 'file' || view.startsWith('file:') ? <CalendarFileImport key={view} initialPdf={linkedPdf} replaceId={view.startsWith('file:') ? view.slice(5) : undefined} onState={onLinks} onDone={navigate} /> : view === 'google' ? <GoogleConnection state={google} onState={onGoogle} /> : view === 'microsoft' ? <MicrosoftTodoConnection state={microsoft} onState={onMicrosoft} /> : selected ? <div className="unified-source-detail">
        <h3>{row?.name || '日历订阅'}</h3>
        {selected.lastSynced && <p>{selectedFile ? '文件导入' : '最近更新'}：{new Date(selected.lastSynced).toLocaleString('zh-CN')}</p>}
        {selectedFile && <p>这是本地文件快照，不会自动同步。学校调课后，重新导出文件并替换此来源。</p>}
        {selected.error && <p className="google-connection-error" role="alert">{selected.error}</p>}
        {selected.importWarnings?.map(warning => <p key={warning} role="status">{warning}</p>)}
        <div className="google-connection-actions">{selectedFile ? <button disabled={busy} onClick={() => navigate('file:' + view)}><FileUp size={12} />替换文件</button> : <button disabled={busy || selected.refreshing} onClick={() => { void feedAction('refresh') }}><RefreshCw size={12} />{selected.refreshing ? '更新中' : '刷新'}</button>}<button disabled={busy || selected.refreshing} onClick={() => { void feedAction('remove') }}>移除来源</button></div>
      </div> : <p>该来源已移除。</p>}
    </>}
    {view !== 'home' && visibleError && <p className="google-connection-error" role="alert">{visibleError}</p>}
  </section>
}
