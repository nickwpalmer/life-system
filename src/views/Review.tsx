import { useState } from 'preact/hooks'
import { useStore, toast } from '../lib/store'
import { insert, update } from '../lib/db'
import { weekStart, dayKey, addDays, fromKey, fmtShort, fmtDay, today } from '../lib/dates'
import { dailySeries, consistency, fmtValue } from '../lib/metrics'
import { eventsOn } from '../lib/cal'
import type { Review, Task } from '../lib/types'
import { Icon } from '../ui/icons'
import { PageHead, Card, ScalePicker, ListInputs, burst, HubTabs, type Hub } from '../ui/kit'
import { Flow, type Step } from '../ui/flow'
import { TaskRow, TaskSheet, openTask } from './Tasks'
import { goalProgress } from './Goals'
import { CompassCard } from './Compass'

/** Which week to review: on Sunday the week that's ending; any other day, last week. */
function targetWeek() {
  return new Date().getDay() === 0 ? dayKey(weekStart()) : dayKey(addDays(weekStart(), -7))
}

/** A finished review, read-only. */
export function ReviewSummary({ r, onEdit }: { r: Review; onEdit?: () => void }) {
  const d = (r.data ?? {}) as Record<string, number | null>
  return (
    <>
      <div class="stats3">
        <div><b>{r.rating ?? '–'}<span class="faint small">/10</span></b><span>the week</span></div>
        <div><b>{d.tasks_done ?? '–'}</b><span>tasks done</span></div>
        <div><b>{d.mood_avg != null ? Number(d.mood_avg).toFixed(1) : '–'}</b><span>avg mood</span></div>
      </div>
      {r.focus?.length > 0 && <Card title="Focus for the next week" icon="compass" accent="var(--lilac)">{r.focus.map((x, i) => <div class="row" style="padding:5px 0"><span class="pill quiet">{i + 1}</span>{x}</div>)}</Card>}
      {r.wins && <Card title="What went well" icon="sparkle" accent="var(--gold)"><p style="white-space:pre-wrap">{r.wins}</p></Card>}
      {r.lessons && <Card title="What you’ll change" icon="bolt" accent="var(--coral)"><p style="white-space:pre-wrap">{r.lessons}</p></Card>}
      {onEdit && <div class="row" style="margin:4px 0 16px"><button class="btn grow" onClick={onEdit}><Icon name="edit" size={17} />Edit this review</button><a class="btn grow" href="#/review/patterns">All reviews</a></div>}
    </>
  )
}

const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }

export function WeeklyReview({ hub }: { hub?: Hub }) {
  const reviews = useStore((s) => s.reviews)
  const [ws] = useState(() => targetWeek())
  const existing = reviews.find((r) => r.week_start === ws)
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState(() => {
    const base = { wins: existing?.wins ?? '', lessons: existing?.lessons ?? '', focus: existing?.focus ?? [], rating: existing?.rating ?? null as number | null }
    // A review you left halfway picks up where you stopped.
    try { const d = localStorage.getItem(`review-draft-${ws}`); if (d && !existing) return { ...base, ...JSON.parse(d) } } catch { /* private mode */ }
    return base
  })
  const [edit, setEdit] = useState<Task | null>(null)
  const { tasks, metrics, logs, checkins, journal, goals, events } = useStore((s) => s)
  const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(fromKey(ws), i)))
  const end = days[6]
  const nextDays = Array.from({ length: 7 }, (_, i) => dayKey(addDays(fromKey(end), i + 1)))

  // ---- the week in numbers ----
  const doneN = tasks.filter((t) => t.status === 'done' && t.completed_at && days.includes(dayKey(new Date(t.completed_at)))).length
  const ciN = checkins.filter((c) => days.includes(c.day)).length
  const jN = journal.filter((j) => days.includes(dayKey(new Date(j.occurred_at)))).length
  const m = (k: string) => metrics.find((x) => x.key === k)
  const mood = m('mood') ? avg(dailySeries(m('mood')!, logs, days)) : null
  const sleep = m('sleep_hours') ? avg(dailySeries(m('sleep_hours')!, logs, days)) : null
  const elapsed = days.filter((d) => d <= today())
  const habits = metrics.filter((x) => x.active && x.role === 'habit').map((x) => ({ x, c: consistency(dailySeries(x, logs, elapsed)) }))
  const nightWins = checkins.filter((c) => days.includes(c.day) && c.win).map((c) => c.win!)

  const inbox = tasks.filter((t) => t.status === 'inbox')
  const overdue = tasks.filter((t) => openTask(t) && t.status !== 'inbox' && t.due_date && t.due_date < today())
  const waiting = tasks.filter((t) => t.status === 'waiting')
  const activeGoals = goals.filter((g) => g.status === 'active' && !g.suggested)
  const ahead = tasks.filter((t) => openTask(t) && t.due_date && nextDays.includes(t.due_date)).sort((a, b) => a.due_date!.localeCompare(b.due_date!))
  const aheadEv = nextDays.flatMap((d) => eventsOn(events, d).map((e) => ({ d, e })))

  async function save(btn: Element | null) {
    const data = { tasks_done: doneN, checkins: ciN, journal: jN, mood_avg: mood, sleep_avg: sleep, habits: Object.fromEntries(habits.map(({ x, c }) => [x.key, c.hit])) }
    const row = { wins: f.wins || null, lessons: f.lessons || null, focus: f.focus.filter(Boolean), rating: f.rating, data }
    try {
      if (existing) await update('reviews', existing.id, row)
      else await insert('reviews', { ...row, week_start: ws })
      burst(btn, 26); toast('Week reviewed. Nice work.')
      try { localStorage.removeItem(`review-draft-${ws}`) } catch { /* private mode */ }
      setEditing(false); window.scrollTo({ top: 0 })
    } catch { /* shown */ }
  }

  if (existing && !editing) return (
    <>
      <PageHead hub={hub} title="Weekly review" sub={`${fmtShort(ws)} to ${fmtShort(end)} · done`} icon="review" color="var(--lilac)" />
      <ReviewSummary r={existing} onEdit={() => { setF({ wins: existing.wins ?? '', lessons: existing.lessons ?? '', focus: existing.focus ?? [], rating: existing.rating ?? null }); setEditing(true) }} />
    </>
  )

  const dirtySet = (p: Partial<typeof f>) => { const n = { ...f, ...p }; setF(n); try { localStorage.setItem(`review-draft-${ws}`, JSON.stringify(n)) } catch { /* private mode */ } }
  const steps: Step[] = [
    { key: 'numbers', q: 'Your week in numbers', hint: `${fmtShort(ws)} to ${fmtShort(end)}`, body: () => <>
      <div class="stat-row four">
        <div class="stat" style="--c:var(--violet)"><div class="s-val">{doneN}</div><div class="s-lbl">tasks done</div></div>
        <div class="stat" style="--c:var(--orange)"><div class="s-val">{ciN}<span class="faint small">/{elapsed.length * 2}</span></div><div class="s-lbl">check-ins</div></div>
        <div class="stat" style="--c:var(--pink)"><div class="s-val">{mood != null ? mood.toFixed(1) : '–'}</div><div class="s-lbl">avg mood</div></div>
        <div class="stat" style="--c:var(--sky)"><div class="s-val">{sleep != null ? sleep.toFixed(1) : '–'}</div><div class="s-lbl">avg sleep (h)</div></div>
      </div>
      {habits.length > 0 && <Card title="Habits" icon="flame" accent="var(--violet)">{habits.map(({ x, c }) => (
        <div style="padding:7px 0"><div class="row between small"><span>{x.name}</span><span class="faint">{c.hit}/{c.n} days</span></div><div class="progress" style="margin-top:6px"><i style={`width:${c.pct * 100}%`} /></div></div>
      ))}</Card>}
      {sleep != null && <p class="faint small">Average sleep {fmtValue(m('sleep_hours')!, sleep)}. {jN} journal entr{jN === 1 ? 'y' : 'ies'}.</p>}
    </> },
    { key: 'rating', q: 'How was this week overall?', auto: true, body: (next) => <ScalePicker value={f.rating} onChange={(v) => { dirtySet({ rating: v }); next() }} low="Rough" high="Great" /> },
    { key: 'wins', q: 'What went well?', hint: nightWins.length ? <>From your night check-ins: {nightWins.join(' · ')}</> : undefined,
      body: () => <textarea class="input" style="min-height:110px" autoFocus value={f.wins} onInput={(e) => dirtySet({ wins: (e.target as HTMLTextAreaElement).value })} /> },
    { key: 'lessons', q: 'What didn’t, and what will you change?', body: () => <textarea class="input" style="min-height:110px" autoFocus value={f.lessons} onInput={(e) => dirtySet({ lessons: (e.target as HTMLTextAreaElement).value })} /> },
    { key: 'inbox', q: inbox.length ? `Sort your inbox (${inbox.length})` : 'Inbox is clear', hint: 'Anything else rattling around? Press + and dump it in.',
      body: () => inbox.length ? <div class="card">{inbox.map((t) => <TaskRow t={t} onOpen={setEdit} process />)}</div> : <p class="muted">Nothing to sort. Nice.</p> },
    { key: 'overdue', q: overdue.length ? `Overdue (${overdue.length})` : 'Nothing overdue', hint: overdue.length ? 'Move it, finish it, or let it go.' : undefined,
      body: () => <>{overdue.length > 0 && <div class="card">{overdue.map((t) => <TaskRow t={t} onOpen={setEdit} process />)}</div>}
        {waiting.length > 0 && <Card title="Waiting on others" icon="users">{waiting.map((t) => <TaskRow t={t} onOpen={setEdit} />)}<p class="faint small">Anyone to nudge?</p></Card>}</> },
    { key: 'goals', q: 'Goals: what’s the next step?', body: () => <>
      <CompassCard compact />
      {activeGoals.length ? activeGoals.map((g) => {
        const { p, label } = goalProgress(g)
        return (
          <div class="goal">
            <div class="row between"><div class="g-title">{g.title}</div><span class="faint small">{label}</span></div>
            <div class="progress" style="margin:8px 0"><i style={`width:${p * 100}%`} /></div>
            <input class="input" placeholder="The very next thing" defaultValue={g.next_step ?? ''} onChange={(e) => update('goals', g.id, { next_step: (e.target as HTMLInputElement).value || null })} />
          </div>
        )
      }) : <p class="muted">No goals yet. <a href="#/goals">Add one</a> when you’re ready.</p>}
    </> },
    { key: 'ahead', q: 'Next week', body: () => <div class="card">
      {aheadEv.length === 0 && ahead.length === 0 && <p class="muted small">Nothing scheduled yet.</p>}
      {aheadEv.slice(0, 10).map(({ d, e }) => <div class="row small" style="padding:4px 0"><span class="faint" style="width:76px;flex:none">{fmtDay(d)}</span><span class="grow ellipsis">{e.title}</span></div>)}
      {ahead.length > 0 && <><div class="group-h">Due</div>{ahead.map((t) => <TaskRow t={t} onOpen={setEdit} />)}</>}
    </div> },
    { key: 'focus', q: 'Three things that would make next week a success', body: () => <ListInputs values={f.focus} onChange={(v) => dirtySet({ focus: v })} placeholder="Focus" /> },
  ]

  return (
    <>
      {hub && <HubTabs hub={hub} />}
      <Flow title="Weekly review" color="var(--lilac)" steps={steps} finishLabel={existing ? 'Update review' : 'Finish review'}
        onExit={() => { if (existing) setEditing(false); else location.hash = '#/today' }} onFinish={(b) => save(b)} />
      <TaskSheet task={edit} onClose={() => setEdit(null)} />
    </>
  )
}
