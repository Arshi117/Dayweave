function calendarText(value: unknown, limit: number): string {
  const raw = typeof value === 'string' ? value : value && typeof value === 'object' && 'val' in value ? value.val : ''
  return typeof raw === 'string' ? raw.replace(/\r\n?/g, '\n').trim().slice(0, limit) : ''
}

// Allocate-style feeds put the subject identity, activity and group in the first
// description line, while SUMMARY contains only an abbreviated subject name.
export function timetableEventDetails(summary: unknown, descriptionValue: unknown, locationValue: unknown) {
  const sourceTitle = calendarText(summary, 300) || '未命名日程'
  const description = calendarText(descriptionValue, 12000)
  const location = calendarText(locationValue, 2000)
  const firstLine = description.split('\n', 1)[0]
  const course = /^([A-Z]{2,6}\d{3,6})(?:_[A-Z0-9-]+){2,}\s*,\s*([^,\n]{1,60})\s*,\s*([^,\n]{1,30})$/i.exec(firstLine)
  const title = course ? course[1].toUpperCase() + ' · ' + course[2].trim() + ' ' + course[3].trim() : sourceTitle
  return { title, sourceTitle: title !== sourceTitle ? sourceTitle : undefined, description: description || undefined, location: location || undefined }
}
