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
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  const [selection, setSelection] = useState<string[]>([]), [dirty, setDirty] = useState(false)
  useEffect(() => { if (!dirty) setSelection(state.lists.filter(list => list.selected).map(list => list.id)) }, [state.lists, dirty])
  async function action(kind: 'connect' | 'cancel' | 'refresh' | 'select') {
    const api = window.focusControls
    if (!api || pending && kind !== 'cancel') return
    if (kind !== 'cancel') setPending(true)
    setError('')
    try {
      const result = await (kind === 'connect' ? api.connectMicrosoft() : kind === 'cancel' ? api.cancelMicrosoft()
        : kind === 'refresh' ? api.refreshMicrosoft() : api.selectMicrosoftLists(selection))
      if (result) onState(result)
      if (kind === 'select' && !result?.error) setDirty(false)
    } catch { setError('微软连接操作未完成，请重试。') }
    finally { if (kind !== 'cancel') setPending(false) }
  }
  const busy = pending || state.refreshing || state.authorizing
  const visibleError = error || state.error || (!state.configured ? '此版本暂时无法连接微软账号，请更新应用。' : selection.length > 20 ? '最多选择 20 个清单。' : '')
  return <section className="task-connection" aria-label="Microsoft To Do 导入">
    <div className="google-connection-heading"><ListTodo size={14} /><strong>Microsoft To Do</strong>{state.connected && <span><Check size={11} />{state.error ? '已授权 · 读取失败' : '已连接 · 只读'}</span>}</div>
      {state.authorizing ? <div className="google-auth-wait" role="status"><span>请在系统浏览器完成微软授权…</span><button onClick={() => { void action('cancel') }}>取消</button></div>
        : !state.connected || state.reconnectRequired ? <button className="google-connect-button" disabled={busy || !state.configured} onClick={() => { void action('connect') }}>{state.reconnectRequired ? '重新连接微软账号' : '连接 Microsoft To Do'}</button> : null}
      {state.connected && <>
        <div className="google-calendar-list" aria-label="选择微软待办清单">{state.lists.map(list => <label key={list.id}><input type="checkbox" disabled={busy} checked={selection.includes(list.id)} onChange={event => { setDirty(true); setSelection(current => event.target.checked ? [...current, list.id] : current.filter(id => id !== list.id)) }} /><span>{list.name}</span></label>)}</div>
        <div className="google-connection-actions"><button disabled={busy || !dirty || selection.length > 20} onClick={() => { void action('select') }}>同步所选清单</button><button disabled={busy} onClick={() => { void action('refresh') }}><RefreshCw size={11} />刷新</button></div>
      </>}
    {visibleError && <p className="google-connection-error" role="alert">{visibleError}</p>}
  </section>
}
