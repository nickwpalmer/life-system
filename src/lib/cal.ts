import type { CalEvent, Person } from './types'
import { dayKey, today, daysBetween, fromKey } from './dates'

const COLORS = ['var(--sky)', 'var(--violet)', 'var(--mint)', 'var(--orange)', 'var(--pink)', 'var(--gold)', 'var(--teal)', 'var(--coral)']
const seen = new Map<string, string>()
/** A steady color per calendar, so "School" is always the same color. */
export function calColor(name: string | null) {
  const k = name ?? ''
  if (!seen.has(k)) { let h = 0; for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0; seen.set(k, COLORS[h % COLORS.length]) }
  return seen.get(k)!
}

/** All-day events are stored as UTC midnight dates; read them as plain dates. */
export const eventDay = (e: CalEvent) => e.all_day ? e.starts_at.slice(0, 10) : dayKey(new Date(e.starts_at))

export function eventsOn(events: CalEvent[], day: string) {
  return events.filter((e) => {
    if (!e.all_day) return eventDay(e) === day
    const s = e.starts_at.slice(0, 10), en = e.ends_at ? e.ends_at.slice(0, 10) : s
    return day >= s && (day < en || day === s)
  }).sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.starts_at.localeCompare(b.starts_at))
}

/** Next birthday as a day key, from 'YYYY-MM-DD' or 'MM-DD'. */
export function nextBirthday(p: Person) {
  if (!p.birthday) return null
  const md = p.birthday.length > 5 ? p.birthday.slice(5) : p.birthday
  const y = new Date().getFullYear()
  let k = `${y}-${md}`
  if (k < today()) k = `${y + 1}-${md}`
  return k
}
export const turning = (p: Person, on: string) => p.birthday && p.birthday.length > 5 ? fromKey(on).getFullYear() - Number(p.birthday.slice(0, 4)) : null
export const daysSince = (k: string | null) => k ? daysBetween(k, today()) : null
