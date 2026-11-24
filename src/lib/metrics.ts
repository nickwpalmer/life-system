import type { Log, Metric } from './types'
import { dayKey } from './dates'

/** How a metric's logs roll up into one number per day. */
export function aggMode(m: Metric): 'sum' | 'avg' | 'max' | 'last' {
  if (m.kind === 'boolean') return 'max'
  if (m.kind === 'count' || m.kind === 'duration') return 'sum'
  if (m.kind === 'number' && m.unit === '$') return 'sum'
  if (m.kind === 'scale') return 'avg'
  return 'last'
}

export function dailySeries(m: Metric, logs: Log[], days: string[]) {
  const byDay = new Map<string, number[]>()
  for (const l of logs) {
    if (l.metric_id !== m.id || l.value_num == null) continue
    const k = dayKey(new Date(l.occurred_at))
    const arr = byDay.get(k) ?? []
    arr.push(Number(l.value_num))
    byDay.set(k, arr)
  }
  const mode = aggMode(m)
  return days.map((d) => {
    const v = byDay.get(d)
    if (!v?.length) return null
    if (mode === 'sum') return v.reduce((a, b) => a + b, 0)
    if (mode === 'max') return Math.max(...v)
    if (mode === 'avg') return v.reduce((a, b) => a + b, 0) / v.length
    return v[0] // logs arrive newest first
  })
}

/** Consecutive days (ending today, or yesterday if today isn't logged yet) with a value. */
export function streak(series: (number | null)[]) {
  let i = series.length - 1
  if (series[i] == null) i--
  let n = 0
  for (; i >= 0 && series[i] != null && series[i]! > 0; i--) n++
  return n
}

export function fmtValue(m: Metric, v: number | null | undefined) {
  if (v == null) return '–'
  const r = Math.round(v * 10) / 10
  if (m.kind === 'boolean') return v ? 'Done' : '–'
  if (m.unit === '$') return `$${r % 1 ? r.toFixed(2) : r}`
  if (m.kind === 'duration' && m.unit === 'min' && r >= 60) return `${Math.floor(r / 60)}h ${Math.round(r % 60)}m`
  return m.unit ? `${r} ${m.unit}` : String(r)
}

/** One-tap metrics log a fixed value; the rest open the log sheet. */
export const isOneTap = (m: Metric) => m.kind === 'count' || m.kind === 'boolean'

/** Preset buttons in the log sheet so most entries are a single tap. */
export function presets(m: Metric): number[] {
  if (m.kind === 'scale') return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  if (m.kind === 'duration' && m.unit === 'h') return [5, 6, 6.5, 7, 7.5, 8, 9]
  if (m.kind === 'duration') return [5, 10, 15, 20, 30, 45, 60, 90]
  if (m.kind === 'count') return [1, 2, 3, 4, 5]
  if (m.unit === '$') return [5, 10, 20, 50, 100]
  return []
}

export const ROLE_LABEL: Record<string, string> = {
  habit: 'Habits', vice: 'Vices', health: 'Body', track: 'Tracking',
}

/** Day total for one tracker on one day. */
export const dayValue = (m: Metric, logs: Log[], day: string) => dailySeries(m, logs, [day])[0]

/** "Never miss twice": days in the window with a value, and whether the last two days both missed. */
export function consistency(series: (number | null)[]) {
  const hit = series.filter((v) => v != null && v > 0).length
  const n = series.length
  const lastTwoMissed = n >= 2 && !(series[n - 1]! > 0) && !(series[n - 2]! > 0)
  return { hit, n, pct: n ? hit / n : 0, lastTwoMissed }
}

/** Groups for the daily log, in the order Nick fills it at night. */
export const LOG_GROUPS: { key: string; label: string; color: string; test: (m: Metric) => boolean }[] = [
  { key: 'mind', label: 'Mind', color: 'var(--pink)', test: (m) => m.kind === 'scale' },
  { key: 'body', label: 'Body', color: 'var(--mint)', test: (m) => m.role === 'health' },
  { key: 'habits', label: 'Habits', color: 'var(--violet)', test: (m) => m.role === 'habit' },
  { key: 'vices', label: 'Vices', color: 'var(--coral)', test: (m) => m.role === 'vice' },
  { key: 'money', label: 'Money', color: 'var(--gold)', test: (m) => m.unit === '$' },
  { key: 'other', label: 'Other', color: 'var(--sky)', test: () => true },
]

export function groupOf(m: Metric) { return LOG_GROUPS.find((g) => g.test(m))!.key }
