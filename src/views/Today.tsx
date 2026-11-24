import { useState } from 'preact/hooks'
import { useStore, setState, metricByKey, toast } from '../lib/store'
import { today, fmtLongDate, partOfDay, fmtTime, daysUntil, daysBetween, fmtDay, weekStart, dayKey, relTime, fromKey, fmtShort } from '../lib/dates'
import { eventDay, calColor, nextBirthday } from '../lib/cal'
import { addTimedLog } from '../lib/db'
import { usePrefs, phaseNow } from '../lib/prefs'
import { Icon } from '../ui/icons'
import { Card, haptic } from '../ui/kit'
import { openTask } from './Tasks'
import { useKeyDates } from './School'
import { SubstanceQuick } from './Substances'
import { useRows } from '../lib/rows'
import type { Rec } from './Records'

/** Mood right now: five taps, saved as a timed mood entry (1 to 10 scale). */
export const MOODS: [number, string, string][] = [[2, 'Rough', '#8fc4ff'], [4, 'Low', '#a98bff'], [6, 'Okay', '#cdb9ff'], [8, 'Good', '#ffc08a'], [10, 'Great', '#ffa463']]

export function MoodTap({ onDone }: { onDone?: () => void }) {
  const [picked, setPicked] = useState<number | null>(null)
  const log = async (v: number) => {
    const m = metricByKey('mood')
    if (!m) { toast('Add a Mood tracker in Settings first'); return }
    haptic(); setPicked(v)
    try { await addTimedLog(m.id, v, null, null, new Date().toISOString()); toast(`Mood logged at ${fmtTime(new Date().toISOString())}`); onDone?.() } catch { setPicked(null) }
  }
  return (
    <div class="moods" role="group" aria-label="Mood right now">
      {MOODS.map(([v, l, c]) => (
        <button class={`mood ${picked === v ? 'on' : ''}`} style={`--c:${c}`} onClick={() => log(v)} aria-pressed={picked === v}>
          <i style={`--s:${0.55 + v / 25}`} /><span>{l}</span>
        </button>
      ))}
    </div>
  )
}

function Intention() {
  const m = useStore((s) => s.checkins.find((c) => c.kind === 'morning' && c.day === today()))
  if (!m?.intention && !m?.top_three?.filter(Boolean).length) return null
  return (
    <div class="intent">
      {m.intention && <div><span class="faint tiny">Today’s intention</span><div class="i-t">{m.intention}</div></div>}
      {m.top_three?.filter(Boolean).length ? <ol>{m.top_three.filter(Boolean).map((x) => <li>{x}</li>)}</ol> : null}
    </div>
  )
}

/** The big card at the top. What it is depends on the time of day (set in Settings). */
function Hero() {
  const prefs = usePrefs()
  const checkins = useStore((s) => s.checkins)
  const phase = phaseNow(prefs)
  const t = today()
  // The night check-in after midnight still belongs to yesterday.
  const nightDay = new Date().getHours() < 12 ? dayKey(new Date(Date.now() - 864e5)) : t
  const morningDone = checkins.some((c) => c.kind === 'morning' && c.day === t)
  const nightDone = checkins.some((c) => c.kind === 'night' && c.day === nightDay)

  if (phase === 'morning' && !morningDone) return (
    <a class="hero morning" href="#/checkin/morning">
      <span class="h-orb"><Icon name="sun" size={30} /></span>
      <span class="grow"><span class="h-k">Morning check-in</span><h2>How did you sleep?</h2><span class="h-s">Sleep, mood and your top three. About a minute.</span></span>
      <Icon name="chev" />
    </a>
  )
  if (phase === 'night' && !nightDone) return (
    <a class="hero night" href="#/checkin/night">
      <span class="h-orb"><Icon name="moon" size={28} /></span>
      <span class="grow"><span class="h-k">Night check-in</span><h2>How was today?</h2><span class="h-s">Log the day, one win, and wind down.</span></span>
      <Icon name="chev" />
    </a>
  )
  return (
    <section class="hero log">
      <div class="row between"><span class="h-k">{phase === 'night' ? 'Day wrapped. Anything else?' : 'Quick log'}</span><a class="link small" href={`#/log/${t}`}>Daily log</a></div>
      <h2 style="margin:4px 0 12px">How are you right now?</h2>
      <MoodTap />
      <div class="quick">
        <SubstanceQuick />
        <button class="qbtn" style="--c:var(--mint)" onClick={() => setState({ capture: 'journal' })}><Icon name="book" size={18} />Note to self</button>
        <a class="qbtn" style="--c:var(--pink)" href={`#/log/${t}`}><Icon name="sliders" size={18} />Log the day</a>
      </div>
      <Intention />
    </section>
  )
}

/** Counts, not lists: what's due today and what's late, split by area if you want to look closer. */
function TaskGlance() {
  const tasks = useStore((s) => s.tasks)
  const areas = useStore((s) => s.areas)
  const [open, setOpen] = useState(false)
  const t = today()
  const live = tasks.filter((x) => openTask(x) && x.status !== 'inbox')
  const isToday = (x: typeof live[number]) => x.due_date === t || x.scheduled_for === t || x.status === 'doing'
  const isLate = (x: typeof live[number]) => !!x.due_date && x.due_date < t
  const todayN = live.filter(isToday).length
  const lateN = live.filter(isLate).length
  const inbox = tasks.filter((x) => x.status === 'inbox').length
  const doneToday = tasks.filter((x) => x.status === 'done' && x.completed_at && dayKey(new Date(x.completed_at)) === t).length
  const rows = [...areas.filter((a) => !a.archived), { id: null, key: 'none', name: 'No area', color: 'var(--faint)' }]
    .map((a) => { const mine = live.filter((x) => (x.area_id ?? null) === a.id); return { a, today: mine.filter(isToday).length, late: mine.filter(isLate).length } })
    .filter((r) => r.today || r.late)
  return (
    <section class="card glance">
      <button class="g-top" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span class="g-n" style="--c:var(--violet)"><b>{todayN}</b><span>today</span></span>
        <span class="g-n" style={`--c:${lateN ? 'var(--coral)' : 'var(--faint)'}`}><b>{lateN}</b><span>overdue</span></span>
        <span class="g-n" style="--c:var(--mint)"><b>{doneToday}</b><span>done today</span></span>
        <span class={`g-chev ${open ? 'up' : ''}`}><Icon name="chev" size={18} /></span>
      </button>
      {open && (
        <div class="g-list">
          {rows.length ? rows.map((r) => (
            <a href={`#/tasks/${r.a.key}`} class="g-row">
              <i class="dot" style={`background:${r.a.color}`} /><span class="grow">{r.a.name}</span>
              {r.today > 0 && <span class="pill">{r.today} today</span>}{r.late > 0 && <span class="pill late">{r.late} late</span>}<Icon name="chev" size={16} />
            </a>
          )) : <p class="faint small" style="padding:4px 2px">Nothing due or late.</p>}
          <a href="#/tasks" class="g-row"><Icon name="tasks" size={18} /><span class="grow">All tasks</span><Icon name="chev" size={16} /></a>
        </div>
      )}
      {inbox > 0 && <a class="g-inbox" href="#/inbox"><Icon name="inbox" size={17} /><span class="grow">{inbox} in your inbox to sort</span><Icon name="chev" size={16} /></a>}
    </section>
  )
}

function NextUp() {
  const events = useStore((s) => s.events)
  const now = new Date().toISOString()
  const t = today()
  const list = events.filter((e) => (e.all_day ? eventDay(e) >= t : (e.ends_at ?? e.starts_at) > now) && daysUntil(eventDay(e)) <= 1 && e.calendar_name !== 'Canvas')
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 3)
  if (!list.length) return null
  return (
    <section class="card nextup">
      {list.map((e) => (
        <a class="event" href="#/calendar" style={`--c:${calColor(e.calendar_name)}`}>
          <span class="when">{eventDay(e) !== t ? 'Tmrw' : e.all_day ? 'All day' : fmtTime(e.starts_at)}</span><span class="bar-v" />
          <span class="grow ellipsis">{e.title}</span>
        </a>
      ))}
    </section>
  )
}

/** Gaps worth knowing about: a sync that stopped, or something you usually do that hasn't happened in a while. */
export function useGaps() {
  const synced = useStore((s) => s.synced_at)
  const events = useStore((s) => s.events.length)
  const logs = useStore((s) => s.logs)
  const checkins = useStore((s) => s.checkins)
  const tasks = useStore((s) => s.tasks)
  const reviews = useStore((s) => s.reviews)
  const recs = useRows<Rec>('records')
  const t = today()
  const out: { icon: string; text: string; href: string; c: string }[] = []
  for (const r of recs ?? []) if (r.expires_on && daysUntil(r.expires_on) < 0 && daysUntil(r.expires_on) >= -90) out.push({ icon: 'layers', c: 'var(--danger)', href: '#/records', text: `${r.name} ${r.renews ? 'was due for renewal' : 'expired'} on ${fmtShort(r.expires_on)}.` })
  if (synced && Date.now() - new Date(synced).getTime() > 6 * 3600e3) out.push({ icon: 'cal', c: 'var(--sky)', href: '#/settings', text: `Google Calendar hasn’t synced since ${relTime(synced)}.` })
  else if (!synced && !events) out.push({ icon: 'cal', c: 'var(--sky)', href: '#/settings', text: 'Google Calendar hasn’t synced yet.' })
  const health = logs.filter((l) => l.source === 'health').map((l) => l.occurred_at).sort().pop()
  if (health && Date.now() - new Date(health).getTime() > 36 * 3600e3) out.push({ icon: 'heart', c: 'var(--mint)', href: '#/settings', text: `No Apple Health data since ${relTime(health)}. Check that your ring synced to Apple Health.` })
  const logged = logs.filter((l) => l.source === 'daily' || l.source === 'app').map((l) => dayKey(new Date(l.occurred_at))).filter((d) => d < t).sort().pop()
  if (logged && daysBetween(logged, t) > 2) out.push({ icon: 'sliders', c: 'var(--pink)', href: `#/log/${logged}`, text: `Nothing in your daily log since ${fmtDay(logged)}.` })
  const ci = checkins.map((c) => c.day).sort().pop()
  if (ci && daysBetween(ci, t) > 2) out.push({ icon: 'sun', c: 'var(--orange)', href: '#/checkin/morning', text: `No check-ins since ${fmtDay(ci)}.` })
  const stale = tasks.filter((x) => x.status === 'inbox' && daysBetween(dayKey(new Date(x.created_at)), t) > 3).length
  if (stale) out.push({ icon: 'inbox', c: 'var(--violet)', href: '#/inbox', text: `${stale} inbox item${stale === 1 ? ' has' : 's have'} waited more than 3 days.` })
  const lastWs = dayKey(weekStart(new Date(Date.now() - 7 * 864e5)))
  const wd = new Date().getDay()
  if (wd >= 1 && wd <= 3 && !reviews.some((r) => r.week_start === lastWs)) out.push({ icon: 'review', c: 'var(--lilac)', href: '#/review', text: `Last week’s review (week of ${fromKey(lastWs).toLocaleDateString([], { month: 'short', day: 'numeric' })}) isn’t done.` })
  return out
}

function Gaps() {
  const gaps = useGaps()
  if (!gaps.length) return null
  return (
    <Card title="Needs a look" icon="bolt" accent="var(--gold)">
      {gaps.map((g) => <a class="gap" href={g.href} style={`--c:${g.c}`}><span class="m-ico"><Icon name={g.icon} size={17} /></span><span class="grow">{g.text}</span><Icon name="chev" size={16} /></a>)}
    </Card>
  )
}

function ComingUp() {
  const tasks = useStore((s) => s.tasks)
  const people = useStore((s) => s.people)
  const goals = useStore((s) => s.goals)
  const areas = useStore((s) => s.areas)
  const [kd] = useKeyDates()
  const recs = useRows<Rec>('records')
  type Item = { d: string; title: string; c: string; href: string }
  const items: Item[] = []
  for (const t of tasks) if (openTask(t) && t.due_date && daysUntil(t.due_date) > 1 && daysUntil(t.due_date) <= 14 && t.priority >= 3) items.push({ d: t.due_date, title: t.title, c: areas.find((a) => a.id === t.area_id)?.color ?? 'var(--violet)', href: '#/tasks' })
  for (const p of people) { const b = nextBirthday(p); if (b && daysUntil(b) <= 21) items.push({ d: b, title: `${p.name}’s birthday`, c: 'var(--pink)', href: '#/people' }) }
  for (const g of goals) if (g.status === 'active' && !g.suggested && g.target_date && daysUntil(g.target_date) >= 0 && daysUntil(g.target_date) <= 30) items.push({ d: g.target_date, title: g.title, c: 'var(--gold)', href: '#/goals' })
  for (const k of kd ?? []) if (!k.done && (k.kind === 'exam' || k.kind === 'term') && daysUntil(k.day) > 0 && daysUntil(k.day) <= 21) items.push({ d: k.day, title: k.course ? `${k.course}: ${k.title}` : k.title, c: k.kind === 'exam' ? 'var(--pink)' : 'var(--lilac)', href: '#/school' })
  for (const r of recs ?? []) if (r.expires_on && daysUntil(r.expires_on) >= 0 && daysUntil(r.expires_on) <= 45) items.push({ d: r.expires_on, title: `${r.name} ${r.renews ? 'renews' : 'ends'}`, c: daysUntil(r.expires_on) <= 30 ? 'var(--gold)' : 'var(--peach)', href: '#/records' })
  items.sort((a, b) => a.d.localeCompare(b.d))
  if (!items.length) return null
  return (
    <Card title="Coming up" icon="flame" accent="var(--gold)">
      {items.slice(0, 4).map((i) => {
        const n = daysUntil(i.d)
        return <a class="count" href={i.href} style={`--c:${i.c};color:inherit;text-decoration:none`}><span class="c-n"><b>{n}</b><span>{n === 1 ? 'day' : 'days'}</span></span><span class="grow"><div class="ellipsis">{i.title}</div><div class="faint small">{fmtDay(i.d)}</div></span></a>
      })}
    </Card>
  )
}

export function Today() {
  const profile = useStore((s) => s.profile)
  const name = profile?.display_name || 'there'
  const greet = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Hey' }[partOfDay()]
  return (
    <div class="home">
      <header class="hello">
        <div class="date">{fmtLongDate()}</div>
        <h1>{greet}, <span class="grad-text">{name}</span></h1>
      </header>
      <Hero />
      <TaskGlance />
      <NextUp />
      <Gaps />
      <ComingUp />
    </div>
  )
}
