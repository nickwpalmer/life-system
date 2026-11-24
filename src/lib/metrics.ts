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
