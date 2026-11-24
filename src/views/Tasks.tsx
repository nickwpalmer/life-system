import { useEffect, useState } from 'preact/hooks'
import { useStore, toast, areaById, getState } from '../lib/store'
import { addTask, setTaskDone, update, remove, restore } from '../lib/db'
import { parseQuick } from '../lib/parse'
import { today, inDays, fmtDay, fmtClock, daysUntil, weekStart, dayKey, addDays } from '../lib/dates'
import type { Task, TaskStatus } from '../lib/types'
import { Icon } from '../ui/icons'
import { Sheet, PageHead, burst, haptic } from '../ui/kit'

export const openTask = (t: Task) => t.status !== 'done' && t.status !== 'dropped'

export function dueLabel(t: Task) {
  if (!t.due_date) return null
  const n = daysUntil(t.due_date)
  const cls = n < 0 ? 'overdue' : n <= 1 ? 'soon' : ''
  const txt = n < 0 ? (n === -1 ? 'Yesterday' : `${-n} days late`) : fmtDay(t.due_date)
  return <span class={cls}>{txt}{t.due_time ? ` ${fmtClock(t.due_time)}` : ''}</span>
}

export function TaskRow({ t, onOpen, process }: { t: Task; onOpen: (t: Task) => void; process?: boolean }) {
  const a = areaById(t.area_id)
  const done = t.status === 'done'
  const goal = useStore((s) => s.goals.find((g) => g.id === t.goal_id))
  function toggle(e: Event) {
    e.stopPropagation(); haptic()
    if (!done) burst(e.currentTarget as Element)
    setTaskDone(t.id, !done).catch(() => {})
    if (!done) toast('Done', () => setTaskDone(t.id, false))
  }
  const file = (patch: Partial<Task>, msg: string) => { update('tasks', t.id, { status: 'open', ...patch }).then(() => toast(msg)).catch(() => {}) }
  return (
    <div class={`task ${done ? 'done' : ''}`}>
      <button class={`check p${t.priority} ${done ? 'on' : ''}`} aria-label={done ? 'Mark not done' : 'Mark done'} onClick={toggle}><Icon name="check" size={15} stroke={3} /></button>
      <div class="grow" onClick={() => onOpen(t)} style="cursor:pointer">
        <div class="t-title">{t.title}</div>
        <div class="t-meta">
          {dueLabel(t)}
          {a && <span class="pill" style={`--c:${a.color}`}>{a.name}</span>}
          {t.status === 'waiting' && <span class="pill" style="--c:var(--sky)">Waiting</span>}
          {goal && <span class="row" style="gap:3px"><Icon name="target" size={12} />{goal.title}</span>}
          {t.tags?.filter((x) => x !== 'someday').slice(0, 2).map((x) => <span>#{x}</span>)}
        </div>
        {process && !done && (
          <div class="process" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => file({ due_date: today() }, 'Moved to today')}>Today</button>
            <button onClick={() => file({ due_date: inDays(1) }, 'Moved to tomorrow')}>Tomorrow</button>
            <button onClick={() => file({ due_date: dayKey(addDays(weekStart(), 7)) }, 'Moved to next week')}>Next week</button>
            <button onClick={() => file({}, 'Filed, no date')}>No date</button>
            <button onClick={() => file({ tags: [...(t.tags ?? []), 'someday'] }, 'Moved to someday')}>Someday</button>
            <button onClick={() => onOpen(t)}>Edit</button>
          </div>
        )}
      </div>
    </div>
  )
}

export function TaskSheet({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const areas = useStore((s) => s.areas.filter((a) => !a.archived))
  const goals = useStore((s) => s.goals.filter((g) => g.status === 'active' && !g.suggested))
  const [f, setF] = useState<Partial<Task>>({})
  useEffect(() => { if (task) setF({ ...task }) }, [task?.id])
  if (!task) return <Sheet open={false} onClose={onClose}>{null}</Sheet>
  async function save() {
    if (!f.title?.trim()) return
    const { title, notes, area_id, due_date, due_time, priority, status, goal_id, tags } = f
    const st = status === 'inbox' && (due_date || area_id) ? 'open' : status
    try { await update('tasks', task!.id, { title: title.trim(), notes: notes || null, area_id: area_id ?? null, due_date: due_date || null, due_time: due_time || null, priority: priority ?? 0, status: st, goal_id: goal_id ?? null, tags: tags ?? [] }); onClose() } catch { /* shown */ }
  }
  async function del() {
    const row = getState().tasks.find((x) => x.id === task!.id)
    onClose()
    await remove('tasks', task!.id).catch(() => {})
    if (row) toast('Task deleted', () => restore('tasks', row as never))
  }
  const someday = f.tags?.includes('someday')
  return (
    <Sheet open={!!task} onClose={save} title="Task">
      <input class="input title bare" value={f.title ?? ''} onInput={(e) => setF({ ...f, title: (e.target as HTMLInputElement).value })} />
      <textarea class="input" style="margin:8px 0 14px;min-height:70px" placeholder="Notes, links, next step…" value={f.notes ?? ''} onInput={(e) => setF({ ...f, notes: (e.target as HTMLTextAreaElement).value })} />
      <div class="row">
        <label class="field grow"><span>Due</span><input class="input" type="date" value={f.due_date ?? ''} onInput={(e) => setF({ ...f, due_date: (e.target as HTMLInputElement).value || null })} /></label>
        <label class="field" style="width:42%"><span>Time</span><input class="input" type="time" value={f.due_time?.slice(0, 5) ?? ''} onInput={(e) => setF({ ...f, due_time: (e.target as HTMLInputElement).value || null })} /></label>
      </div>
      <div class="chips" style="margin:-4px 0 14px">
        {[['Today', today()], ['Tomorrow', inDays(1)], ['Next week', dayKey(addDays(weekStart(), 7))], ['No date', null]].map(([l, d]) => <button class={`chip ${f.due_date === d ? 'on' : ''}`} onClick={() => setF({ ...f, due_date: d })}>{l}</button>)}
      </div>
      <div class="field"><span>Area</span><div class="chips">{areas.map((a) => <button class={`chip ${f.area_id === a.id ? 'on' : ''}`} style={`--c:${a.color}`} onClick={() => setF({ ...f, area_id: f.area_id === a.id ? null : a.id })}><i class="dot" style={`background:${a.color}`} />{a.name}</button>)}</div></div>
      <div class="field"><span>Priority</span><div class="chips">{[['None', 0, 'var(--faint)'], ['Low', 1, 'var(--sky)'], ['Medium', 2, 'var(--orange)'], ['High', 3, 'var(--coral)']].map(([l, p, c]) => <button class={`chip ${f.priority === p ? 'on' : ''}`} style={`--c:${c}`} onClick={() => setF({ ...f, priority: p as number })}>{l}</button>)}</div></div>
      <div class="field"><span>Status</span><div class="chips">
        {([['inbox', 'Inbox'], ['open', 'To do'], ['doing', 'Doing'], ['waiting', 'Waiting on someone']] as [TaskStatus, string][]).map(([s, l]) => <button class={`chip ${f.status === s ? 'on' : ''}`} onClick={() => setF({ ...f, status: s })}>{l}</button>)}
        <button class={`chip ${someday ? 'on' : ''}`} onClick={() => setF({ ...f, tags: someday ? (f.tags ?? []).filter((x) => x !== 'someday') : [...(f.tags ?? []), 'someday'] })}>Someday</button>
      </div></div>
      {goals.length > 0 && <div class="field"><span>Moves this goal forward</span><div class="chips">{goals.map((g) => <button class={`chip ${f.goal_id === g.id ? 'on' : ''}`} style="--c:var(--gold)" onClick={() => setF({ ...f, goal_id: f.goal_id === g.id ? null : g.id })}>{g.title}</button>)}</div></div>}
      <button class="btn primary block" onClick={save}>Save</button>
      <button class="btn ghost danger block" style="margin-top:8px" onClick={del}><Icon name="trash" size={18} /> Delete</button>
    </Sheet>
  )
}

/** Quick add bar: understands dates, times, !priority and #area as you type. */
export function AddTask({ defaults, placeholder = 'Add a task… try “essay fri 5pm #education”' }: { defaults?: Partial<Task>; placeholder?: string }) {
  const areas = useStore((s) => s.areas)
  const [v, setV] = useState('')
  const p = parseQuick(v, areas)
  async function add(e: Event) {
    e.preventDefault()
    if (!v.trim()) return
    const title = p.title || v.trim()
    setV('')
    const d = defaults ?? {}
    const status = d.status === 'inbox' && (p.due_date || p.area_id) ? 'open' : d.status ?? 'open'
    addTask({ ...d, title, status, due_date: p.due_date ?? d.due_date ?? null, due_time: p.due_time, priority: p.priority || d.priority || 0, area_id: p.area_id ?? d.area_id ?? null }).catch(() => {})
  }
  const a = areas.find((x) => x.id === p.area_id)
  return (
    <form onSubmit={add} style="margin-bottom:14px">
      <div class="add-row">
        <input class="input" placeholder={placeholder} value={v} onInput={(e) => setV((e.target as HTMLInputElement).value)} />
        <button class="icon-btn" style="width:48px;height:48px;background:var(--grad);color:#1d1330;border:0" aria-label="Add task"><Icon name="plus" stroke={2.6} /></button>
      </div>
      <p class="hint">{v.trim() && (p.due_date || a || p.priority) ? <>{p.due_date && <><b>{fmtDay(p.due_date)}</b>{p.due_time ? <> {fmtClock(p.due_time)}</> : null} </>}{a && <><b>{a.name}</b> </>}{p.priority ? <b>{p.priority === 3 ? 'high' : 'medium'} priority</b> : null}</> : ''}</p>
    </form>
  )
}

type View = 'home' | 'inbox' | 'today' | 'upcoming' | 'someday' | 'done'

/** Which class a task belongs to, from a tag like MAT-2010 or the course code in its title. */
export function courseOf(t: Task): string | null {
  for (const g of t.tags ?? []) { const m = g.match(/^([A-Z]{2,4})[- ]?(\d{3,4})$/i); if (m) return `${m[1].toUpperCase()} ${m[2]}` }
  const m = t.title.match(/\b([A-Z]{2,4})[ -]?(\d{3,4})\b/)
  return m ? `${m[1]} ${m[2]}` : null
}
export const KINDS = [
  { key: 'exam', label: 'Exam prep', test: /\b(exam|test|quiz|final|midterm|study)\b/i },
  { key: 'hw', label: 'Homework', test: /\b(hw|homework|problem set|pset|assignment|worksheet|essay|report|paper|project)\b/i },
  { key: 'class', label: 'Class activities', test: /\b(lab|activity|class|lecture|reading|read|chapter|discussion|lesson|seminar)\b/i },
] as const
export const kindOf = (t: Task) => KINDS.find((k) => k.test.test(t.title))?.key ?? 'other'

/** One area's tasks. School work is split by class, then homework, exam prep and class activities. */
function AreaTasks({ areaKey }: { areaKey: string }) {
  const tasks = useStore((s) => s.tasks)
  const area = useStore((s) => s.areas.find((a) => a.key === areaKey))
  const [edit, setEdit] = useState<Task | null>(null)
  const t0 = today()
  const mine = tasks.filter((t) => openTask(t) && t.status !== 'inbox' && (areaKey === 'none' ? !t.area_id : t.area_id === area?.id))
  const byDue = (a: Task, b: Task) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || b.priority - a.priority
  const row = (t: Task) => <TaskRow t={t} onOpen={setEdit} />
  const doneWeek = tasks.filter((t) => t.status === 'done' && (areaKey === 'none' ? !t.area_id : t.area_id === area?.id) && t.completed_at && dayKey(new Date(t.completed_at)) >= dayKey(addDays(new Date(), -7))).length
  let body
  if (areaKey === 'education') {
    const courses = new Map<string, Task[]>()
    for (const t of mine.sort(byDue)) { const c = courseOf(t) ?? 'Other school'; courses.set(c, [...(courses.get(c) ?? []), t]) }
    body = [...courses].map(([c, ts]) => (
      <section class="card" style={`--accent:${area?.color}`}>
        <div class="card-h"><h2>{c}</h2><span class="faint small">{ts.length} open{ts.some((x) => x.due_date && x.due_date < t0) ? ` · ${ts.filter((x) => x.due_date && x.due_date < t0).length} late` : ''}</span></div>
        {[...KINDS, { key: 'other', label: 'Other' }].map((k) => { const g = ts.filter((x) => kindOf(x) === k.key); return g.length ? <><div class="group-h"><span>{k.label}</span><span>{g.length}</span></div>{g.map(row)}</> : null })}
      </section>
    ))
  } else {
    const late = mine.filter((t) => t.due_date && t.due_date < t0).sort(byDue)
    const now = mine.filter((t) => t.due_date === t0 || t.scheduled_for === t0 || t.status === 'doing')
    const later = mine.filter((t) => t.due_date && t.due_date > t0 && !now.includes(t)).sort(byDue)
    const any = mine.filter((t) => !t.due_date && !now.includes(t)).sort((a, b) => b.priority - a.priority)
    body = <section class="card" style={`--accent:${area?.color ?? 'var(--violet)'}`}>
      {([['Overdue', late], ['Today', now], ['Coming up', later], ['Anytime', any]] as const).map(([l, g]) => g.length ? <><div class="group-h"><span>{l}</span><span>{g.length}</span></div>{g.map(row)}</> : null)}
      {!mine.length && <p class="empty">Nothing open here.</p>}
    </section>
  }
  return (
    <>
      <PageHead title={area?.name ?? 'No area'} sub={`${mine.length} open · ${doneWeek} done this week`} back="#/tasks" icon="tasks" color={area?.color ?? 'var(--violet)'} />
      <AddTask defaults={{ area_id: area?.id ?? null, status: 'open' }} placeholder={`Add to ${area?.name ?? 'tasks'}…`} />
      {body}
      <TaskSheet task={edit} onClose={() => setEdit(null)} />
    </>
  )
}

/** The Tasks front page: capture at the top, then one tile per area with what's due and late. */
function Overview({ go }: { go: (v: View) => void }) {
  const tasks = useStore((s) => s.tasks)
  const areas = useStore((s) => s.areas)
  const t0 = today()
  const live = tasks.filter((t) => openTask(t) && t.status !== 'inbox')
  const inbox = tasks.filter((t) => t.status === 'inbox').length
  const cards = [...areas.filter((a) => !a.archived), { id: null, key: 'none', name: 'No area', color: 'var(--faint)' }].map((a) => {
    const mine = live.filter((t) => (t.area_id ?? null) === a.id)
    return { a, open: mine.length, late: mine.filter((t) => t.due_date && t.due_date < t0).length, today: mine.filter((t) => t.due_date === t0 || t.status === 'doing').length, week: mine.filter((t) => t.due_date && t.due_date > t0 && daysUntil(t.due_date) <= 7).length }
  }).filter((c) => c.open)
  return (
    <>
      {inbox > 0 && <button class="card prompt" style="--accent:var(--violet);width:100%" onClick={() => go('inbox')}><span class="orb cool"><Icon name="inbox" size={22} /></span><span class="grow" style="text-align:left"><h3>{inbox} to sort</h3><p class="muted small">Give each one a day or an area.</p></span><Icon name="chev" /></button>}
      <div class="atiles">
        {cards.map((c) => (
          <a class="atile" href={`#/tasks/${c.a.key}`} style={`--c:${c.a.color}`}>
            <div class="a-name">{c.a.name}</div>
            <div class="a-n">{c.open}<span> open</span></div>
            <div class="a-meta">{c.late > 0 && <span class="pill late">{c.late} late</span>}{c.today > 0 && <span class="pill">{c.today} today</span>}{c.week > 0 && <span class="pill quiet">{c.week} this week</span>}</div>
          </a>
        ))}
      </div>
    </>
  )
}

export function Tasks({ initial, areaKey }: { initial?: View; areaKey?: string }) {
  if (areaKey) return <AreaTasks areaKey={areaKey} />
  return <TaskLists initial={initial} />
}

function TaskLists({ initial }: { initial?: View }) {
  const tasks = useStore((s) => s.tasks)
  const inboxN = tasks.filter((t) => t.status === 'inbox').length
  const [view, setView] = useState<View>(initial ?? 'home')
  const [edit, setEdit] = useState<Task | null>(null)
  const t0 = today()
  const open = tasks.filter(openTask)
  const active = open.filter((t) => t.status !== 'inbox' && !t.tags?.includes('someday'))
  const byDue = (a: Task, b: Task) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || (a.due_time ?? '').localeCompare(b.due_time ?? '') || b.priority - a.priority
  const todayList = active.filter((t) => t.due_date && t.due_date <= t0 || t.status === 'doing').sort(byDue)
  const upcoming = active.filter((t) => t.due_date && t.due_date > t0).sort(byDue)
  const nodate = active.filter((t) => !t.due_date && t.status !== 'doing').sort((a, b) => b.priority - a.priority)
  const row = (t: Task) => <TaskRow t={t} onOpen={setEdit} process={view === 'inbox'} />

  const tabs: [View, string, number?][] = [['home', 'Overview'], ['inbox', 'Inbox', inboxN], ['today', 'Today', todayList.length], ['upcoming', 'Upcoming'], ['someday', 'Someday'], ['done', 'Done']]
  let body
  if (view === 'home') body = <Overview go={setView} />
  else if (view === 'inbox') {
    const inbox = open.filter((t) => t.status === 'inbox').sort((a, b) => a.created_at.localeCompare(b.created_at))
    body = <section class="card">
      <p class="muted small" style="margin-bottom:6px">Give each one a home: a day, or no date. If it takes two minutes, just do it.</p>
      {inbox.length ? inbox.map(row) : <p class="empty">Inbox zero. Anything you capture lands here first.</p>}
    </section>
  } else if (view === 'today') {
    body = <>
      <section class="card">{todayList.length ? todayList.map(row) : <p class="empty">Nothing due today. Pick something from below, or enjoy it.</p>}</section>
      {nodate.length > 0 && <section class="card"><div class="card-h"><h2>Anytime</h2><span class="faint small">{nodate.length}</span></div>{nodate.slice(0, 12).map(row)}</section>}
    </>
  } else if (view === 'upcoming') {
    const groups = new Map<string, Task[]>()
    for (const t of upcoming) { const k = t.due_date!; groups.set(k, [...(groups.get(k) ?? []), t]) }
    body = <section class="card">{upcoming.length ? [...groups].map(([d, ts]) => <><div class="group-h"><span>{fmtDay(d)}</span><span>{daysUntil(d)}d</span></div>{ts.map(row)}</>) : <p class="empty">Nothing scheduled ahead.</p>}</section>
  } else if (view === 'someday') {
    const s = open.filter((t) => t.tags?.includes('someday'))
    body = <section class="card"><p class="muted small" style="margin-bottom:6px">Ideas you’re not committing to yet. Look through them in your weekly review.</p>{s.length ? s.map(row) : <p class="empty">Nothing parked here.</p>}</section>
  } else {
    const since = dayKey(addDays(new Date(), -14))
    const d = tasks.filter((t) => t.status === 'done' && t.completed_at && dayKey(new Date(t.completed_at)) >= since).sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    body = <section class="card"><div class="card-h"><h2>Last two weeks</h2><span class="faint small">{d.length} done</span></div>{d.length ? d.map(row) : <p class="empty">Finished tasks show up here.</p>}</section>
  }

  return (
    <>
      <PageHead title="Tasks" icon="tasks" color="var(--violet)" />
      <AddTask defaults={view === 'today' ? { due_date: t0 } : view === 'inbox' ? { status: 'inbox' } : undefined} />
      <div class="chips scroll" style="margin-bottom:14px">
        {tabs.map(([v, l, n]) => <button class={`chip ${view === v ? 'on' : ''}`} onClick={() => setView(v)}>{l}{n ? <span class={`badge ${v === 'inbox' ? '' : 'quiet'}`} style="height:18px;min-width:18px;font-size:11px">{n}</span> : null}</button>)}
      </div>
      {body}
      <TaskSheet task={edit} onClose={() => setEdit(null)} />
    </>
  )
}
