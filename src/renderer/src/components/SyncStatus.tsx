import { useState } from 'react'
import { AlertCircle, Check, RefreshCw } from 'lucide-react'
export interface SyncSource {
  id: string; name: string; lastSynced: number | null; refreshing: boolean; error: string; reconnectRequired?: boolean
  retry: () => Promise<unknown>
}
export function syncedAgo(stamp: number | null, now: number) {
  if (!stamp) return '尚未成功更新'
  const minutes = Math.max(0, Math.floor((now - stamp) / 60000))
  return minutes < 1 ? '刚刚更新' : minutes < 60 ? minutes + ' 分钟前更新' : minutes < 1440 ? Math.floor(minutes / 60) + ' 小时前更新' : Math.floor(minutes / 1440) + ' 天前更新'
}
export function syncSummary(sources: SyncSource[], now: number) {
  const failures = sources.filter(source => source.error || source.reconnectRequired).length
  if (sources.some(source => source.refreshing)) return '正在更新日程来源'
  if (failures) return failures + ' 个来源需要检查，点击查看'
  if (!sources.length) return '尚未连接日程来源'
  const stamps = sources.map(source => source.lastSynced)
  return stamps.some(stamp => !stamp) ? '部分来源尚未成功更新' : '全部来源 · ' + syncedAgo(Math.min(...stamps as number[]), now)
}
export function SyncStatus({ sources, now, onManage }: { sources: SyncSource[]; now: number; onManage: (id: string) => void }) {
  const [pending, setPending] = useState<string[]>([])
  const [failures, setFailures] = useState<Record<string, string>>({})
  async function retry(source: SyncSource) {
    if (pending.includes(source.id) || source.refreshing) return
    setPending(ids => [...ids, source.id]); setFailures(current => ({ ...current, [source.id]: '' }))
    try { await source.retry() }
    catch { setFailures(current => ({ ...current, [source.id]: '本次更新未完成，请重试或检查连接。' })) }
    finally { setPending(ids => ids.filter(id => id !== source.id)) }
  }
  return <section className="sync-status-panel" aria-label="各来源同步状态"><h3>同步状态</h3>
    {!sources.length && <p>尚未连接日程来源。<button onClick={() => onManage('home')}>添加来源</button></p>}
    {sources.map(source => {
      const busy = source.refreshing || pending.includes(source.id)
      const error = failures[source.id] || source.error
      return <article className={error || source.reconnectRequired ? 'sync-has-error' : ''} key={source.id}>
        <div className="sync-source-heading">{error || source.reconnectRequired ? <AlertCircle size={12} /> : busy ? <RefreshCw size={12} className="is-spinning" /> : <Check size={12} />}<strong title={source.name}>{source.name}</strong></div>
        <small>{busy ? '更新中…' : syncedAgo(source.lastSynced, now)}</small>
        {error && <p role="status">{error}</p>}
        {(error || source.reconnectRequired) && <small>{source.lastSynced ? '当前保留上次成功读取的内容。' : '此来源尚未成功读取内容。'}</small>}
        <div className="sync-source-actions">{!source.reconnectRequired && <button disabled={busy} onClick={() => { void retry(source) }}>{busy ? '更新中' : error ? '重试' : '现在更新'}</button>}<button onClick={() => onManage(source.id)}>{source.reconnectRequired ? '重新连接' : error ? '检查连接' : '管理'}</button></div>
      </article>
    })}
  </section>
}
