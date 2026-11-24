import { useEffect, useState } from 'preact/hooks'
import { useStore, areaByKey } from '../lib/store'
import { lastNDays, fmtDay, dayKey, today } from '../lib/dates'
import { dailySeries, fmtValue, consistency } from '../lib/metrics'
import type { Task, Metric } from '../lib/types'
import { PageHead, Card, Ring, Sheet } from '../ui/kit'
import { LineChart, BarChart } from '../ui/charts'
import { TaskRow, TaskSheet, AddTask, openTask } from './Tasks'
import { goalProgress } from './Goals'
import { MoneyPanel } from './Money'
import { SchoolPanel } from './School'
import { RingPanel } from './Ring'

const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0)

function MetricMini({ m }: { m: Metric }) {
  const logs = useStore((s) => s.logs)
  const days = lastNDays(30)
  const s = dailySeries(m, logs, days)
  const c = consistency(s.slice(-14))
  const a = avg(s)
  return (
    <div class="metric-row">
      <div class="row between small"><span>{m.name}</span><span class="faint">{m.role === 'habit' ? `${c.hit}/14 days` : a != null ? `avg ${fmtValue(m, a)}` : 'no data'}</span></div>
      <BarChart days={days} values={s} color="var(--accent, #a98bff)" target={m.target} />
    </div>
  )
}

function Education({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  // Courses come from the tag each task carries (TickTick lists came over as tags).
  const courses = new Map<string, Task[]>()
  for (const t of tasks) for (const tag of t.tags ?? []) if (/^[A-Z]{2,4}-?\d{3,4}/.test(tag)) courses.set(tag, [...(courses.get(tag) ?? []), t])
  return <>
    {courses.size > 0 && <div class="tiles">{[...courses].map(([c, ts]) => {
      const next = ts.filter((t) => t.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!))[0]
      return <div class="tile" style="--c:var(--lilac)"><div class="t-name">{c}</div><div class="t-sub">{ts.length} open{next ? (next.due_date! < today() ? ' · overdue' : ` · next ${fmtDay(next.due_date!).toLowerCase()}`) : ''}</div></div>
    })}</div>}
  </>
}

function Finances() {
  const metrics = useStore((s) => s.metrics)
  const logs = useStore((s) => s.logs)
  const spend = metrics.find((m) => m.key === 'spend')
  if (!spend) return <MoneyPanel />
  const days = lastNDays(30)
  const s = dailySeries(spend, logs, days)
  const week = sum(s.slice(-7))
  return <>
    <MoneyPanel />
    <Card title="Spending you logged" icon="wallet" accent="var(--gold)" action={<span class="faint small">${Math.round(week)} this week · {s.filter((v) => v === 0).length} no-spend days</span>}>
      <BarChart days={days} values={s} color="#ffd66b" />
      <p class="faint small" style="margin-top:8px">Optional now that Monarch shows your cards. Logging $0 days still counts, and it’s worth celebrating.</p>
    </Card>
  </>
}

const PHASES = ['Breathe in', 'Hold', 'Breathe out', 'Hold'] as const

/** Box breathing, 4-4-4-4, for a minute. Slow exhale steadies the nervous system; the box gives the mind a job. */
function Breathe({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [t, setT] = useState(0)
  useEffect(() => {
    if (!open) { setT(0); return }
    const id = window.setInterval(() => setT((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [open])
  const done = t >= 64
  const phase = PHASES[Math.floor(t / 4) % 4]!
  return (
    <Sheet open={open} onClose={onClose} title="One minute">
      <div class="breathe">
        <div class={`b-circle p${Math.floor(t / 4) % 4}${done ? ' still' : ''}`}><span>{done ? 'Nice.' : phase}</span><b>{done ? '' : 4 - (t % 4)}</b></div>
        <p class="muted small" style="text-align:center;margin:18px 0 14px">{done ? 'Four rounds done. Notice one thing that feels a little different.' : `Round ${Math.floor(t / 16) + 1} of 4. In through the nose, out slow.`}</p>
        <button class="btn block" onClick={() => { done ? onClose() : setT(0) }}>{done ? 'Back' : 'Start over'}</button>
      </div>
    </Sheet>
  )
}

function Mental() {
  const { metrics, logs, checkins, journal } = useStore((s) => s)
  const days = lastNDays(30)
  const k = (key: string) => metrics.find((m) => m.key === key)
  const mood = k('mood') ? dailySeries(k('mood')!, logs, days) : []
  const anx = k('anxiety') ? dailySeries(k('anxiety')!, logs, days) : []
  const med = k('meditation') ? dailySeries(k('meditation')!, logs, days) : []
  const since = days[0]
  const jN = journal.filter((j) => dayKey(new Date(j.occurred_at)) >= since).length
  const ciN = checkins.filter((c) => c.day >= since).length
  const [breathe, setBreathe] = useState(false)
  const sl = k('sleep_hours') ? dailySeries(k('sleep_hours')!, logs, days) : []
  const goodSleep = avg(mood.filter((_, i) => (sl[i] ?? 0) >= 7)), shortSleep = avg(mood.filter((v, i) => v != null && sl[i] != null && sl[i]! < 7))
  const sleepNote = goodSleep != null && shortSleep != null && mood.filter((v) => v != null).length >= 10 && Math.abs(goodSleep - shortSleep) >= 0.5
    ? `After 7+ hours of sleep your mood averaged ${goodSleep.toFixed(1)}, vs ${shortSleep.toFixed(1)} after shorter nights.` : null
  const withMed = avg(mood.filter((_, i) => (med[i] ?? 0) > 0)), without = avg(mood.filter((v, i) => v != null && !((med[i] ?? 0) > 0)))
  return <>
    <div class="stat-row">
      <div class="stat" style="--c:var(--pink)"><div class="s-val">{avg(mood)?.toFixed(1) ?? '–'}</div><div class="s-lbl">avg mood, 30d</div></div>
      <div class="stat" style="--c:var(--mint)"><div class="s-val">{jN}</div><div class="s-lbl">journal entries</div></div>
      <div class="stat" style="--c:var(--orange)"><div class="s-val">{ciN}</div><div class="s-lbl">check-ins</div></div>
    </div>
    <Card title="Mood and anxiety" icon="heart" accent="var(--pink)">
      <LineChart days={days} min={1} max={10} series={[{ label: 'Mood', color: '#ff8cc8', values: mood }, { label: 'Anxiety', color: '#8fc4ff', values: anx }]} />
      <div class="legend"><span><i class="dot" style="background:#ff8cc8" /> Mood</span><span><i class="dot" style="background:#8fc4ff" /> Anxiety</span></div>
      {withMed != null && without != null && Math.abs(withMed - without) >= 0.3 && mood.filter((v) => v != null).length >= 10 && <p class="small" style="margin-top:10px">On days you meditated, mood averaged <b>{withMed.toFixed(1)}</b> vs <b>{without.toFixed(1)}</b> on days you didn’t.</p>}
    </Card>
    <div class="tiles three">
      <button class="tile" style="--c:var(--sky)" onClick={() => setBreathe(true)}><div class="t-name">Breathe</div><div class="t-sub">One minute, guided</div></button>
      <a class="tile" href="#/journal" style="--c:var(--mint)"><div class="t-name">Write</div><div class="t-sub">Get it out of your head</div></a>
      <a class="tile" href="#/checkin/night" style="--c:var(--violet)"><div class="t-name">Night check-in</div><div class="t-sub">Wind down</div></a>
    </div>
    {sleepNote && <p class="small muted" style="margin:-4px 0 14px">{sleepNote}</p>}
    <p class="faint tiny" style="margin-bottom:14px">If it ever gets to be too much, you can call or text 988 any time.</p>
    <Breathe open={breathe} onClose={() => setBreathe(false)} />
  </>
}

export function AreaView({ areaKey }: { areaKey: string }) {
  const a = useStore(() => areaByKey(areaKey))
  const tasks = useStore((s) => s.tasks)
  const goals = useStore((s) => s.goals)
  const metrics = useStore((s) => s.metrics)
  const [edit, setEdit] = useState<Task | null>(null)
  if (!a) return <p class="empty">That area doesn’t exist.</p>
  const open = tasks.filter((t) => openTask(t) && t.area_id === a.id)
  const gs = goals.filter((g) => g.area_id === a.id && g.status === 'active' && !g.suggested)
  const ms = metrics.filter((m) => m.active && m.area_id === a.id && !(a.key === 'finances' && m.key === 'spend') && !(a.key === 'mental' && ['mood', 'anxiety'].includes(m.key)))
  const doneWeek = tasks.filter((t) => t.area_id === a.id && t.status === 'done' && t.completed_at && Date.now() - new Date(t.completed_at).getTime() < 7 * 864e5).length
  return (
    <div style={`--accent:${a.color}`}>
      <PageHead title={a.name} back="#/more" sub={`${open.length} open · ${doneWeek} done this week`} icon={a.key === 'education' ? 'school' : a.key === 'finances' ? 'wallet' : a.key === 'mental' ? 'brain' : 'layers'} color={a.color ?? undefined} />
      {a.key === 'finances' && <Finances />}
      {a.key === 'mental' && <Mental />}
      {a.key === 'education' && <SchoolPanel />}
      {a.key === 'health' && <RingPanel />}
      <div class="grid-2">
        <div>
          {a.key === 'education' && <Education tasks={open} onOpen={setEdit} />}
          <Card title="Tasks" icon="tasks" accent={a.color ?? undefined}>
            <AddTask defaults={{ area_id: a.id }} placeholder={`Add to ${a.name.toLowerCase()}…`} />
            {open.length ? open.sort((x, y) => (x.due_date ?? '9').localeCompare(y.due_date ?? '9')).map((t) => <TaskRow t={t} onOpen={setEdit} />) : <p class="empty" style="padding:8px">Nothing open here.</p>}
          </Card>
        </div>
        <div>
          <Card title="Goals" icon="target" accent="var(--gold)" action={<a class="link" href="#/goals">All</a>}>
            {gs.length ? gs.map((g) => { const { p, label } = goalProgress(g); return <div class="row" style="padding:8px 0"><Ring value={p} size={38} stroke={4} /><span class="grow"><div>{g.title}</div><div class="faint small">{g.next_step ? `Next: ${g.next_step}` : label}</div></span></div> }) : <p class="muted small">No goals for {a.name.toLowerCase()} yet. <a href="#/goals">Add one</a>.</p>}
          </Card>
          {ms.length > 0 && <Card title="Trackers" icon="sliders">{ms.map((m) => <MetricMini m={m} />)}</Card>}
        </div>
      </div>
      <TaskSheet task={edit} onClose={() => setEdit(null)} />
    </div>
  )
}
