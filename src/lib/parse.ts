import { addDays, dayKey, inDays } from './dates'
import type { Area } from './types'

const WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function nextWeekday(i: number) {
  const d = new Date(); let n = (i - d.getDay() + 7) % 7; if (n === 0) n = 7
  return dayKey(addDays(d, n))
}

function futureDate(m: number, d: number) {
  const now = new Date(); let y = now.getFullYear()
  const cand = new Date(y, m, d)
  if (cand < addDays(now, -1)) y++
  return dayKey(new Date(y, m, d))
}

export type Parsed = { title: string; due_date: string | null; due_time: string | null; priority: number; area_id: string | null; when: string | null; recurrence: string | null; tag: string | null }

/**
 * Natural quick-add: "calc hw tomorrow 5pm !! #edu".
 * Dates: today, tonight, tomorrow, mon..sun, next week, in 3 days, 12/5, dec 5. Priority: ! / !!. Area: #name.
 * Repeats: daily, every day, weekdays, weekly, every monday, every other week, monthly, yearly.
 * A #word that isn't an area becomes a list tag (#shopping).
 */
export function parseQuick(input: string, areas: Area[], tags: string[] = []): Parsed {
  let s = ` ${input.trim()} `
  let due: string | null = null, time: string | null = null, when: string | null = null, area: string | null = null
  let recurrence: string | null = null, tag: string | null = null
  const priority = /!!/.test(s) ? 3 : /!/.test(s) ? 2 : 0
  s = s.replace(/!+/g, ' ')
  const take = (re: RegExp, f: (m: RegExpMatchArray) => void) => { const m = s.match(re); if (m) { f(m); s = s.replace(re, ' ') } }

  take(/\s#([\w-]+)/i, (m) => {
    const q = m[1].toLowerCase()
    const a = areas.find((x) => x.key.startsWith(q) || x.name.toLowerCase().startsWith(q))
    if (a) area = a.id
    else tag = tags.find((x) => x.toLowerCase() === q) ?? m[1][0].toUpperCase() + m[1].slice(1)
  })
  take(/\s(?:every\s?day|daily)\s/i, () => { recurrence = 'daily' })
  take(/\s(?:every\s)?weekdays?\s/i, () => { recurrence = 'weekdays' })
  take(/\s(?:every other week|every 2 weeks|biweekly)\s/i, () => { recurrence = 'biweekly' })
  take(/\s(?:every\s?week|weekly)\s/i, () => { recurrence = 'weekly' })
  take(/\s(?:every\s?month|monthly)\s/i, () => { recurrence = 'monthly' })
  take(/\s(?:every\s?year|yearly|annually)\s/i, () => { recurrence = 'yearly' })
  take(/\severy\s(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday)?\s/i, (m) => {
    recurrence = 'weekly'; due = nextWeekday(WD.indexOf(m[1].slice(0, 3).toLowerCase())); when = `every ${m[1]}`
  })
  take(/\s(?:at\s)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)\s/i, (m) => {
    let h = Number(m[1]) % 12; if (m[3].toLowerCase() === 'pm') h += 12
    time = `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`
  })
  take(/\s(today|tonight)\s/i, (m) => { due = inDays(0); when = m[1]; if (m[1].toLowerCase() === 'tonight' && !time) time = '20:00' })
  take(/\s(tomorrow|tmrw|tmr)\s/i, () => { due = inDays(1); when = 'tomorrow' })
  take(/\snext week\s/i, () => { due = nextWeekday(1); when = 'next week' })
  take(/\sin (\d{1,3}) days?\s/i, (m) => { due = inDays(Number(m[1])); when = `in ${m[1]} days` })
  take(/\s(?:on\s)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday)?\s/i, (m) => {
    due = nextWeekday(WD.indexOf(m[1].slice(0, 3).toLowerCase())); when = m[1]
  })
  take(/\s(\d{1,2})\/(\d{1,2})\s/, (m) => { due = futureDate(Number(m[1]) - 1, Number(m[2])); when = m[0].trim() })
  take(/\s(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s(\d{1,2})(?:st|nd|rd|th)?\s/i, (m) => {
    due = futureDate(MON.indexOf(m[1].slice(0, 3).toLowerCase()), Number(m[2])); when = m[0].trim()
  })
  const title = s.replace(/\s+/g, ' ').trim()
  if (recurrence && !due) due = inDays(0)
  return { title: title ? title[0].toUpperCase() + title.slice(1) : '', due_date: due, due_time: time, priority, area_id: area, when, recurrence, tag }
}
