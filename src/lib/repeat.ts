import { addDays, dayKey, fromKey, today } from './dates'

/** How a task repeats. Stored in tasks.recurrence. */
export const REPEATS: [string, string][] = [
  ['daily', 'Every day'], ['weekdays', 'Weekdays'], ['weekly', 'Every week'],
  ['biweekly', 'Every 2 weeks'], ['monthly', 'Every month'], ['yearly', 'Every year'],
]
export const repeatLabel = (r: string | null | undefined) => REPEATS.find(([k]) => k === r)?.[1] ?? null

/** The next due day after `from` (a YYYY-MM-DD) for a repeat rule. Never earlier than tomorrow. */
export function nextDue(rule: string, from: string | null): string {
  const t = today()
  const base = fromKey(from ?? t)
  const step = (d: Date): Date => {
    switch (rule) {
      case 'daily': return addDays(d, 1)
      case 'weekdays': { let n = addDays(d, 1); while (n.getDay() === 0 || n.getDay() === 6) n = addDays(n, 1); return n }
      case 'weekly': return addDays(d, 7)
      case 'biweekly': return addDays(d, 14)
      case 'monthly': { const n = new Date(d.getFullYear(), d.getMonth() + 1, 1); n.setDate(Math.min(d.getDate(), new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate())); return n }
      case 'yearly': return new Date(d.getFullYear() + 1, d.getMonth(), d.getDate())
      default: return addDays(d, 1)
    }
  }
  let n = step(base)
  // Finishing late skips the missed days, so the next one lands in the future, like TickTick.
  let guard = 0
  while (dayKey(n) <= t && guard++ < 1000) n = step(n)
  return dayKey(n)
}

/** A checklist in the notes starts fresh on the next copy. */
export const resetChecklist = (notes: string | null) => notes ? notes.replace(/^- \[x\]/gim, '- [ ]') : notes
