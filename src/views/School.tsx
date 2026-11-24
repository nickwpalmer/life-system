import { useEffect, useState } from 'preact/hooks'
import { supabase } from '../lib/supabase'
import { getState, useStore, toast } from '../lib/store'
import { today, daysUntil, dayKey, fmtShort, fmtWeekday, inDays } from '../lib/dates'
import { Card } from '../ui/kit'
import { Icon } from '../ui/icons'

/** School: key dates Claude keeps (key_dates), Canvas items and class meetings from the calendar. */
type KeyDate = { id: string; day: string; title: string; course: string | null; kind: 'deadline' | 'exam' | 'term' | 'event'; done: boolean }
type Due = { key: string; day: string; title: string; course: string | null; kind: KeyDate['kind']; from: 'canvas' | 'key'; id?: string; done?: boolean }

const demoDates = (): KeyDate[] => [
  { id: 'k1', day: inDays(3), title: 'Lab report', course: 'ENGR 110', kind: 'deadline', done: false },
  { id: 'k2', day: inDays(9), title: 'Test 3', course: 'MATH 101', kind: 'exam', done: false },
  { id: 'k3', day: inDays(20), title: 'Last day of classes', course: null, kind: 'term', done: false },
]

export function useKeyDates() {
  const [rows, setRows] = useState<KeyDate[] | null>(null)
  useEffect(() => {
    if (getState().demo) { setRows(demoDates()); return }
    supabase.from('key_dates').select('id,day,title,course,kind,done').eq('area_key', 'education').order('day')
      .then(({ data }) => setRows((data ?? []) as KeyDate[]))
  }, [])
  return [rows, setRows] as const
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{5,}/g) ?? [])
const overlaps = (a: string, b: string) => { const w = words(b); return [...words(a)].some((x) => w.has(x)) }
const localDay = (iso: string, allDay: boolean) => allDay ? iso.slice(0, 10) : dayKey(new Date(iso))
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export function SchoolPanel() {
  const events = useStore((s) => s.events)
  const [kd, setKd] = useKeyDates()
  const [showAll, setShowAll] = useState(false)
  const t = today()

  // Canvas assignments (not lesson pages) for the next three weeks.
  const canvas: Due[] = events.filter((e) => e.calendar_name === 'Canvas' && !/^lesson\b/i.test(e.title))
    .map((e) => { const m = e.title.match(/\[([A-Z]+)_?(\d+)?\]\s*$/); return { key: e.id, day: localDay(e.starts_at, e.all_day), title: e.title.replace(/\s*\[[^\]]+\]\s*$/, '').replace(/^HW \| /, 'HW ').trim(), course: m ? `${m[1]}${m[2] ? ' ' + m[2] : ''}` : null, kind: (/test|exam|quiz|final/i.test(e.title) ? 'exam' : 'deadline') as Due['kind'], from: 'canvas' as const } })
    .filter((d) => d.day >= t && daysUntil(d.day) <= 21)
  const mine: Due[] = (kd ?? []).filter((k) => k.kind !== 'term' && k.day >= t).map((k) => ({ key: k.id, id: k.id, day: k.day, title: k.title, course: k.course, kind: k.kind, from: 'key' as const, done: k.done }))
  // A Canvas item that matches one of the key dates (same day, same course, shared word) is the same thing.
  const due = [...mine, ...canvas.filter((c) => !mine.some((k) => k.day === c.day && k.course === c.course && overlaps(k.title, c.title)))]
    .sort((a, b) => a.day.localeCompare(b.day) || (a.kind === 'exam' ? -1 : 1))
  const open = due.filter((d) => !d.done)
  const soon = open.filter((d) => daysUntil(d.day) <= 14)
  const exam = open.find((d) => d.kind === 'exam')
  const termEnd = (kd ?? []).filter((k) => k.kind === 'term' && /last day of classes/i.test(k.title) && k.day >= t)[0]

  // Classes this week, one row per class with its next meeting.
  const nextClass = new Map<string, string>()
  for (const e of events.filter((e) => e.calendar_name === 'Classes' && e.starts_at >= new Date().toISOString() && daysUntil(localDay(e.starts_at, e.all_day)) <= 7).sort((a, b) => a.starts_at.localeCompare(b.starts_at)))
    if (!nextClass.has(e.title)) nextClass.set(e.title, e.starts_at)

  const toggle = async (d: Due) => {
    if (!d.id || !kd) return
    const v = !d.done
    setKd(kd.map((k) => k.id === d.id ? { ...k, done: v } : k))
    if (v) toast(`Done: ${d.title}`)
    if (!getState().demo) { const { error } = await supabase.from('key_dates').update({ done: v }).eq('id', d.id); if (error) toast(`Couldn’t save: ${error.message}`) }
  }

  const shown = showAll ? due : due.filter((d) => daysUntil(d.day) <= 14 || d.kind === 'exam').slice(0, 10)
  return <>
    <div class="stat-row">
      <div class="stat" style="--c:var(--lilac)"><div class="s-val">{soon.length}</div><div class="s-lbl">due in the next 2 weeks</div>{soon[0] && <div class="s-date">next {daysUntil(soon[0].day) === 0 ? 'today' : daysUntil(soon[0].day) === 1 ? 'tomorrow' : `${fmtWeekday(soon[0].day)} ${fmtShort(soon[0].day)}`}</div>}</div>
      <div class="stat" style="--c:var(--pink)"><div class="s-val">{exam ? daysUntil(exam.day) : '–'}</div><div class="s-lbl">{exam ? `days to ${exam.course ? `${exam.course} exam` : exam.title}` : 'no exams set'}</div>{exam && <div class="s-date">{fmtWeekday(exam.day)} {fmtShort(exam.day)}</div>}</div>
      <div class="stat" style="--c:var(--mint)"><div class="s-val">{termEnd ? daysUntil(termEnd.day) : '–'}</div><div class="s-lbl">days of class left</div>{termEnd && <div class="s-date">ends {fmtShort(termEnd.day)}</div>}</div>
    </div>
    <Card title="Due" icon="clock" accent="var(--lilac)" action={due.length > shown.length || showAll ? <button class="link" onClick={() => setShowAll(!showAll)}>{showAll ? 'Less' : 'All'}</button> : undefined}>
      {shown.length ? shown.map((d, i) => <>
        {(i === 0 || shown[i - 1]!.day !== d.day) && <div class="due-day faint tiny">{daysUntil(d.day) === 0 ? 'Today' : daysUntil(d.day) === 1 ? 'Tomorrow' : `${fmtWeekday(d.day)} ${fmtShort(d.day)}`}</div>}
        <div class={`due-row${d.done ? ' done' : ''}`}>
          {d.from === 'key' ? <button class={`check sm${d.done ? " on" : ""}`} aria-label={d.done ? 'Mark not done' : 'Mark done'} onClick={() => toggle(d)}>{d.done && <Icon name="check" size={12} />}</button> : <span class="due-src" title="From Canvas">C</span>}
          <span class="grow"><span>{d.title}</span>{d.kind === 'exam' && <span class="chip small" style="--c:var(--pink);margin-left:6px">Exam</span>}</span>
          {d.course && <span class="faint tiny">{d.course}</span>}
        </div>
      </>) : <p class="empty" style="padding:8px">Nothing due in the next two weeks.</p>}
      {shown.some((d) => d.from === 'canvas') && <p class="faint tiny" style="margin-top:8px">C items come from your Canvas feed, which isn’t always right about calc dates. The rest are dates from your syllabi.</p>}
    </Card>
    {nextClass.size > 0 && <Card title="Classes this week" icon="school">
      {[...nextClass].map(([title, at]) => <div class="row between small fin-row"><span>{title}</span><span class="faint">{fmtWeekday(dayKey(new Date(at)))} {clock(at)}</span></div>)}
    </Card>}
  </>
}
