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
  if (timedOut) return '读取超时，请检查网络后重试。'
  if (error instanceof CalendarImportError) {
    switch (error.code) {
      case 'invalid-url': return '链接格式不正确，请使用完整的 HTTPS 或 webcal 地址。'
      case 'page-url': return '这是日历网页链接。请复制 Google 日历设置 → 整合日历 →「iCal 格式的私密网址」。'
      case 'http': {
        if (error.detail === '401' || error.detail === '403') return '链接需要登录或没有访问权限，请使用可直接读取的链接，或导入文件。'
        if (error.detail === '404' || error.detail === '410') return '链接不存在或已失效，请检查地址，或重新获取链接。'
        if (error.detail === '429') return '来源暂时限制访问，请稍后重试。'
        return '来源服务暂时不可用，请稍后重试。'
      }
      case 'html': return '这是网页链接，当前不支持直接读取教务网页。请使用 ICS / PDF 链接或文件导入。'
      case 'format': return '暂不支持这个链接的内容，请使用 ICS 日历或 PDF 文件的直接链接。'
      case 'parse': return '文件已读取，但日历内容无法解析，请重新导出后重试。'
      case 'recurrence': return '日历包含每秒或每分钟重复的安排，目前无法读取这类日历。'
      case 'events': return '近期安排超过 5000 条，目前无法读取这类日历。'
      case 'size': return error.detail === 'pdf' ? 'PDF 文件超过 20 MB，请导出只包含课表的 PDF。' : '日历文件超过 8 MB，目前无法读取这类日历。'
      case 'redirect': return '链接跳转异常，请重新获取来源提供的直接链接。'
      case 'storage': return '日历已读取，但无法加密保存到本机，请检查本机存储权限后重试。'
    }
  }
  const value = error as { message?: unknown; code?: unknown; cause?: { code?: unknown } } | null
  const raw = [value?.code, value?.cause?.code, value?.message].filter(item => typeof item === 'string').join(' ')
  if (/\b(?:ERR_NAME_NOT_RESOLVED|ENOTFOUND)\b/.test(raw)) return '找不到这个网站，请检查网址是否拼写正确。'
  if (/\b(?:ERR_CERT_[A-Z_]+|ERR_SSL_[A-Z_]+)\b/.test(raw)) return '无法安全连接这个网站，请检查链接或改用文件导入。'
  return '暂时无法连接这个网站，请检查网络或稍后重试。'
}
