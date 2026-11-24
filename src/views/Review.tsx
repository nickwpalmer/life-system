import { useState } from 'preact/hooks'
import { useStore, toast } from '../lib/store'
import { insert, update } from '../lib/db'
import { weekStart, dayKey, addDays, fromKey, fmtShort, fmtDay, today } from '../lib/dates'
import { dailySeries, consistency, fmtValue } from '../lib/metrics'
import { eventsOn } from '../lib/cal'
import type { Review, Task } from '../lib/types'
import { Icon } from '../ui/icons'
import { PageHead, Card, ScalePicker, ListInputs, burst } from '../ui/kit'
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
      {onEdit && <div class="row" style="margin:4px 0 16px"><button class="btn grow" onClick={onEdit}><Icon name="edit" size={17} />Edit this review</button><a class="btn grow" href="#/insights">All reviews in Insights</a></div>}
    </>
  )
}

const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }

export function WeeklyReview() {
  const reviews = useStore((s) => s.reviews)
  const [ws] = useState(() => targetWeek())
  const existing = reviews.find((r) => r.week_start === ws)
  const [editing, setEditing] = useState(false)
  const [step, setStep] = useState(0)
  const [f, setF] = useState(() => ({ wins: existing?.wins ?? '', lessons: existing?.lessons ?? '', focus: existing?.focus ?? [], rating: existing?.rating ?? null as number | null }))
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

  async function save(e: Event) {
    const btn = e.currentTarget as Element
    const data = { tasks_done: doneN, checkins: ciN, journal: jN, mood_avg: mood, sleep_avg: sleep, habits: Object.fromEntries(habits.map(({ x, c }) => [x.key, c.hit])) }
    const row = { wins: f.wins || null, lessons: f.lessons || null, focus: f.focus.filter(Boolean), rating: f.rating, data }
    try {
      if (existing) await update('reviews', existing.id, row)
      else await insert('reviews', { ...row, week_start: ws })
      burst(btn, 26); toast('Week reviewed. Nice work.')
      setEditing(false); window.scrollTo({ top: 0 })
    } catch { /* shown */ }
  }

  if (existing && !editing) return (
    <>
      <PageHead title="Weekly review" sub={`${fmtShort(ws)} to ${fmtShort(end)} · done`} icon="review" color="var(--lilac)" />
      <ReviewSummary r={existing} onEdit={() => { setF({ wins: existing.wins ?? '', lessons: existing.lessons ?? '', focus: existing.focus ?? [], rating: existing.rating ?? null }); setEditing(true) }} />
    </>
  )

  const steps = ['Look back', 'Get clear', 'Goals', 'Look ahead']
  const nav = (
    <div class="row" style="margin:16px 0 18px">
      {step > 0 && <button class="btn" onClick={() => setStep(step - 1)}><Icon name="back" size={18} />Back</button>}
      {step < 3 ? <button class="btn primary grow" onClick={() => { setStep(step + 1); window.scrollTo({ top: 0 }) }}>Next: {steps[step + 1]}</button>
        : <button class="btn primary grow" onClick={save}>{existing ? 'Update review' : 'Finish review'}</button>}
    </div>
  )

  return (
    <>
      <PageHead title="Weekly review" sub={`${fmtShort(ws)} to ${fmtShort(end)}${existing ? ' · done, you can update it' : ''}`} icon="review" color="var(--lilac)" />
      <div class="chips" style="margin-bottom:10px">{steps.map((s, i) => <button class={`chip ${i === step ? 'on' : ''}`} style="--c:var(--lilac)" onClick={() => setStep(i)}>{i + 1}. {s}</button>)}</div>
      <div class="steps-dots">{steps.map((_, i) => <i class={i === step ? 'on' : ''} />)}</div>

      {step === 0 && <>
        <div class="stat-row four">
          <div class="stat" style="--c:var(--violet)"><div class="s-val">{doneN}</div><div class="s-lbl">tasks done</div></div>
          <div class="stat" style="--c:var(--orange)"><div class="s-val">{ciN}<span class="faint small">/{elapsed.length * 2}</span></div><div class="s-lbl">check-ins</div></div>
          <div class="stat" style="--c:var(--pink)"><div class="s-val">{mood != null ? mood.toFixed(1) : '–'}</div><div class="s-lbl">avg mood</div></div>
          <div class="stat desk-only" style="--c:var(--sky)"><div class="s-val">{sleep != null ? sleep.toFixed(1) : '–'}</div><div class="s-lbl">avg sleep (h)</div></div>
        </div>
        <div class="grid-2">
          <Card title="Habits this week" icon="flame" accent="var(--violet)">
            {habits.length ? habits.map(({ x, c }) => (
              <div style="padding:7px 0"><div class="row between small"><span>{x.name}</span><span class="faint">{c.hit}/{c.n} days</span></div><div class="progress" style="margin-top:6px"><i style={`width:${c.pct * 100}%`} /></div></div>
            )) : <p class="muted small">No habits set up.</p>}
            {sleep == null ? null : <p class="faint small" style="margin-top:8px">Average sleep {fmtValue(m('sleep_hours')!, sleep)}. {jN} journal entr{jN === 1 ? 'y' : 'ies'}.</p>}
          </Card>
          <Card title="Wins and lessons" icon="sparkle" accent="var(--gold)">
            {nightWins.length > 0 && <div style="margin-bottom:10px"><div class="faint small">From your night check-ins</div>{nightWins.map((w) => <div class="small" style="padding:3px 0">· {w}</div>)}</div>}
            <label class="field"><span>What went well?</span><textarea class="input" style="min-height:70px" value={f.wins} onInput={(e) => setF({ ...f, wins: (e.target as HTMLTextAreaElement).value })} /></label>
            <label class="field"><span>What didn’t, and what will you change?</span><textarea class="input" style="min-height:70px" value={f.lessons} onInput={(e) => setF({ ...f, lessons: (e.target as HTMLTextAreaElement).value })} /></label>
          </Card>
        </div>
      </>}

      {step === 1 && <div class="grid-2">
        <Card title={`Inbox · ${inbox.length}`} icon="inbox" accent="var(--violet)">
          {inbox.length ? inbox.map((t) => <TaskRow t={t} onOpen={setEdit} process />) : <p class="empty" style="padding:8px">Inbox is empty.</p>}
          <p class="faint small" style="margin-top:8px">Anything else rattling around? Press the + and dump it in.</p>
        </Card>
        <div>
          <Card title={`Overdue · ${overdue.length}`} icon="clock" accent="var(--coral)">
            {overdue.length ? <><p class="muted small">Move it, finish it, or let it go. Old tasks you’ll never do make the whole list feel heavy.</p>{overdue.map((t) => <TaskRow t={t} onOpen={setEdit} process />)}</> : <p class="empty" style="padding:8px">Nothing overdue.</p>}
          </Card>
          {waiting.length > 0 && <Card title="Waiting on others" icon="users">{waiting.map((t) => <TaskRow t={t} onOpen={setEdit} />)}<p class="faint small">Anyone to nudge?</p></Card>}
        </div>
      </div>}

      {step === 2 && <CompassCard compact />}
      {step === 2 && <Card title="Goals" icon="target" accent="var(--gold)" action={<a class="link" href="#/goals">Edit goals</a>}>
        {activeGoals.length ? activeGoals.map((g) => {
          const { p, label } = goalProgress(g)
          return (
            <div class="goal">
              <div class="row between"><div class="g-title">{g.title}</div><span class="faint small">{label}</span></div>
              <div class="progress" style="margin:8px 0"><i style={`width:${p * 100}%`} /></div>
              <label class="field" style="margin:0"><span>Next step</span>
                <input class="input" placeholder="What’s the very next thing?" defaultValue={g.next_step ?? ''} onChange={(e) => update('goals', g.id, { next_step: (e.target as HTMLInputElement).value || null })} /></label>
            </div>
          )
        }) : <p class="empty">No goals yet. <a href="#/goals">Add one</a>, even a small one.</p>}
      </Card>}

      {step === 3 && <div class="grid-2">
        <div>
          <Card title="Next week" icon="cal" accent="var(--sky)">
            {aheadEv.length === 0 && ahead.length === 0 && <p class="muted small">Nothing scheduled yet.</p>}
            {aheadEv.slice(0, 8).map(({ d, e }) => <div class="row small" style="padding:4px 0"><span class="faint" style="width:76px;flex:none">{fmtDay(d)}</span><span class="grow ellipsis">{e.title}</span></div>)}
            {ahead.length > 0 && <><div class="group-h">Due</div>{ahead.map((t) => <TaskRow t={t} onOpen={setEdit} />)}</>}
          </Card>
        </div>
        <Card title="Set up the week" icon="compass" accent="var(--lilac)">
          <div class="ci-section"><span class="ci-label">Three things that would make next week a success</span><ListInputs values={f.focus} onChange={(v) => setF({ ...f, focus: v })} placeholder="Focus" /></div>
          <div class="ci-section"><span class="ci-label">How was this week overall?</span><ScalePicker value={f.rating} onChange={(v) => setF({ ...f, rating: v })} low="Rough" high="Great" /></div>
        </Card>
      </div>}
      {nav}

      <TaskSheet task={edit} onClose={() => setEdit(null)} />
    </>
  )
}
