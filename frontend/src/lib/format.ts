const dateFmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
const shortFmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' })
const weekdayFmt = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
const timeFmt = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' })

/** Parseert 'YYYY-MM-DD' als lokale datum (zonder tijdzoneverschuiving). */
export function parseDate(value: string | Date): Date {
  if (value instanceof Date) return value
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(value)
}

export const formatDate = (v: string | Date) => dateFmt.format(parseDate(v))
export const formatShortDate = (v: string | Date) => shortFmt.format(parseDate(v))
export const formatWeekday = (v: string | Date) => weekdayFmt.format(parseDate(v))
export const formatTime = (v: string | Date) => timeFmt.format(parseDate(v))

export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} u ${m} min` : `${h} u`
}

/** "over 3 dagen", "vandaag", "2 dagen geleden" */
export function relativeDays(value: string): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = parseDate(value)
  target.setHours(0, 0, 0, 0)
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (diff === 0) return 'vandaag'
  if (diff === 1) return 'morgen'
  if (diff === -1) return 'gisteren'
  return diff > 0 ? `over ${diff} dagen` : `${-diff} dagen geleden`
}

export const percent = (fraction: number) => `${Math.round(fraction * 100)}%`

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
