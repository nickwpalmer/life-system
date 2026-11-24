// All "days" are the device's local calendar day (Nick's phone runs on Detroit time).

export const pad = (n: number) => String(n).padStart(2, '0')

export const dayKey = (d: Date = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const today = () => dayKey()

export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

export const startOfDay = (d: Date = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

export const fromKey = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }

export const lastNDays = (n: number) => {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(addDays(new Date(), -i)))
  return out
}

export const partOfDay = (d: Date = new Date()) => {
  const h = d.getHours()
  if (h < 5) return 'night'
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  if (h < 21) return 'evening'
  return 'night'
}

/** Morning check-in window 4am to 2pm; night check-in from 6pm. */
export const checkinKindNow = (d: Date = new Date()): 'morning' | 'night' | null => {
  const h = d.getHours()
  if (h >= 4 && h < 14) return 'morning'
  if (h >= 18 || h < 4) return 'night'
  return null
}

/** The night check-in after midnight still belongs to the day that just ended. */
export const checkinDay = (kind: 'morning' | 'night', d: Date = new Date()) =>
  kind === 'night' && d.getHours() < 4 ? dayKey(addDays(d, -1)) : dayKey(d)

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export const fmtDay = (k: string) => {
  const t = today()
  if (k === t) return 'Today'
  if (k === dayKey(addDays(new Date(), 1))) return 'Tomorrow'
  if (k === dayKey(addDays(new Date(), -1))) return 'Yesterday'
  return fromKey(k).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

export const fmtLongDate = (d: Date = new Date()) =>
  d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })

export const relTime = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return fmtDay(dayKey(new Date(iso)))
}

/** Monday of the week containing d. */
export const weekStart = (d: Date = new Date()) => { const x = startOfDay(d); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd) }

export const daysBetween = (a: string, b: string) => Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86400000)

export const daysUntil = (k: string) => daysBetween(today(), k)

export const fmtShort = (k: string) => fromKey(k).toLocaleDateString([], { month: 'short', day: 'numeric' })

export const fmtWeekday = (k: string) => fromKey(k).toLocaleDateString([], { weekday: 'short' })

export const inDays = (n: number) => dayKey(addDays(new Date(), n))

export const fmtClock = (t: string | null | undefined) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const d = new Date(); d.setHours(h, m, 0, 0)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
