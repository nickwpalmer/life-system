import { useEffect, useState } from 'preact/hooks'
import { useStore, toast, areaById, getState, allTags } from '../lib/store'
import { REPEATS, repeatLabel, nextDue } from '../lib/repeat'
import { addTask, setTaskDone, update, remove, restore } from '../lib/db'
import { parseQuick } from '../lib/parse'
import { today, inDays, fmtDay, fmtClock, daysUntil, weekStart, dayKey, addDays } from '../lib/dates'
import type { Task, TaskStatus } from '../lib/types'
import { Icon } from '../ui/icons'
import { Sheet, PageHead, burst, haptic, SortBtn, useSort } from '../ui/kit'
import { PeopleText } from './People'

export const openTask = (t: Task) => t.status !== 'done' && t.status !== 'dropped'

/** "Do it by" shortcuts: end of this week (Sunday) and end of this month. */
export const endOfWeek = () => dayKey(addDays(weekStart(), 6))
export const endOfMonth = () => { const d = new Date(); return dayKey(new Date(d.getFullYear(), d.getMonth() + 1, 0)) }
export const BY: [string, () => string | null][] = [['Today', today], ['Tomorrow', () => inDays(1)], ['This week', endOfWeek], ['This month', endOfMonth], ['No date', () => null]]

type SortK = 'due' | 'priority' | 'newest' | 'oldest'
export const TASK_SORTS: [SortK, string][] = [['due', 'Due date'], ['priority', 'Priority'], ['newest', 'Newest'], ['oldest', 'Oldest']]
export const sortTasks = (k: SortK) => (a: Task, b: Task) =>
  k === 'priority' ? b.priority - a.priority || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
  : k === 'newest' ? b.created_at.localeCompare(a.created_at)
  : k === 'oldest' ? a.created_at.localeCompare(b.created_at)
  : (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || (a.due_time ?? '').localeCompare(b.due_time ?? '') || b.priority - a.priority

export function dueLabel(t: Task) {
  if (!t.due_date) return null
  const n = daysUntil(t.due_date)
  const cls = n < 0 ? 'overdue' : n <= 1 ? 'soon' : ''
  const txt = n < 0 ? (n === -1 ? 'Yesterday' : `${-n} days late`) : fmtDay(t.due_date)
  return <span class={cls}>{txt}{t.due_time ? ` ${fmtClock(t.due_time)}` : ''}</span>
}

/** A checklist lives in a task's notes as lines like "- [ ] step" and "- [x] step". */
const CHECK = /^- \[( |x)\] (.+)$/i
export function checklist(notes: string | null | undefined) {
  return (notes ?? '').split('\n').map((l, i) => { const m = l.match(CHECK); return m ? { i, done: m[1].toLowerCase() === 'x', text: m[2] } : null }).filter(Boolean) as { i: number; done: boolean; text: string }[]
}
function toggleLine(notes: string, i: number) {
  return notes.split('\n').map((l, j) => j === i ? l.replace(/^- \[( |x)\]/i, (m) => m.toLowerCase() === '- [x]' ? '- [ ]' : '- [x]') : l).join('\n')
}

export function TaskRow({ t, onOpen, process }: { t: Task; onOpen: (t: Task) => void; process?: boolean }) {
  const a = areaById(t.area_id)
  const done = t.status === 'done'
  const goal = useStore((s) => s.goals.find((g) => g.id === t.goal_id))
  function toggle(e: Event) {
    e.stopPropagation(); haptic()
    if (!done) burst(e.currentTarget as Element)
    setTaskDone(t.id, !done).catch(() => {})
    if (!done) toast(t.recurrence ? `Done. Next one ${fmtDay(nextDue(t.recurrence, t.due_date))}` : 'Done', () => setTaskDone(t.id, false))
  }
  const file = (patch: Partial<Task>, msg: string) => { update('tasks', t.id, { status: 'open', ...patch }).then(() => toast(msg)).catch(() => {}) }
  return (
    <div class={`task ${done ? 'done' : ''}`}>
      <button class={`check p${t.priority} ${done ? 'on' : ''}`} aria-label={done ? 'Mark not done' : 'Mark done'} onClick={toggle}><Icon name="check" size={15} stroke={3} /></button>
      <div class="grow" onClick={() => onOpen(t)} style="cursor:pointer">
        <div class="t-title"><PeopleText text={t.title} /></div>
        <div class="t-meta">
          {dueLabel(t)}
          {t.recurrence && <span class="row" style="gap:3px" title={repeatLabel(t.recurrence) ?? ''}><Icon name="repeat" size={12} />{repeatLabel(t.recurrence)}</span>}
          {(() => { const c = checklist(t.notes); return c.length ? <span class="row" style="gap:3px"><Icon name="list" size={12} />{c.filter((x) => x.done).length}/{c.length}</span> : null })()}
          {a && <span class="pill" style={`--c:${a.color}`}>{a.name}</span>}
          {t.status === 'waiting' && <span class="pill" style="--c:var(--sky)">Waiting</span>}
          {goal && <span class="row" style="gap:3px"><Icon name="target" size={12} />{goal.title}</span>}
          {t.tags?.filter((x) => x !== 'someday' && !courseOf({ ...t, tags: [x] } as Task)).slice(0, 2).map((x) => <span>#{x}</span>)}
        </div>
        {process && !done && (
          <div class="process" onClick={(e) => e.stopPropagation()}>
            <span class="p-l">Do by</span>
            {BY.map(([l, d]) => <button onClick={() => { const v = d(); file({ due_date: v }, v ? `Do by ${fmtDay(v).toLowerCase() === 'today' ? 'today' : fmtDay(v)}` : 'Filed, no date') }}>{l}</button>)}
            <button onClick={() => file({ tags: [...(t.tags ?? []), 'someday'] }, 'Moved to someday')}>Someday</button>
            <span class="p-l">Priority</span>
            {([[1, 'Low'], [2, 'Med'], [3, 'High']] as const).map(([p, l]) => <button class={t.priority === p ? 'on' : ''} onClick={() => update('tasks', t.id, { priority: t.priority === p ? 0 : p }).catch(() => {})}>{l}</button>)}
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
    const { title, notes, area_id, due_date, due_time, priority, status, goal_id, tags, recurrence } = f
    const st = status === 'inbox' && (due_date || area_id) ? 'open' : status
    try { await update('tasks', task!.id, { title: title.trim(), notes: notes || null, area_id: area_id ?? null, due_time: due_time || null, priority: priority ?? 0, status: st, goal_id: goal_id ?? null, tags: tags ?? [], recurrence: recurrence || null, due_date: recurrence && !due_date ? today() : due_date || null }); onClose() } catch { /* shown */ }
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
      {checklist(f.notes).length > 0 && <div class="tchecks">{checklist(f.notes).map((c) => (
        <button class={`tcheck ${c.done ? 'on' : ''}`} onClick={() => { haptic(); const notes = toggleLine(f.notes ?? '', c.i); setF({ ...f, notes }); update('tasks', task!.id, { notes }).catch(() => {}) }}>
          <span class="tbox"><Icon name="check" size={12} stroke={3} /></span><span class="grow">{c.text}</span>
        </button>
      ))}</div>}
      <Subtasks task={task} />
      <textarea class="input" style="margin:8px 0 14px;min-height:70px" placeholder="Notes, links, next step… Start a line with - [ ] for a checklist" value={f.notes ?? ''} onInput={(e) => setF({ ...f, notes: (e.target as HTMLTextAreaElement).value })} />
      <div class="row">
        <label class="field grow"><span>Do by</span><input class="input" type="date" value={f.due_date ?? ''} onInput={(e) => setF({ ...f, due_date: (e.target as HTMLInputElement).value || null })} /></label>
        <label class="field" style="width:42%"><span>Time</span><input class="input" type="time" value={f.due_time?.slice(0, 5) ?? ''} onInput={(e) => setF({ ...f, due_time: (e.target as HTMLInputElement).value || null })} /></label>
      </div>
      <div class="chips" style="margin:-4px 0 14px">
        {BY.map(([l, fn]) => { const d = fn(); return <button class={`chip ${f.due_date === d ? 'on' : ''}`} onClick={() => setF({ ...f, due_date: d })}>{l}</button> })}
      </div>
      <div class="field"><span>Repeat</span><div class="chips">
        {REPEATS.map(([k, l]) => <button class={`chip ${f.recurrence === k ? 'on' : ''}`} style="--c:var(--teal)" onClick={() => setF({ ...f, recurrence: f.recurrence === k ? null : k })}>{l}</button>)}
      </div></div>
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

/** Steps of a bigger task: real tasks with parent_id, shown inside the parent. A child shows which task it belongs to. */
function Subtasks({ task }: { task: Task }) {
  const kids = useStore((s) => s.tasks.filter((x) => x.parent_id === task.id && x.status !== 'dropped'))
  const parent = useStore((s) => task.parent_id ? s.tasks.find((x) => x.id === task.parent_id) : undefined)
  const [v, setV] = useState('')
  return (
    <div class="subtasks">
      {parent && <div class="faint tiny" style="margin:2px 0 8px"><Icon name="layers" size={12} /> Step of: {parent.title}</div>}
      {kids.length > 0 && <div class="tchecks">{kids.sort((a, b) => a.created_at.localeCompare(b.created_at)).map((k) => (
        <button class={`tcheck ${k.status === 'done' ? 'on' : ''}`} onClick={() => { haptic(); setTaskDone(k.id, k.status !== 'done').catch(() => {}) }}>
          <span class="tbox"><Icon name="check" size={12} stroke={3} /></span><span class="grow">{k.title}</span>
        </button>
      ))}</div>}
      {!task.parent_id && <form class="add-row" style="margin:4px 0 2px" onSubmit={(e) => { e.preventDefault(); const t = v.trim(); if (!t) return; setV(''); addTask({ title: t, parent_id: task.id, area_id: task.area_id, tags: task.tags ?? [], status: 'open' }).catch(() => {}) }}>
        <input class="input" style="height:38px;font-size:14px" placeholder="+ Add a step" value={v} onInput={(e) => setV((e.target as HTMLInputElement).value)} />
      </form>}
    </div>
  )
}

/** Quick add bar: understands dates, times, !priority and #area as you type. */
export function AddTask({ defaults, placeholder = 'Add a task' }: { defaults?: Partial<Task>; placeholder?: string }) {
  const areas = useStore((s) => s.areas)
  const [v, setV] = useState('')
  const [focus, setFocus] = useState(false)
  const p = parseQuick(v, areas, allTags())
  async function add(e: Event) {
    e.preventDefault()
    if (!v.trim()) return
    const title = p.title || v.trim()
    setV('')
    const d = defaults ?? {}
    const status = d.status === 'inbox' && (p.due_date || p.area_id || p.tag) ? 'open' : d.status ?? 'open'
    addTask({ ...d, title, status, due_date: p.due_date ?? d.due_date ?? null, due_time: p.due_time, priority: p.priority || d.priority || 0, area_id: p.area_id ?? d.area_id ?? null, recurrence: p.recurrence ?? d.recurrence ?? null, tags: [...new Set([...(d.tags ?? []), ...(p.tag ? [p.tag] : [])])] }).catch(() => {})
  }
  const a = areas.find((x) => x.id === p.area_id)
  return (
    <form onSubmit={add} style="margin-bottom:14px">
      <div class="add-row">
        <input class="input" placeholder={placeholder} value={v} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)} onInput={(e) => setV((e.target as HTMLInputElement).value)} />
        {v.trim() && <button class="icon-btn add-go" aria-label="Add task"><Icon name="plus" stroke={2.6} /></button>}
      </div>
      {(focus || v.trim()) && <p class="hint">{v.trim() && (p.due_date || a || p.priority || p.recurrence || p.tag) ? <>{p.due_date && <><b>{fmtDay(p.due_date)}</b>{p.due_time ? <> {fmtClock(p.due_time)}</> : null} </>}{p.recurrence && <><b>{repeatLabel(p.recurrence)!.toLowerCase()}</b> </>}{a && <><b>{a.name}</b> </>}{p.tag && <><b>#{p.tag}</b> </>}{p.priority ? <b>{p.priority === 3 ? 'high' : 'medium'} priority</b> : null}</> : 'Add a day, time, repeat or #area, like “essay fri 5pm #education” or “gym every mon”.'}</p>}
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
  const [sort, setSort] = useSort<SortK>('area-tasks', 'due')
  const t0 = today()
  const mine = tasks.filter((t) => openTask(t) && t.status !== 'inbox' && (areaKey === 'none' ? !t.area_id : t.area_id === area?.id))
  const byDue = sortTasks(sort)
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
    const any = mine.filter((t) => !t.due_date && !now.includes(t)).sort(sort === 'due' ? sortTasks('priority') : byDue)
    body = <section class="card" style={`--accent:${area?.color ?? 'var(--violet)'}`}>
      {([['Overdue', late], ['Today', now], ['Coming up', later], ['Anytime', any]] as const).map(([l, g]) => g.length ? <><div class="group-h"><span>{l}</span><span>{g.length}</span></div>{g.map(row)}</> : null)}
      {!mine.length && <p class="empty">Nothing open here.</p>}
    </section>
  }
  return (
    <>
      <PageHead title={area?.name ?? 'No area'} sub={`${mine.length} open · ${doneWeek} done this week`} back="#/tasks" icon="tasks" color={area?.color ?? 'var(--violet)'} action={<SortBtn value={sort} options={TASK_SORTS} onChange={setSort} />} />
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
  const lists = listTags(tasks)
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
      {lists.length > 0 && <>
        <div class="group-h" style="margin:18px 4px 8px"><span>Lists</span><span class="faint">type #name to add</span></div>
        <div class="chips">{lists.map(([g, n]) => <a class="chip" style="--c:var(--teal)" href={`#/tasks/list-${encodeURIComponent(g)}`}><Icon name="list" size={15} />{g}<span class="badge quiet" style="height:18px;min-width:18px;font-size:11px">{n}</span></a>)}</div>
      </>}
    </>
  )
}

/** Tags that work as lists (Shopping, car…): not class codes, not someday. */
const NOT_LISTS = new Set(['someday', 'personal'])
export const listTags = (tasks: Task[]) => {
  const n = new Map<string, number>()
  for (const t of tasks) if (openTask(t)) for (const g of t.tags ?? []) if (!NOT_LISTS.has(g.toLowerCase()) && !courseOf({ ...t, title: '', tags: [g] })) n.set(g, (n.get(g) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1])
}

/** One list (a tag): everything open with it, plus a quick add that files into it. */
function TagTasks({ tag }: { tag: string }) {
  const tasks = useStore((s) => s.tasks)
  const [edit, setEdit] = useState<Task | null>(null)
  const mine = tasks.filter((t) => openTask(t) && t.tags?.some((g) => g.toLowerCase() === tag.toLowerCase())).sort(sortTasks('due'))
  const name = mine[0]?.tags?.find((g) => g.toLowerCase() === tag.toLowerCase()) ?? tag
  return (
    <>
      <PageHead title={name} sub={`${mine.length} open`} back="#/tasks" icon="list" color="var(--teal)" />
      <AddTask defaults={{ tags: [name], status: 'open' }} placeholder={`Add to ${name}…`} />
      <section class="card" style="--accent:var(--teal)">{mine.length ? mine.map((t) => <TaskRow t={t} onOpen={setEdit} />) : <p class="empty">Nothing on this list.</p>}</section>
      <TaskSheet task={edit} onClose={() => setEdit(null)} />
    </>
  )
}

export function Tasks({ initial, areaKey }: { initial?: View; areaKey?: string }) {
  if (areaKey?.startsWith('list-')) return <TagTasks tag={decodeURIComponent(areaKey.slice(5))} />
  if (areaKey) return <AreaTasks areaKey={areaKey} />
  return <TaskLists initial={initial} />
}

function TaskLists({ initial }: { initial?: View }) {
  const tasks = useStore((s) => s.tasks)
  const inboxN = tasks.filter((t) => t.status === 'inbox').length
  const [view, setView] = useState<View>(initial ?? 'home')
  const [edit, setEdit] = useState<Task | null>(null)
  const [sort, setSort] = useSort<SortK>('tasks', 'due')
  const t0 = today()
  const open = tasks.filter(openTask)
  const active = open.filter((t) => t.status !== 'inbox' && !t.tags?.includes('someday'))
  const byDue = sortTasks(sort)
  const todayList = active.filter((t) => t.due_date && t.due_date <= t0 || t.status === 'doing').sort(byDue)
  const upcoming = active.filter((t) => t.due_date && t.due_date > t0).sort(sortTasks('due'))
  const nodate = active.filter((t) => !t.due_date && t.status !== 'doing').sort(sort === 'due' ? sortTasks('priority') : byDue)
  const row = (t: Task) => <TaskRow t={t} onOpen={setEdit} process={view === 'inbox'} />

  const tabs: [View, string, number?][] = [['home', 'Overview'], ['inbox', 'Inbox', inboxN], ['today', 'Today', todayList.length], ['upcoming', 'Upcoming'], ['someday', 'Someday'], ['done', 'Done']]
  let body
  if (view === 'home') body = <Overview go={setView} />
  else if (view === 'inbox') {
    const inbox = open.filter((t) => t.status === 'inbox').sort(sort === 'due' ? sortTasks('oldest') : byDue)
    body = <section class="card">
      <p class="muted small" style="margin-bottom:6px">Tap when you want it done by, and a priority if it matters. Tap the task itself for everything else.</p>
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
    const s = open.filter((t) => t.tags?.includes('someday')).sort(byDue)
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
      <div class="row" style="gap:8px;margin-bottom:14px;align-items:center">
      <div class="chips scroll grow" style="margin:0">
        {tabs.map(([v, l, n]) => <button class={`chip ${view === v ? 'on' : ''}`} onClick={() => setView(v)}>{l}{n ? <span class={`badge ${v === 'inbox' ? '' : 'quiet'}`} style="height:18px;min-width:18px;font-size:11px">{n}</span> : null}</button>)}
      </div>
      {view !== 'home' && view !== 'upcoming' && view !== 'done' && <SortBtn value={sort} options={TASK_SORTS} onChange={setSort} />}
      </div>
      {body}
      <TaskSheet task={edit} onClose={() => setEdit(null)} />
    </>
  )
}
