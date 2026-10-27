import { useEffect, useState } from 'react'
import { Check, ListTodo, RefreshCw } from 'lucide-react'
import type { SubscriptionSnapshot } from '../../../shared/focus'
import type { MicrosoftTodoState } from '../../../shared/imports'

export function TickTickConnection({ state, onState }: { state: SubscriptionSnapshot; onState: (state: SubscriptionSnapshot) => void }) {
  const [address, setAddress] = useState(''), [pending, setPending] = useState(false), [error, setError] = useState('')
  async function action(kind: 'save' | 'refresh' | 'remove') {
    const api = window.focusControls
    if (!api || pending || state.refreshing) return
    setPending(true); setError('')
    try {
      const value = await (kind === 'save' ? api.saveTickTick(address) : kind === 'refresh' ? api.refreshTickTick() : api.removeTickTick())
      if (value) { onState(value); if (kind === 'save' && !value.error) setAddress('') }
    } catch { setError('TickTick 连接操作未完成，请重试。') }
    finally { setPending(false) }
  }
  return <section className="task-connection" aria-label="TickTick 导入">
    <div className="google-connection-heading"><ListTodo size={14} /><strong>TickTick</strong>{state.configured && <span><Check size={11} />已连接 · 只读</span>}</div>
    <p>在 TickTick 中找到“订阅到其他日历”，将提供的链接粘贴到这里。</p>
    <form onSubmit={event => { event.preventDefault(); void action('save') }}>
      <label htmlFor="ticktick-address">TickTick 日历订阅链接</label>
      <div className="focus-subscription-input"><input id="ticktick-address" type="password" autoComplete="off" value={address} spellCheck={false} placeholder="粘贴 TickTick 订阅链接" onChange={event => setAddress(event.target.value)} /><button disabled={!address.trim() || pending || state.refreshing} type="submit">{pending || state.refreshing ? '读取中' : '连接'}</button></div>
    </form>
    <p className="task-connection-status" role="status">{state.configured ? state.events.length + ' 个时间块 · ' + (state.tasks?.length || 0) + ' 条待办' + (state.lastSynced ? ' · ' + new Date(state.lastSynced).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) + ' 更新' : '') : '和 Google 日历同时显示，不替换原连接。'}</p>
    {state.configured && <div className="google-connection-actions"><button disabled={pending || state.refreshing} onClick={() => { void action('refresh') }}><RefreshCw size={11} />刷新</button><button disabled={pending || state.refreshing} onClick={() => { void action('remove') }}>移除 TickTick</button></div>}
    {(error || state.error) && <p className="google-connection-error" role="alert">{error || state.error}</p>}
    <p className="google-connection-note">只读取链接提供的内容。无时间段的事项放入待办列表；不修改 TickTick。每分钟更新。</p>
  </section>
}

export function MicrosoftTodoConnection({ state, onState }: { state: MicrosoftTodoState; onState: (state: MicrosoftTodoState) => void }) {
  const [clientId, setClientId] = useState(''), [pending, setPending] = useState(false), [error, setError] = useState('')
  const [selection, setSelection] = useState<string[]>([]), [dirty, setDirty] = useState(false)
  useEffect(() => { if (!dirty) setSelection(state.lists.filter(list => list.selected).map(list => list.id)) }, [state.lists, dirty])
  async function action(kind: 'configure' | 'connect' | 'cancel' | 'refresh' | 'select' | 'disconnect') {
    const api = window.focusControls
    if (!api || pending && kind !== 'cancel') return
    if (kind !== 'cancel') setPending(true)
    setError('')
    try {
      const result = await (kind === 'configure' ? api.configureMicrosoft(clientId) : kind === 'connect' ? api.connectMicrosoft() : kind === 'cancel' ? api.cancelMicrosoft()
        : kind === 'refresh' ? api.refreshMicrosoft() : kind === 'select' ? api.selectMicrosoftLists(selection) : api.disconnectMicrosoft())
      if (result) onState(result)
      if (kind === 'select' || kind === 'disconnect') setDirty(false)
      if (kind === 'configure' && result?.configured) setClientId('')
    } catch { setError('微软连接操作未完成，请重试。') }
    finally { if (kind !== 'cancel') setPending(false) }
  }
  const busy = pending || state.refreshing || state.authorizing
  return <section className="task-connection" aria-label="Microsoft To Do 导入">
    <div className="google-connection-heading"><ListTodo size={14} /><strong>Microsoft To Do</strong>{state.connected && <span><Check size={11} />{state.error ? '已授权 · 读取失败' : '已连接 · 只读'}</span>}</div>
    <p>读取微软待办清单，保留任务名称、截止日期和说明。</p>
    {!state.configured ? <>
      <p>此开发版尚未配置微软应用。配置完成后，用户可直接连接账号。</p>
      <details className="google-setup-help"><summary>开发者设置</summary><p>在 Microsoft Entra 注册桌面应用，允许组织和个人账号；回调地址填写 http://localhost/oauth2callback，仅添加 Tasks.Read 委托权限。详细步骤见 IMPORTS_SETUP.md。</p>
        <form onSubmit={event => { event.preventDefault(); void action('configure') }}><label htmlFor="microsoft-client-id">Application (client) ID</label><input id="microsoft-client-id" value={clientId} placeholder="应用 ID，无需客户端密码" autoComplete="off" onChange={event => setClientId(event.target.value)} /><button className="google-connect-button" disabled={!clientId.trim() || busy}>保存应用配置</button></form>
      </details>
    </> : <>
      {state.authorizing ? <div className="google-auth-wait" role="status"><span>请在系统浏览器完成微软授权…</span><button onClick={() => { void action('cancel') }}>取消</button></div>
        : !state.connected || state.reconnectRequired ? <button className="google-connect-button" disabled={busy} onClick={() => { void action('connect') }}>{state.reconnectRequired ? '重新连接微软账号' : '连接 Microsoft To Do'}</button> : null}
      {!state.connected && !state.authorizing && <details className="google-setup-help"><summary>更换开发者应用配置</summary><form onSubmit={event => { event.preventDefault(); void action('configure') }}><input aria-label="微软应用 ID" value={clientId} onChange={event => setClientId(event.target.value)} /><button disabled={busy || !clientId.trim()}>保存</button></form></details>}
      {state.connected && <>
        <div className="google-calendar-list" aria-label="选择微软待办清单">{state.lists.map(list => <label key={list.id}><input type="checkbox" disabled={busy} checked={selection.includes(list.id)} onChange={event => { setDirty(true); setSelection(current => event.target.checked ? [...current, list.id] : current.filter(id => id !== list.id)) }} /><span>{list.name}</span></label>)}</div>
        <div className="google-connection-actions"><button disabled={busy || !dirty || selection.length > 20} onClick={() => { void action('select') }}>同步所选清单</button><button disabled={busy} onClick={() => { void action('refresh') }}><RefreshCw size={11} />刷新</button></div>
        <p className="task-connection-status" role="status">{state.refreshing ? '正在读取待办…' : state.error && !state.lastSynced ? '尚未成功读取待办' : (state.error ? '显示上次读取的 ' : '') + state.tasks.length + ' 条未完成任务'}{dirty ? ' · 选择尚未同步' : ''}{selection.length > 20 ? ' · 最多选择 20 个清单' : ''}</p>
        <button className="google-secondary" disabled={busy} onClick={() => { void action('disconnect') }}>断开微软账号</button>
      </>}
    </>}
    {(error || state.error) && <p className="google-connection-error" role="alert">{error || state.error}</p>}
    <p className="google-connection-note">任务先显示在待办列表，点击“安排时间”可创建本机日程。不会修改或完成微软任务。</p>
  </section>
}
