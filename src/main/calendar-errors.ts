export type CalendarErrorCode = 'invalid-url' | 'page-url' | 'http' | 'html' | 'format' | 'parse' | 'recurrence' | 'events' | 'size' | 'redirect' | 'storage' | 'network' | 'timeout'

export class CalendarImportError extends Error {
  readonly code: CalendarErrorCode
  readonly detail: string
  constructor(code: CalendarErrorCode, detail = '') {
    super(code)
    this.code = code
    this.detail = detail
  }
}

// Only controlled error codes may reach the UI. Network errors can contain a private feed address.
export function calendarErrorMessage(error: unknown, timedOut: boolean): string {
  if (timedOut) return '连接超时。请确认当前网络能够访问 Google 日历；如果使用代理，请开启系统代理后重试。'
  if (error instanceof CalendarImportError) {
    switch (error.code) {
      case 'invalid-url': return '请粘贴完整的 HTTPS 或 webcal 日历订阅链接。'
      case 'page-url': return '这是日历网页链接。请复制 Google 日历设置 → 整合日历 →「iCal 格式的私密网址」。'
      case 'http': {
        if (error.detail === '401' || error.detail === '403') return '日历服务拒绝访问（HTTP ' + error.detail + '）。请重新复制「iCal 格式的私密网址」；不要使用需要登录的网页地址。'
        if (error.detail === '404' || error.detail === '410') return '订阅地址已失效或不存在（HTTP ' + error.detail + '）。请在 Google 日历设置中重新复制私密网址。'
        if (error.detail === '429') return '日历服务暂时限制访问（HTTP 429），请稍后重试。'
        return '日历服务返回错误（HTTP ' + error.detail + '），请稍后重试。'
      }
      case 'html': return '链接返回了网页或登录页面。请使用「iCal 格式的私密网址」，不是浏览器地址栏中的链接。'
      case 'format': return '下载内容不是有效的日历文件，请重新复制完整的 iCal 订阅网址。'
      case 'parse': return '日历已下载，但其中的日期或重复规则无法解析。请反馈此提示以便继续排查。'
      case 'recurrence': return '日历包含每秒或每分钟重复的安排，目前无法读取这类日历。'
      case 'events': return '近期安排超过 5000 条，目前无法读取这类日历。'
      case 'size': return '日历文件超过 8 MB，目前无法读取这类日历。'
      case 'redirect': return '订阅地址的跳转异常，请重新复制原始的 iCal 网址。'
      case 'storage': return '日历已读取，但无法加密保存到本机，请检查本机存储权限后重试。'
    }
  }
  const value = error as { message?: unknown; code?: unknown; cause?: { code?: unknown } } | null
  const raw = [value?.code, value?.cause?.code, value?.message].filter(item => typeof item === 'string').join(' ')
  const code = raw.match(/\b(?:ERR_[A-Z_]+|E(?:CONNRESET|CONNREFUSED|NOTFOUND|HOSTUNREACH|NETUNREACH|TIMEDOUT)|UND_ERR_[A-Z_]+)\b/)?.[0]
  return '无法连接日历服务' + (code ? '（' + code + '）' : '') + '。请检查网络；如果使用代理，请开启系统代理后重试。'
}
