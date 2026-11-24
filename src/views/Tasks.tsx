import { useEffect, useRef, useState } from 'preact/hooks'
import { useStore, toast, areaById } from '../lib/store'
import { listTasks, recentlyDone, saveTask, setTaskDone, deleteTask } from '../lib/db'
import { today, fmtDay, dayKey, addDays } from '../lib/dates'
import type { Task } from '../lib/types'
import { Icon } from '../ui/icons'
import { Sheet, burst, haptic, Spinner } from '../ui/kit'

const PRI = ['None', 'Low', 'Medium', 'High']

export function TaskRow({ t }: { t: Task }) {
  const [done, setDone] = useState(t.status === 'done')
  const [edit, setEdit] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const area = areaById(t.area_id)
  const overdue = !done && t.due_date && t.due_date < today()
  async function toggle() {
    const next = !done
    setDone(next); haptic()
    if (next) burst(ref.current)
    try {
      await setTaskDone(t.id, next)
      if (next) toast('Done. Nice.', () => setTaskDone(t.id, false))
    } catch (e) { setDone(!next); toast((e as Error).message) }
  }
  return (
    <div class={`task ${done ? 'done' : ''}`}>
      <button ref={ref} class={`check p${t.priority} ${done ? 'on' : ''}`} onClick={toggle} aria-label={done ? 'Mark not done' : 'Complete'}>
        <Icon name="check" size={15} stroke={3} />
      </button>
      <div class="grow" onClick={() => setEdit(true)} style="cursor:pointer">
        <div class="t-title">{t.title}</div>
        {(t.due_date || area || t.notes) && (
          <div class="t-meta">
            {t.due_date && <span class={overdue ? 'overdue' : ''}>{fmtDay(t.due_date)}{t.due_time ? ` ${t.due_time.slice(0, 5)}` : ''}</span>}
            {area && <span class="row" style="gap:5px"><i class="dot" style={`background:${area.color}`} />{area.name}</span>}
            {t.notes && <span>has notes</span>}
          </div>
        )}
      </div>
      <TaskEditor open={edit} task={t} onClose={() => setEdit(false)} />
    </div>
  )
}

export function QuickAdd({ defaultDue, areaId }: { defaultDue?: string; areaId?: string | null }) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  async function add(e: Event) {
    e.preventDefault()
    const v = title.trim(); if (!v) return
    // "!" anywhere makes it high priority: "call advisor !"
    const priority = v.includes('!!') ? 3 : v.includes('!') ? 2 : 0
    setBusy(true)
    try { await saveTask({ title: v.replace(/!+/g, '').trim(), due_date: defaultDue ?? null, area_id: areaId ?? null, priority }); setTitle(''); haptic() }
    catch (e) { toast((e as Error).message) }
    setBusy(false)
  }
  return (
    <form class="add-row" onSubmit={add} style="margin-bottom:6px">
      <input class="input" placeholder="Add a task…" value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} enterKeyHint="done" />
      <button class="icon-btn" style="width:46px;height:46px;flex:none" disabled={busy || !title.trim()} aria-label="Add"><Icon name="plus" /></button>
    </form>
  )
}

export function TaskEditor({ open, task, onClose }: { open: boolean; task?: Task | null; onClose: () => void }) {
  const areas = useStore((s) => s.areas.filter((a) => !a.archived))
  const [f, setF] = useState<Partial<Task>>({})
  useEffect(() => { if (open) setF(task ? { ...task } : { title: '', priority: 0, status: 'open' }) }, [open])
  const set = (p: Partial<Task>) => setF({ ...f, ...p })
  async function save() {
    if (!f.title?.trim()) return
    try { await saveTask({ ...f, title: f.title.trim() } as Task); onClose() } catch (e) { toast((e as Error).message) }
  }
  const quickDates: [string, string][] = [['Today', today()], ['Tomorrow', dayKey(addDays(new Date(), 1))], ['Next week', dayKey(addDays(new Date(), 7))]]
  return (
    <Sheet open={open} onClose={onClose} title={task ? 'Edit task' : 'New task'}>
      <label class="field"><span>Task</span><input class="input" value={f.title ?? ''} onInput={(e) => set({ title: (e.target as HTMLInputElement).value })} /></label>
      <div class="field"><span>Due</span>
        <div class="chips" style="margin-bottom:8px">
          {quickDates.map(([l, d]) => <button class={`chip ${f.due_date === d ? 'on' : ''}`} onClick={() => set({ due_date: d })}>{l}</button>)}
          <button class={`chip ${!f.due_date ? 'on' : ''}`} onClick={() => set({ due_date: null, due_time: null })}>Someday</button>
        </div>
        <div class="row"><input class="input" type="date" value={f.due_date ?? ''} onInput={(e) => set({ due_date: (e.target as HTMLInputElement).value || null })} />
          <input class="input" type="time" value={f.due_time?.slice(0, 5) ?? ''} onInput={(e) => set({ due_time: (e.target as HTMLInputElement).value || null })} /></div>
      </div>
      <div class="field"><span>Priority</span>
        <div class="chips">{PRI.map((p, i) => <button class={`chip ${f.priority === i ? 'on' : ''}`} onClick={() => set({ priority: i })}>{p}</button>)}</div>
      </div>
      <div class="field"><span>Area</span>
        <div class="chips">
          {areas.map((a) => <button class={`chip ${f.area_id === a.id ? 'on' : ''}`} onClick={() => set({ area_id: f.area_id === a.id ? null : a.id })}><i class="dot" style={`background:${a.color}`} />{a.name}</button>)}
        </div>
      </div>
      <label class="field"><span>Notes</span><textarea class="input" value={f.notes ?? ''} onInput={(e) => set({ notes: (e.target as HTMLTextAreaElement).value || null })} /></label>
      <button class="btn primary block" onClick={save}>Save</button>
      {task && <button class="btn ghost danger block" style="margin-top:8px" onClick={async () => { if (confirm('Delete this task?')) { await deleteTask(task.id); onClose(); toast('Task deleted') } }}><Icon name="trash" size={18} /> Delete</button>}
    </Sheet>
  )
}

export function Tasks() {
  const version = useStore((s) => s.dataVersion)
  const areas = useStore((s) => s.areas.filter((a) => !a.archived))
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [done, setDone] = useState<Task[]>([])
  const [filter, setFilter] = useState<'today' | 'upcoming' | 'all' | 'done'>('today')
  const [area, setArea] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  useEffect(() => {
    listTasks().then(setTasks).catch(() => setTasks([]))
    if (filter === 'done') recentlyDone(14).then(setDone).catch(() => {})
  }, [version, filter])

  const t0 = today()
  let list = filter === 'done' ? done : (tasks ?? [])
  if (filter === 'today') list = list.filter((t) => t.due_date && t.due_date <= t0)
  if (filter === 'upcoming') list = list.filter((t) => t.due_date && t.due_date > t0)
  if (area) list = list.filter((t) => t.area_id === area)

  // Group upcoming/all by day for a calmer read.
  const groups = new Map<string, Task[]>()
  for (const t of list) {
    const k = filter === 'done' ? 'Done recently' : t.due_date ? (t.due_date < t0 ? 'Overdue' : fmtDay(t.due_date)) : 'Someday'
    groups.set(k, [...(groups.get(k) ?? []), t])
  }

  return (
    <>
      <div class="page-title"><h1>Tasks</h1><button class="icon-btn" aria-label="New task" onClick={() => setNewOpen(true)}><Icon name="plus" /></button></div>
      <div class="chips" style="margin:0 2px 10px">
        {(['today', 'upcoming', 'all', 'done'] as const).map((f) => <button class={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>)}
      </div>
      <div class="chips" style="margin:0 2px 14px">
        {areas.map((a) => <button class={`chip ${area === a.id ? 'on' : ''}`} onClick={() => setArea(area === a.id ? null : a.id)}><i class="dot" style={`background:${a.color}`} />{a.name}</button>)}
      </div>
      <section class="card">
        {filter !== 'done' && <QuickAdd defaultDue={filter === 'today' ? t0 : undefined} areaId={area} />}
        {tasks == null ? <Spinner /> : list.length === 0 ? <p class="empty">{filter === 'today' ? 'Clear for today.' : 'Nothing here yet.'}</p> : (
          [...groups].map(([k, ts]) => (
            <div>
              {groups.size > 1 && <div class={`faint small ${k === 'Overdue' ? 'overdue' : ''}`} style="margin:14px 2px 2px">{k}</div>}
              {ts.map((t) => <TaskRow t={t} key={t.id} />)}
            </div>
          ))
        )}
      </section>
      <p class="faint small" style="text-align:center">Tip: end a task with ! for medium priority, !! for high.</p>
      <TaskEditor open={newOpen} onClose={() => setNewOpen(false)} />
    </>
  )
}
