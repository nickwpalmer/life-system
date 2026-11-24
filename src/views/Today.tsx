import { useStore, setState } from '../lib/store'
import { today, fmtLongDate, partOfDay, checkinKindNow, checkinDay, fmtTime, daysUntil, daysBetween, fmtDay, weekStart, dayKey, inDays, lastNDays } from '../lib/dates'
import { dailySeries, fmtValue, consistency, LOG_GROUPS, groupOf } from '../lib/metrics'
import { eventsOn, calColor, nextBirthday } from '../lib/cal'
import { Icon } from '../ui/icons'
import { Card } from '../ui/kit'
import { TaskRow, TaskSheet, AddTask, openTask } from './Tasks'
import { useState } from 'preact/hooks'
import type { Task } from '../lib/types'

function CheckinPrompt() {
  const checkins = useStore((s) => s.checkins)
  const kind = checkinKindNow()
  const t = today()
  if (!kind) {
    const m = checkins.find((c) => c.kind === 'morning' && c.day === t)
    return m?.intention ? <div class="card soft"><div class="faint small">Today’s intention</div><div style="font-size:17px;margin-top:4px">{m.intention}</div></div> : null
  }
  const day = checkinDay(kind)
  const done = checkins.find((c) => c.kind === kind && c.day === day)
  if (done) {
    const m = checkins.find((c) => c.kind === 'morning' && c.day === t)
    return m?.intention && kind === 'morning' ? <div class="card soft"><div class="faint small">Today’s intention</div><div style="font-size:17px;margin-top:4px">{m.intention}</div></div> : null
  }
  const morning = kind === 'morning'
  return (
    <a class="card soft prompt" href={`#/checkin/${kind}`}>
      <span class={`orb ${morning ? '' : 'cool'}`}><Icon name={morning ? 'sun' : 'moon'} size={24} /></span>
      <span class="grow"><h3>{morning ? 'Morning check-in' : 'Night check-in'}</h3><p class="muted small">{morning ? 'Sleep, mood and your top three. About a minute.' : 'Log the day, a win, and wind down.'}</p></span>
      <Icon name="chev" />
    </a>
  )
}

const seenKey = 'wb-dismissed'
function readSeen() { try { return localStorage.getItem(seenKey) } catch { return null } }

/** After a few quiet days: no streak shaming, just a clean restart. */
function WelcomeBack() {
  const logs = useStore((s) => s.logs)
  const checkins = useStore((s) => s.checkins)
  const tasks = useStore((s) => s.tasks)
  const [gone, setGone] = useState(readSeen() === today())
  const t = today()
  const days = [
    ...logs.filter((l) => l.source === 'daily' || l.source === 'app').map((l) => dayKey(new Date(l.occurred_at))),
    ...checkins.map((c) => c.day),
    ...tasks.filter((x) => x.completed_at).map((x) => dayKey(new Date(x.completed_at!))),
  ]
  if (gone || days.includes(t)) return null
  const prior = days.filter((d) => d < t)
  if (!prior.length) return null
  const last = prior.reduce((a, b) => (a > b ? a : b))
  const gap = daysBetween(last, t)
  if (gap < 3) return null
  const overdue = tasks.filter((x) => openTask(x) && x.due_date && x.due_date < t).length
  const dismiss = () => { try { localStorage.setItem(seenKey, t) } catch { /* ignore */ } setGone(true) }
  return (
    <div class="card soft welcome" style="--accent:var(--mint)">
      <div class="row between"><h3>Welcome back</h3><button class="icon-btn" aria-label="Dismiss" onClick={dismiss}><Icon name="x" size={18} /></button></div>
      <p class="muted small" style="margin:6px 0 12px">It’s been {gap} days. Nothing to catch up on: the log only cares about today.{overdue ? ` ${overdue} task${overdue === 1 ? '' : 's'} slipped past their dates, so re-date or drop them when you have a minute.` : ''}</p>
      <div class="row wrap"><a class="btn primary sm" href={`#/log/${t}`} onClick={dismiss}>Log today</a>{overdue > 0 && <a class="btn sm" href="#/tasks" onClick={dismiss}>See overdue</a>}</div>
    </div>
  )
}

function Focus() {
  const m = useStore((s) => s.checkins.find((c) => c.kind === 'morning' && c.day === today()))
  if (!m?.top_three?.length) return null
  return (
    <Card title="Top three" icon="target" accent="var(--orange)">
      {m.top_three.filter(Boolean).map((x, i) => <div class="row" style="padding:7px 0"><span class="badge" style="flex:none">{i + 1}</span><span>{x}</span></div>)}
    </Card>
  )
}

function Schedule() {
  const events = useStore((s) => s.events)
  const t = today()
  const now = new Date().toISOString()
  let list = eventsOn(events, t)
  let label = 'Today'
  if (!list.filter((e) => e.all_day || (e.ends_at ?? e.starts_at) > now).length) { list = eventsOn(events, inDays(1)); label = 'Tomorrow' }
  return (
    <Card title={`Schedule · ${label}`} icon="cal" accent="var(--sky)" action={<a class="link" href="#/calendar">Week</a>}>
      {!events.length ? <p class="muted small">Your Google Calendar shows up here once it syncs.</p>
        : !list.length ? <p class="empty" style="padding:8px">Nothing on the calendar.</p>
          : list.slice(0, 6).map((e) => (
            <div class="event" style={`--c:${calColor(e.calendar_name)}`}>
              <span class="when">{e.all_day ? 'All day' : fmtTime(e.starts_at)}</span><span class="bar-v" />
              <span class="grow"><div class="e-t">{e.title}</div>{e.location && <div class="faint small ellipsis">{e.location}</div>}</span>
            </div>
          ))}
    </Card>
  )
}

function LogSummary() {
  const metrics = useStore((s) => s.metrics.filter((m) => m.active))
  const logs = useStore((s) => s.logs)
  const t = today()
  const logged = metrics.map((m) => ({ m, v: dailySeries(m, logs, [t])[0] })).filter((x) => x.v != null)
  const days = lastNDays(14)
  const slipping = metrics.filter((m) => m.role === 'habit' && consistency(dailySeries(m, logs, days)).lastTwoMissed)
  return (
    <Card title="Daily log" icon="sliders" accent="var(--pink)" action={<span class="faint small">{logged.length}/{metrics.length}</span>}>
      {logged.length ? <div class="logsum">{logged.map(({ m, v }) => <span style={`--c:${LOG_GROUPS.find((g) => g.key === groupOf(m))!.color}`}>{m.name} {m.kind === 'boolean' ? '✓' : fmtValue(m, v)}</span>)}</div>
        : <p class="muted small">Nothing logged yet. Fill it in once tonight, no need to track as you go.</p>}
      {slipping.length > 0 && <p class="small" style="margin-top:10px;color:var(--peach)">Don’t miss twice: {slipping.map((m) => m.name.toLowerCase()).join(', ')}.</p>}
      <a class="btn block" style="margin-top:12px" href="#/log">{logged.length ? 'Update today’s log' : 'Log today'}</a>
    </Card>
  )
}

function ComingUp() {
  const tasks = useStore((s) => s.tasks)
  const people = useStore((s) => s.people)
  const goals = useStore((s) => s.goals)
  const areas = useStore((s) => s.areas)
  type Item = { d: string; title: string; c: string; href: string }
  const items: Item[] = []
  for (const t of tasks) if (openTask(t) && t.due_date && daysUntil(t.due_date) > 0 && daysUntil(t.due_date) <= 14 && t.priority >= 2) items.push({ d: t.due_date, title: t.title, c: areas.find((a) => a.id === t.area_id)?.color ?? 'var(--violet)', href: '#/tasks' })
  for (const p of people) { const b = nextBirthday(p); if (b && daysUntil(b) <= 30) items.push({ d: b, title: `${p.name}’s birthday`, c: 'var(--pink)', href: '#/people' }) }
  for (const g of goals) if (g.status === 'active' && !g.suggested && g.target_date && daysUntil(g.target_date) >= 0 && daysUntil(g.target_date) <= 45) items.push({ d: g.target_date, title: g.title, c: 'var(--gold)', href: '#/goals' })
  items.sort((a, b) => a.d.localeCompare(b.d))
  if (!items.length) return null
  return (
    <Card title="Coming up" icon="flame" accent="var(--gold)">
      {items.slice(0, 5).map((i) => {
        const n = daysUntil(i.d)
        return <a class="count" href={i.href} style={`--c:${i.c};color:inherit;text-decoration:none`}><span class="c-n"><b>{n === 0 ? 'Now' : n}</b><span>{n === 0 ? 'today' : n === 1 ? 'day' : 'days'}</span></span><span class="grow"><div class="ellipsis">{i.title}</div><div class="faint small">{fmtDay(i.d)}</div></span></a>
      })}
    </Card>
  )
}

function NextSteps() {
  const goals = useStore((s) => s.goals.filter((g) => g.status === 'active' && !g.suggested && g.next_step))
  if (!goals.length) return null
  return (
    <Card title="Next steps on goals" icon="compass" accent="var(--gold)" action={<a class="link" href="#/goals">Goals</a>}>
      {goals.slice(0, 3).map((g) => <div style="padding:7px 0"><div class="faint small">{g.title}</div><div class="row" style="gap:6px;color:var(--peach)"><Icon name="arrow" size={15} />{g.next_step}</div></div>)}
    </Card>
  )
}

function ReviewNudge() {
  const reviews = useStore((s) => s.reviews)
  const d = new Date().getDay() // 0 Sun
  const ws = dayKey(weekStart())
  const lastWs = dayKey(weekStart(new Date(Date.now() - 7 * 864e5)))
  const due = (d === 0 || d === 6 || d === 5) ? !reviews.some((r) => r.week_start === ws) : d === 1 ? !reviews.some((r) => r.week_start === lastWs) : false
  if (!due) return null
  return (
    <a class="card prompt" href="#/review" style="--accent:var(--lilac)">
      <span class="orb cool"><Icon name="review" size={22} /></span>
      <span class="grow"><h3>Weekly review</h3><p class="muted small">Fifteen minutes to clear your head and set up next week.</p></span><Icon name="chev" />
    </a>
  )
}

export function Today() {
  const profile = useStore((s) => s.profile)
  const tasks = useStore((s) => s.tasks)
  const inbox = tasks.filter((t) => t.status === 'inbox').length
  const [edit, setEdit] = useState<Task | null>(null)
  const t = today()
  const due = tasks.filter((x) => openTask(x) && x.status !== 'inbox' && (x.due_date && x.due_date <= t || x.status === 'doing'))
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '') || b.priority - a.priority)
  const doneToday = tasks.filter((x) => x.status === 'done' && x.completed_at && dayKey(new Date(x.completed_at)) === t)
  const name = profile?.display_name || 'Nick'
  const greet = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Hey' }[partOfDay()]
  return (
    <>
      <header class="hello">
        <div class="date">{fmtLongDate()}</div>
        <h1>{greet}, <span class="grad-text">{name}</span></h1>
      </header>
      <WelcomeBack />
      <CheckinPrompt />
      <ReviewNudge />
      <div class="grid-2">
        <div>
          <Focus />
          <Card title="Today’s tasks" icon="tasks" accent="var(--violet)" action={<a class="link" href="#/tasks">All</a>}>
            <AddTask defaults={{ due_date: t }} placeholder="Add for today…" />
            {due.length ? due.map((x) => <TaskRow t={x} onOpen={setEdit} />) : <p class="empty" style="padding:6px">{doneToday.length ? `All clear. ${doneToday.length} done today.` : 'Nothing due today.'}</p>}
            {due.length > 0 && doneToday.length > 0 && <p class="faint small" style="margin-top:8px">{doneToday.length} done today</p>}
            {inbox > 0 && <a class="row between" href="#/inbox" style="margin-top:12px;padding:10px 12px;border-radius:14px;background:var(--surface-2);color:inherit;text-decoration:none"><span class="row"><Icon name="inbox" size={18} />{inbox} in your inbox to sort</span><Icon name="chev" size={18} /></a>}
          </Card>
          <NextSteps />
        </div>
        <div>
          <Schedule />
          <LogSummary />
          <ComingUp />
        </div>
      </div>
      <TaskSheet task={edit} onClose={() => setEdit(null)} />
      <button class="btn ghost block desk-only" onClick={() => setState({ capture: true })}><Icon name="plus" size={18} />Capture anything (N)</button>
    </>
  )
}
