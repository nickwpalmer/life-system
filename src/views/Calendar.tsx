import { useState } from 'preact/hooks'
import { useStore } from '../lib/store'
import { today, dayKey, addDays, fromKey, fmtTime, fmtDay, weekStart, relTime, lastNDays } from '../lib/dates'
import { eventsOn, eventDay, calColor } from '../lib/cal'
import { usePrefs, savePrefs, calRole, type CalRole, type Prefs } from '../lib/prefs'
import type { CalEvent } from '../lib/types'
import { Icon } from '../ui/icons'
import { PageHead, Card, Sheet } from '../ui/kit'
import { BarChart } from '../ui/charts'
import { openTask, TaskRow, TaskSheet } from './Tasks'
import { SchoolPanel } from './School'

/** Calendar: week and month, plus focused views for work, school and free time. Google Calendar stays the source. */
type Mode = 'week' | 'month' | 'work' | 'school' | 'free'
const LAYERS: [CalRole, string, string][] = [
  ['personal', 'Personal', 'var(--sky)'], ['work', 'Work', 'var(--gold)'], ['classes', 'Classes', 'var(--lilac)'],
  ['assignments', 'Assignments', 'var(--pink)'], ['important', 'Time blocks', 'var(--orange)'],
]
const isExam = (e: CalEvent) => /\b(exam|test|quiz|final|midterm)\b/i.test(e.title)
const hoursOf = (e: CalEvent) => e.all_day || !e.ends_at ? 0 : Math.max(0, (new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime()) / 3600e3)
const fmtH = (h: number) => `${Math.round(h * 10) / 10}h`
const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString()}`

/**
 * Travel around a day's blocks: one trip there before the first block and one back after the last,
 * for class days and for shifts (minutes each way come from Settings). Nothing is added to Google Calendar.
 */
function travelOn(all: CalEvent[], p: Prefs, d: string): [number, number][] {
  const out: [number, number][] = []
  for (const [role, mins] of [['classes', p.commute.school], ['work', p.commute.work]] as const) {
    if (!mins) continue
    const ev = eventsOn(all, d).filter((e) => !e.all_day && e.ends_at && calRole(p, e.calendar_name) === role)
    if (!ev.length) continue
    const s = Math.min(...ev.map((e) => new Date(e.starts_at).getTime())), e = Math.max(...ev.map((e) => new Date(e.ends_at!).getTime()))
    out.push([s - mins * 60e3, s], [e, e + mins * 60e3])
  }
  return out
}
/** Hours covered by a set of intervals, overlaps counted once. */
function union(iv: [number, number][]) {
  let total = 0, cur: [number, number] | null = null
  for (const [s, e] of [...iv].sort((a, b) => a[0] - b[0])) { if (!cur || s > cur[1]) { if (cur) total += cur[1] - cur[0]; cur = [s, e] } else cur[1] = Math.max(cur[1], e) }
  if (cur) total += cur[1] - cur[0]
  return total / 3600e3
}
const leaveBy = (iso: string, mins: number) => fmtTime(new Date(new Date(iso).getTime() - mins * 60e3).toISOString())

/** Events on the layers you have switched on. Exams always show, even when assignments are hidden.
 * (The 'important' role key is kept for saved settings; on screen it is "Time blocks", the calendar you plan your time on.) */
function useVisible() {
  const events = useStore((s) => s.events)
  const p = usePrefs()
  return { p, all: events, shown: events.filter((e) => p.cal[calRole(p, e.calendar_name)] || (calRole(p, e.calendar_name) === 'assignments' && isExam(e))) }
}

function Layers({ p, names }: { p: Prefs; names: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div class="chips scroll" style="margin-bottom:12px">
        {LAYERS.map(([k, l, c]) => <button class={`chip small ${p.cal[k] ? 'on' : ''}`} style={`--c:${c}`} onClick={() => savePrefs({ cal: { ...p.cal, [k]: !p.cal[k] } })}>{l}</button>)}
        <button class="chip small" onClick={() => setOpen(true)} aria-label="Which calendar is which"><Icon name="sliders" size={14} /></button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Your calendars">
        <p class="muted small" style="margin-bottom:12px">Tell the app what each Google calendar is, so Work, School and the layer switches pick the right events.</p>
        {names.map((n) => (
          <div style="padding:8px 0;border-bottom:1px solid var(--line)">
            <div class="row" style="margin-bottom:8px"><i class="dot" style={`background:${calColor(n)}`} />{n}</div>
            <div class="chips">{LAYERS.map(([k, l, c]) => <button class={`chip small ${calRole(p, n) === k ? 'on' : ''}`} style={`--c:${c}`} onClick={() => savePrefs({ calRoles: { ...p.calRoles, [n]: k } })}>{l}</button>)}</div>
          </div>
        ))}
      </Sheet>
    </>
  )
}

function DayCard({ day, events }: { day: string; events: CalEvent[] }) {
  const tasks = useStore((s) => s.tasks).filter((t) => openTask(t) && t.due_date === day)
  const list = eventsOn(events, day)
  return (
    <Card title={fmtDay(day)} icon="calday" accent="var(--sky)">
      {list.length ? list.map((e) => (
        <div class="event" style={`--c:${calColor(e.calendar_name)}`}>
          <span class="when">{e.all_day ? 'All day' : <>{fmtTime(e.starts_at)}{e.ends_at && <div class="faint tiny">{fmtTime(e.ends_at)}</div>}</>}</span><span class="bar-v" />
          <span class="grow"><div class="e-t">{e.title}</div>{e.location && <div class="faint small">{e.location}</div>}<div class="faint tiny">{e.calendar_name}</div></span>
        </div>
      )) : <p class="empty" style="padding:8px">Nothing on the calendar.</p>}
      {tasks.length > 0 && <><div class="group-h">Tasks due</div>{tasks.map((t) => <div class="row" style="padding:6px 0"><Icon name="tasks" size={16} />{t.title}</div>)}</>}
    </Card>
  )
}

function Week({ events }: { events: CalEvent[] }) {
  const tasks = useStore((s) => s.tasks)
  const [offset, setOffset] = useState(0)
  const [sel, setSel] = useState(today())
  const start = addDays(weekStart(), offset * 7)
  const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(start, i)))
  const shift = (n: number) => { setOffset(offset + n); setSel(dayKey(addDays(fromKey(sel), n * 7))) }
  return (
    <>
      <Nav label={`${fromKey(days[0]).toLocaleDateString([], { month: 'short', day: 'numeric' })} to ${fromKey(days[6]).toLocaleDateString([], { month: 'short', day: 'numeric' })}`} onPrev={() => shift(-1)} onNext={() => shift(1)} onToday={offset ? () => { setOffset(0); setSel(today()) } : undefined} />
      <div class="days phone-only">
        {days.map((d) => { const ev = eventsOn(events, d); return (
          <button class={`${d === sel ? 'on' : ''} ${d === today() ? 'today' : ''}`} onClick={() => setSel(d)}>
            <div class="wd">{fromKey(d).toLocaleDateString([], { weekday: 'narrow' })}</div><div class="dn">{fromKey(d).getDate()}</div>
            <div class="pips">{ev.slice(0, 3).map((e) => <i style={`--c:${calColor(e.calendar_name)}`} />)}</div>
          </button>
        ) })}
      </div>
      <div class="week-cols" style="margin-bottom:14px">
        {days.map((d) => (
          <div class={`col ${d === today() ? 'today' : ''}`}>
            <h3>{fromKey(d).toLocaleDateString([], { weekday: 'short', day: 'numeric' })}</h3>
            {eventsOn(events, d).map((e) => <div class="ev" style={`--c:${calColor(e.calendar_name)}`}><div class="t">{e.all_day ? 'All day' : fmtTime(e.starts_at)}</div>{e.title}</div>)}
            {tasks.filter((t) => openTask(t) && t.due_date === d).map((t) => <div class="ev" style="--c:var(--violet);background:transparent;border-left-style:dashed"><div class="t">Task</div>{t.title}</div>)}
          </div>
        ))}
      </div>
      <div class="phone-only"><DayCard day={sel} events={events} /></div>
    </>
  )
}

function Nav({ label, onPrev, onNext, onToday }: { label: string; onPrev: () => void; onNext: () => void; onToday?: () => void }) {
  return (
    <div class="row between" style="margin:0 2px 12px">
      <button class="icon-btn sm" aria-label="Previous" onClick={onPrev}><Icon name="back" size={17} /></button>
      <span class="row" style="gap:8px"><b>{label}</b>{onToday && <button class="btn sm" onClick={onToday}>Today</button>}</span>
      <button class="icon-btn sm" aria-label="Next" onClick={onNext}><Icon name="chev" size={17} /></button>
    </div>
  )
}

function Month({ events }: { events: CalEvent[] }) {
  const tasks = useStore((s) => s.tasks)
  const [m, setM] = useState(0)
  const [sel, setSel] = useState(today())
  const first = new Date(); first.setDate(1); first.setMonth(first.getMonth() + m); first.setHours(0, 0, 0, 0)
  const start = weekStart(first)
  const month = first.getMonth()
  const cells = Array.from({ length: 42 }, (_, i) => dayKey(addDays(start, i)))
  const rows = cells.slice(35).every((d) => fromKey(d).getMonth() !== month) ? cells.slice(0, 35) : cells
  const t = today()
  return (
    <>
      <Nav label={first.toLocaleDateString([], { month: 'long', year: 'numeric' })} onPrev={() => setM(m - 1)} onNext={() => setM(m + 1)} onToday={m ? () => { setM(0); setSel(t) } : undefined} />
      <section class="card month">
        <div class="weekhead">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => <span>{d}</span>)}</div>
        <div class="mgrid">
          {rows.map((d) => {
            const ev = eventsOn(events, d)
            const due = tasks.some((x) => openTask(x) && x.due_date === d)
            return (
              <button class={`mcell ${fromKey(d).getMonth() !== month ? 'out' : ''} ${d === t ? 'today' : ''} ${d === sel ? 'on' : ''}`} onClick={() => setSel(d)}>
                <span class="mn">{fromKey(d).getDate()}</span>
                <span class="mev">{ev.slice(0, 2).map((e) => <i class="ellipsis" style={`--c:${calColor(e.calendar_name)}`}>{e.title}</i>)}</span>
                <span class="pips">{ev.slice(2, 5).map((e) => <i style={`--c:${calColor(e.calendar_name)}`} />)}{due && <i style="--c:var(--violet)" />}</span>
              </button>
            )
          })}
        </div>
      </section>
      <DayCard day={sel} events={events} />
    </>
  )
}

function Work({ all }: { all: CalEvent[] }) {
  const p = usePrefs()
  const tasks = useStore((s) => s.tasks)
  const areas = useStore((s) => s.areas)
  const [open, setOpen] = useState<import('../lib/types').Task | null>(null)
  const work = all.filter((e) => calRole(p, e.calendar_name) === 'work')
  const wa = areas.find((a) => a.key === 'work')
  const wTasks = tasks.filter((t) => openTask(t) && t.area_id === wa?.id).sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9'))
  const ws = weekStart(), t = today()
  const inRange = (e: CalEvent, a: Date, b: Date) => { const s = new Date(e.starts_at); return s >= a && s < b }
  const sum = (a: Date, b: Date) => work.filter((e) => inRange(e, a, b)).reduce((x, e) => x + hoursOf(e), 0)
  const m0 = new Date(); m0.setDate(1); m0.setHours(0, 0, 0, 0)
  const m1 = new Date(m0); m1.setMonth(m1.getMonth() + 1)
  const thisWeek = sum(ws, addDays(ws, 7)), nextWeek = sum(addDays(ws, 7), addDays(ws, 14)), thisMonth = sum(m0, m1)
  const weeks = Array.from({ length: 8 }, (_, i) => dayKey(addDays(ws, 7 * (i - 4))))
  const weekly = weeks.map((w) => sum(fromKey(w), addDays(fromKey(w), 7)))
  const upcoming = work.filter((e) => eventDay(e) >= t).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 8)
  const perHour = (p.pay.rate ?? 0) + (p.pay.tips ?? 0)
  const tripsIn = (a: Date, b: Date) => new Set(work.filter((e) => inRange(e, a, b) && !e.all_day).map(eventDay)).size
  const driveWeek = tripsIn(ws, addDays(ws, 7)) * 2 * p.commute.work / 60
  if (!work.length && !wTasks.length) return <div class="card soft"><p class="muted">No work calendar yet. Tap the sliders button above and mark which Google calendar holds your shifts.</p></div>
  return (
    <>
      <div class="stats3">
        <div><b>{fmtH(thisWeek)}</b><span>this week</span></div>
        <div><b>{fmtH(nextWeek)}</b><span>next week</span></div>
        <div><b>{fmtH(thisMonth)}</b><span>{m0.toLocaleDateString([], { month: 'long' })}</span></div>
      </div>
      <PayCard p={p} week={thisWeek} next={nextWeek} month={thisMonth} perHour={perHour} drive={driveWeek} />
      <Card title="Shifts" icon="cal" accent="var(--gold)">
        {upcoming.length ? upcoming.map((e) => (
          <div class="event" style="--c:var(--gold)"><span class="when">{fmtDay(eventDay(e)).replace(/,.*/, '')}<div class="faint tiny">{fmtTime(e.starts_at)}</div></span><span class="bar-v" /><span class="grow"><div class="e-t">{e.title}</div><div class="faint tiny">{fmtTime(e.starts_at)} to {e.ends_at ? fmtTime(e.ends_at) : ''} · {fmtH(hoursOf(e))}{perHour ? ` · about ${fmtMoney(hoursOf(e) * perHour)}` : ''}{p.commute.work && !e.all_day ? ` · leave by ${leaveBy(e.starts_at, p.commute.work)}` : ''}</div></span></div>
        )) : <p class="empty" style="padding:8px">No shifts coming up.</p>}
      </Card>
      <Card title="Hours each week" icon="chart" accent="var(--gold)"><BarChart days={weeks} values={weekly} color="#ffd66b" /><p class="faint tiny" style="margin-top:6px">Four weeks back, this week, and three ahead, from your calendar.</p></Card>
      <Card title="Work tasks" icon="tasks" accent="var(--gold)" action={<a class="faint small" href="#/tasks/work">All</a>}>
        {wTasks.length ? wTasks.slice(0, 6).map((x) => <TaskRow t={x} onOpen={setOpen} />) : <p class="empty" style="padding:8px">Nothing open for work.</p>}
      </Card>
      <TaskSheet task={open} onClose={() => setOpen(null)} />
    </>
  )
}

/** Pay estimate from shift hours. Rate and tips are set here or in Settings; actual pay comes from stubs later. */
function PayCard({ p, week, next, month, perHour, drive }: { p: Prefs; week: number; next: number; month: number; perHour: number; drive: number }) {
  const [edit, setEdit] = useState(!perHour)
  const num = (v: string) => v === '' ? null : Number(v)
  if (edit || !perHour) return (
    <Card title="Pay estimate" icon="money" accent="var(--gold)">
      <p class="faint small" style="margin:-4px 0 10px">Add your rate and roughly what tips come to per hour, and shifts turn into an estimate. You can fine-tune it from pay stubs later.</p>
      <div class="row">
        <label class="field grow"><span>Hourly rate ($)</span><input class="input" type="number" inputMode="decimal" value={p.pay.rate ?? ''} onChange={(e) => savePrefs({ pay: { ...p.pay, rate: num((e.target as HTMLInputElement).value) } })} /></label>
        <label class="field grow"><span>Tips per hour ($)</span><input class="input" type="number" inputMode="decimal" value={p.pay.tips ?? ''} onChange={(e) => savePrefs({ pay: { ...p.pay, tips: num((e.target as HTMLInputElement).value) } })} /></label>
      </div>
      {perHour > 0 && edit && <button class="btn sm primary" onClick={() => setEdit(false)}>Show estimate</button>}
    </Card>
  )
  return (
    <Card title="Pay estimate" icon="money" accent="var(--gold)" action={<button class="faint small" onClick={() => setEdit(true)}>Edit</button>}>
      <div class="stats3" style="margin:0">
        <div><b style="color:var(--gold)">{fmtMoney(week * perHour)}</b><span>this week</span></div>
        <div><b>{fmtMoney(next * perHour)}</b><span>next week</span></div>
        <div><b>{fmtMoney(month * perHour)}</b><span>this month</span></div>
      </div>
      <p class="faint tiny" style="margin-top:8px">Before tax, at ${perHour.toFixed(2)} an hour{p.pay.tips ? ' with tips' : ''}.{drive ? ` About ${fmtH(drive)} of driving this week on top.` : ''}</p>
    </Card>
  )
}

function School({ all }: { all: CalEvent[] }) {
  const p = usePrefs()
  const ws = weekStart()
  const cls = all.filter((e) => calRole(p, e.calendar_name) === 'classes' && new Date(e.starts_at) >= ws && new Date(e.starts_at) < addDays(ws, 7))
  const campusDays = [...new Set(cls.filter((e) => !e.all_day).map(eventDay))].sort()
  const drive = campusDays.length * 2 * p.commute.school / 60
  const t = today()
  const nextDay = campusDays.find((d) => d >= t)
  const firstNext = nextDay ? cls.filter((e) => eventDay(e) === nextDay && !e.all_day).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] : null
  return (
    <>
      <div class="stats3">
        <div><b>{cls.length}</b><span>classes this week</span></div>
        <div><b>{fmtH(cls.reduce((a, e) => a + hoursOf(e), 0))}</b><span>in class{drive ? ` + ${fmtH(drive)} driving` : ''}</span></div>
        <div><a href="#/school" style="color:inherit;text-decoration:none"><b><Icon name="school" size={22} /></b><span>Education</span></a></div>
      </div>
      {firstNext && p.commute.school > 0 && <p class="faint small" style="margin:-4px 6px 12px">{nextDay === t ? 'Today' : fmtDay(nextDay!).replace(/,.*/, '')}: leave by <b style="color:var(--text)">{leaveBy(firstNext.starts_at, p.commute.school)}</b> for {firstNext.title}.</p>}
      <SchoolPanel />
    </>
  )
}

/** Free time: awake hours minus everything on the calendar, with a sleep slider per day to see the tradeoff. */
function Free({ all }: { all: CalEvent[] }) {
  const p = usePrefs()
  const logs = useStore((s) => s.logs)
  const metrics = useStore((s) => s.metrics)
  const [offset, setOffset] = useState(0)
  const [sleep, setSleep] = useState<Record<string, number>>({})
  const start = addDays(weekStart(), offset * 7)
  const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(start, i)))
  const sm = metrics.find((m) => m.key === 'sleep_hours')
  const last14 = lastNDays(14)
  const slept = logs.filter((l) => l.metric_id === sm?.id && l.value_num != null && last14.includes(dayKey(new Date(l.occurred_at)))).map((l) => l.value_num!)
  const avg = slept.length ? slept.reduce((a, b) => a + b, 0) / slept.length : null
  const busyOn = (d: string) => {
    // Timed events only, merged so overlaps aren't counted twice. Assignments are deadlines, not time blocks.
    const iv = eventsOn(all, d).filter((e) => !e.all_day && e.ends_at && calRole(p, e.calendar_name) !== 'assignments')
      .map((e) => [new Date(e.starts_at).getTime(), new Date(e.ends_at!).getTime()] as [number, number])
    const blocks = union(iv)
    return { blocks, travel: Math.max(0, union([...iv, ...travelOn(all, p, d)]) - blocks) }
  }
  const rows = days.map((d) => { const s = sleep[d] ?? p.sleepDefault; const { blocks, travel } = busyOn(d); const b = Math.min(24 - s, blocks); const tr = Math.min(24 - s - b, travel); return { d, s, b, tr, f: Math.max(0, 24 - s - b - tr - 2) } })
  const free = rows.reduce((a, r) => a + r.f, 0)
  return (
    <>
      <Nav label={offset === 0 ? 'This week' : offset === 1 ? 'Next week' : `Week of ${fromKey(days[0]).toLocaleDateString([], { month: 'short', day: 'numeric' })}`} onPrev={() => setOffset(offset - 1)} onNext={() => setOffset(offset + 1)} onToday={offset ? () => setOffset(0) : undefined} />
      <div class="stats3">
        <div><b style="color:var(--mint)">{fmtH(free)}</b><span>free this week</span></div>
        <div><b>{fmtH(rows.reduce((a, r) => a + r.b + r.tr, 0))}</b><span>booked{rows.some((r) => r.tr) ? ' + travel' : ''}</span></div>
        <div><b>{fmtH(rows.reduce((a, r) => a + r.s, 0) / 7)}</b><span>sleep a night</span></div>
      </div>
      <section class="card">
        {rows.map((r) => (
          <div class="freerow">
            <div class="row between small"><b>{fromKey(r.d).toLocaleDateString([], { weekday: 'short', day: 'numeric' })}</b><span class="faint">{r.tr ? `${fmtH(r.tr)} driving · ` : ''}{fmtH(r.f)} free</span></div>
            <div class="freebar"><i style={`width:${(r.s / 24) * 100}%;background:var(--violet)`} /><i style={`width:${(r.b / 24) * 100}%;background:var(--gold)`} /><i style={`width:${(r.tr / 24) * 100}%;background:var(--peach)`} /><i style={`width:${(2 / 24) * 100}%;background:var(--surface-3)`} /><i style={`width:${(r.f / 24) * 100}%;background:var(--mint)`} /></div>
            <label class="row small" style="gap:10px"><span class="faint" style="width:70px">Sleep {r.s}h</span><input class="range grow" type="range" min="4" max="11" step="0.5" value={r.s} onInput={(e) => setSleep({ ...sleep, [r.d]: Number((e.target as HTMLInputElement).value) })} aria-label={`Sleep on ${fmtDay(r.d)}`} /></label>
          </div>
        ))}
        <div class="legend"><span><i class="dot" style="background:var(--violet)" />Sleep</span><span><i class="dot" style="background:var(--gold)" />On the calendar</span>{rows.some((r) => r.tr) && <span><i class="dot" style="background:var(--peach)" />Travel</span>}<span><i class="dot" style="background:var(--surface-3)" />Getting ready, meals (2h)</span><span><i class="dot" style="background:var(--mint)" />Free</span></div>
      </section>
      <p class="faint small" style="margin:0 6px 14px">{avg != null ? `You’ve averaged ${fmtH(avg)} of sleep over the last two weeks. ` : ''}Every extra hour of sleep comes out of free time, one for one.{!p.commute.school && !p.commute.work ? <> Add your drive times in <a class="link" href="#/settings">Settings</a> to count travel too.</> : ''} Your default is {p.sleepDefault}h; <button class="link" onClick={() => savePrefs({ sleepDefault: Math.round(((rows.reduce((a, r) => a + r.s, 0) / 7)) * 2) / 2 })}>make this week’s average the default</button>.</p>
    </>
  )
}

export function Calendar({ mode: m }: { mode?: string }) {
  const synced = useStore((s) => s.synced_at)
  const { p, all, shown } = useVisible()
  const mode = (['week', 'month', 'work', 'school', 'free'].includes(m ?? '') ? m : 'week') as Mode
  const names = [...new Set(all.map((e) => e.calendar_name ?? 'Calendar'))]
  const tabs: [Mode, string][] = [['week', 'Week'], ['month', 'Month'], ['work', 'Work'], ['school', 'School'], ['free', 'Free time']]
  return (
    <>
      <PageHead title="Calendar" icon="cal" color="var(--sky)" sub={synced ? `From Google Calendar · updated ${relTime(synced)}` : 'From Google Calendar'} />
      <div class="seg" style="margin-bottom:12px">{tabs.map(([k, l]) => <a class={mode === k ? 'on' : ''} href={`#/calendar${k === 'week' ? '' : `/${k}`}`}>{l}</a>)}</div>
      {(mode === 'week' || mode === 'month') && <Layers p={p} names={names} />}
      {mode === 'week' ? <Week events={shown} /> : mode === 'month' ? <Month events={shown} /> : mode === 'work' ? <><Layers p={p} names={names} /><Work all={all} /></> : mode === 'school' ? <School all={all} /> : <Free all={all} />}
      {(mode === 'week' || mode === 'month') && <p class="faint small" style="text-align:center">Add or change events in Google Calendar. Assignments are hidden unless you switch them on; exams always show.</p>}
    </>
  )
}
