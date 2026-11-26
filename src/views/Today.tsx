import { useState } from 'preact/hooks'
import { useStore } from '../lib/store'
import { today, fmtLongDate, partOfDay, fmtTime, daysUntil, daysBetween, fmtDay, weekStart, dayKey, relTime, fromKey, fmtShort, checkinDay } from '../lib/dates'
import { eventDay, calColor, nextBirthday } from '../lib/cal'
import { usePrefs, phaseNow } from '../lib/prefs'
import { Icon } from '../ui/icons'
import { Card } from '../ui/kit'
import { openTask } from './Tasks'
import { useKeyDates } from './School'
import { useRows } from '../lib/rows'
import type { Rec } from './Records'

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

/** The big card at the top: a check-in when one is due, otherwise nothing (the + button holds quick logging). */
function Hero() {
  const prefs = usePrefs()
  const checkins = useStore((s) => s.checkins)
  // Demo only: ?hero=night or ?hero=morning shows that card, so its look can be checked at any hour.
  const force = useStore((s) => s.demo) ? new URLSearchParams(location.search).get('hero') : null
  const phase = force ?? phaseNow(prefs)
  const t = today()
  // The night check-in after midnight still belongs to yesterday.
  const nightDay = checkinDay('night')
  const morningDone = !force && checkins.some((c) => c.kind === 'morning' && c.day === t)
  const nightDone = !force && checkins.some((c) => c.kind === 'night' && c.day === nightDay)
  if (phase === 'morning' && !morningDone) return (
    <a class="hero morning" href="#/checkin/morning">
      <span class="h-orb"><Icon name="sun" size={30} /></span>
      <span class="grow"><span class="h-k">Morning check-in</span><h2>How did you sleep?</h2><span class="h-s">One question at a time. About a minute.</span></span>
      <Icon name="chev" />
    </a>
  )
  if (phase === 'night' && !nightDone) return (
    <a class="hero night" href="#/checkin/night">
      <span class="h-orb"><Icon name="moon" size={28} /></span>
      <span class="grow"><span class="h-k">Night check-in</span><h2>How was today?</h2><span class="h-s">A few taps, one win, and wind down.</span></span>
      <Icon name="chev" />
    </a>
  )
  return <Intention />
}

/** Morning, night and weekly review in one row, with what's done. */
function Rituals() {
  const checkins = useStore((s) => s.checkins)
  const reviews = useStore((s) => s.reviews)
  const t = today()
  const nightDay = checkinDay('night')
  const ws = dayKey(weekStart())
  const lastWs = dayKey(weekStart(new Date(Date.now() - 7 * 864e5)))
  const items: [string, string, string, boolean, string][] = [
    ['#/checkin/morning', 'sun', 'Morning', checkins.some((c) => c.kind === 'morning' && c.day === t), 'var(--orange)'],
    ['#/checkin/night', 'moon', 'Night', checkins.some((c) => c.kind === 'night' && c.day === nightDay), 'var(--violet)'],
    ['#/review', 'review', 'Week', reviews.some((r) => r.week_start === ws || r.week_start === lastWs), 'var(--lilac)'],
  ]
  return (
    <div class="rituals">
      {items.map(([href, ic, l, done, c]) => <a href={href} class={`ritual ${done ? 'done' : ''}`} style={`--c:${c}`}><Icon name={done ? 'check' : ic} size={17} />{l}</a>)}
    </div>
  )
}

/** Today at a glance: the numbers worth seeing without opening anything. */
function Dash() {
  const metrics = useStore((s) => s.metrics)
  const logs = useStore((s) => s.logs)
  const tasks = useStore((s) => s.tasks)
  const subs = useRows<{ occurred_at: string }>('substance_logs')
  const t = today()
  const id = (k: string) => metrics.find((m) => m.key === k)?.id
  const of = (k: string) => logs.filter((l) => l.metric_id === id(k) && l.value_num != null)
  const todayTimed = (k: string) => of(k).filter((l) => dayKey(new Date(l.occurred_at)) === t).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
  const week = Array.from({ length: 7 }, (_, i) => dayKey(new Date(Date.now() - (6 - i) * 864e5)))
  const avg = (k: string, d: string) => { const v = of(k).filter((l) => dayKey(new Date(l.occurred_at)) === d).map((l) => l.value_num!); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
  const mood = todayTimed('mood'), stress = todayTimed('anxiety')
  // Sleep and steps come from the ring, which can lag a day; show the newest one with its date.
  const newest = (k: string) => { const l = of(k).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0]; return l ? { v: l.value_num!, d: dayKey(new Date(l.occurred_at)), src: l.source } : null }
  const yday = dayKey(new Date(Date.now() - 864e5))
  const sl = newest('sleep_hours'), st = newest('steps')
  const sleep = sl && daysBetween(sl.d, t) <= 14 ? sl : null
  const steps = st && daysBetween(st.d, t) <= 14 ? st : null
  const when = (x: { d: string; src?: string | null }, near: string) => `${x.d === t || x.d === yday ? near : fmtShort(x.d)}${x.src === 'ring' ? ' · ring' : ''}`
  const due = tasks.filter((x) => openTask(x) && x.status !== 'inbox' && (x.due_date === t || x.scheduled_for === t)).length
  const done = tasks.filter((x) => x.status === 'done' && x.completed_at && dayKey(new Date(x.completed_at)) === t).length
  const subN = (subs ?? []).filter((r) => dayKey(new Date(r.occurred_at)) === t).length
  const spark = (k: string, max = 10) => <span class="spark">{week.map((d) => { const v = avg(k, d); return <i style={`height:${v == null ? 6 : 10 + (v / max) * 90}%;${v == null ? 'opacity:.25' : ''}`} /> })}</span>
  const last = (l: typeof mood) => l.length ? l[l.length - 1] : null
  const tile = (href: string, c: string, label: string, val: string, sub: string, extra?: preact.ComponentChildren) => (
    <a class="dtile" href={href} style={`--c:${c}`}><span class="d-l">{label}</span><b>{val}</b><span class="d-s">{sub}</span>{extra}</a>
  )
  return (
    <section class="dash">
      {tile(`#/log/${t}`, 'var(--orange)', 'Mood', last(mood) ? String(last(mood)!.value_num) : '–', last(mood) ? `${mood.length}× today · ${fmtTime(last(mood)!.occurred_at)}` : 'Tap + to log', spark('mood'))}
      {tile(`#/log/${t}`, 'var(--coral)', 'Stress', last(stress) ? String(last(stress)!.value_num) : '–', last(stress) ? `last at ${fmtTime(last(stress)!.occurred_at)}` : 'Not logged', spark('anxiety'))}
      {tile('#/health', 'var(--sky)', 'Sleep', sleep ? `${Math.round(sleep.v * 10) / 10}h` : '–', sleep ? when(sleep, 'last night') : 'No recent data', spark('sleep_hours', 10))}
      {tile('#/health', 'var(--mint)', 'Steps', steps ? Math.round(steps.v).toLocaleString() : '–', steps ? when(steps, steps.d === t ? 'today' : 'yesterday') : 'No recent data')}
      {tile('#/tasks', 'var(--violet)', 'Tasks', `${done}/${done + due}`, 'done today', <span class="dbar"><i style={`width:${done + due ? (done / (done + due)) * 100 : 0}%`} /></span>)}
      {tile('#/health/substances', 'var(--gold)', 'Substances', String(subN), 'logged today')}
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
  const events = useStore((s) => s.events)
  const goals = useStore((s) => s.goals)
  const areas = useStore((s) => s.areas)
  const [kd] = useKeyDates()
  const recs = useRows<Rec>('records')
  const [far, setFar] = useState(false)
  const [all, setAll] = useState(false)
  type Item = { d: string; title: string; c: string; href: string }
  const items: Item[] = []
  for (const t of tasks) if (openTask(t) && t.due_date && daysUntil(t.due_date) > 1 && daysUntil(t.due_date) <= 14 && t.priority >= 3) items.push({ d: t.due_date, title: t.title, c: areas.find((a) => a.id === t.area_id)?.color ?? 'var(--violet)', href: '#/tasks' })
  for (const p of people) { const b = nextBirthday(p); if (b && daysUntil(b) <= 21) items.push({ d: b, title: `${p.name}’s birthday`, c: 'var(--pink)', href: '#/people' }) }
  // Birthdays live on Google Calendar (v0.7), so any birthday event there counts too, once per day and name.
  for (const e of events) if (/birthday/i.test(e.title)) { const d = eventDay(e); if (daysUntil(d) >= 0 && daysUntil(d) <= 21 && !items.some((i) => i.d === d && /birthday/i.test(i.title) && i.title.split(/[’' ]/)[0] === e.title.split(/[’' ]/)[0])) items.push({ d, title: e.title, c: 'var(--pink)', href: '#/calendar' }) }
  for (const g of goals) if (g.status === 'active' && !g.suggested && g.target_date && daysUntil(g.target_date) >= 0 && daysUntil(g.target_date) <= 30) items.push({ d: g.target_date, title: g.title, c: 'var(--gold)', href: '#/goals' })
  for (const k of kd ?? []) if (!k.done && (k.kind === 'exam' || k.kind === 'term') && daysUntil(k.day) > 0 && daysUntil(k.day) <= 21) items.push({ d: k.day, title: k.course ? `${k.course}: ${k.title}` : k.title, c: k.kind === 'exam' ? 'var(--pink)' : 'var(--lilac)', href: '#/school' })
  for (const r of recs ?? []) if (r.expires_on && daysUntil(r.expires_on) >= 0 && daysUntil(r.expires_on) <= 45) items.push({ d: r.expires_on, title: `${r.name} ${r.renews ? 'renews' : 'ends'}`, c: daysUntil(r.expires_on) <= 30 ? 'var(--gold)' : 'var(--peach)', href: '#/records' })
  items.sort((a, b) => far ? b.d.localeCompare(a.d) : a.d.localeCompare(b.d))
  if (!items.length) return null
  return (
    <Card title="Coming up" icon="flame" accent="var(--gold)" action={<button class="faint small" onClick={() => setFar(!far)}>{far ? 'Furthest first' : 'Soonest first'}</button>}>
      {(all ? items : items.slice(0, 4)).map((i) => {
        const n = daysUntil(i.d)
        return <a class="count" href={i.href} style={`--c:${i.c};color:inherit;text-decoration:none`}><span class="c-n"><b>{n}</b><span>{n === 1 ? 'day' : 'days'}</span></span><span class="grow" style="min-width:0"><div class="ellipsis">{i.title}</div><div class="faint small">{fmtDay(i.d)}</div></span></a>
      })}
      {items.length > 4 && <button class="faint small" style="margin-top:6px" onClick={() => setAll(!all)}>{all ? 'Show less' : `Show all ${items.length}`}</button>}
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
      <Rituals />
      <Dash />
      <TaskGlance />
      <NextUp />
      <Gaps />
      <ComingUp />
    </div>
  )
}
