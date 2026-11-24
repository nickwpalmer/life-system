import { useEffect, useState } from 'preact/hooks'
import { useStore, toast, metricById } from '../lib/store'
import { addLog, deleteLog, logsSince, listTasks, getCheckin, eventsBetween, getProfile } from '../lib/db'
import { dailySeries, fmtValue, isOneTap } from '../lib/metrics'
import { today, fmtLongDate, partOfDay, checkinKindNow, checkinDay, fmtTime, addDays, startOfDay } from '../lib/dates'
import type { Log, Metric, Task, Checkin, CalEvent } from '../lib/types'
import { Icon } from '../ui/icons'
import { haptic } from '../ui/kit'
import { LogSheet } from './LogSheet'
import { TaskRow, QuickAdd } from './Tasks'

export function Today() {
  const metrics = useStore((s) => s.metrics)
  const version = useStore((s) => s.dataVersion)
  const [logs, setLogs] = useState<Log[]>([])
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [checkins, setCheckins] = useState<{ morning: Checkin | null; night: Checkin | null }>({ morning: null, night: null })
  const [events, setEvents] = useState<CalEvent[]>([])
  const [name, setName] = useState('')
  const [sheet, setSheet] = useState<{ open: boolean; metric: Metric | null }>({ open: false, metric: null })

  const day = today()
  useEffect(() => {
    logsSince(1).then(setLogs).catch(() => {})
    listTasks().then(setTasks).catch(() => setTasks([]))
    Promise.all([getCheckin('morning', checkinDay('morning')), getCheckin('night', checkinDay('night'))])
      .then(([morning, night]) => setCheckins({ morning, night })).catch(() => {})
    eventsBetween(startOfDay(), addDays(startOfDay(), 1)).then(setEvents).catch(() => {})
  }, [version])
  useEffect(() => { getProfile().then((p) => setName(p?.display_name ?? '')).catch(() => {}) }, [])

  const quick = metrics.filter((m) => m.active && m.show_today)
  const value = (m: Metric) => dailySeries(m, logs, [day])[0]

  async function tap(m: Metric, el: HTMLElement, x: number, y: number) {
    if (!isOneTap(m)) { setSheet({ open: true, metric: m }); return }
    const r = el.getBoundingClientRect()
    const dot = document.createElement('span')
    dot.className = 'ripple'
    const s = Math.max(r.width, r.height)
    Object.assign(dot.style, { width: `${s}px`, height: `${s}px`, left: `${x - r.left - s / 2}px`, top: `${y - r.top - s / 2}px` })
    el.appendChild(dot); setTimeout(() => dot.remove(), 650)
    haptic()
    try {
      const row = await addLog(m.id, 1)
      const valEl = el.querySelector('.q-val'); valEl?.classList.remove('bump'); void (valEl as HTMLElement)?.offsetWidth; valEl?.classList.add('bump')
      toast(`+1 ${m.name.toLowerCase()}`, () => deleteLog(row.id))
    } catch (e) { toast((e as Error).message) }
  }

  const kind = checkinKindNow()
  const due = (tasks ?? []).filter((t) => t.due_date && t.due_date <= day)
  const top = (tasks ?? []).filter((t) => !t.due_date || t.due_date > day).filter((t) => t.priority >= 2).slice(0, 3)
  const greet = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Hey night owl' }[partOfDay()]

  return (
    <>
      <header class="hello">
        <p class="date">{fmtLongDate()}</p>
        <h1>{greet}{name ? <>, <span class="grad-text">{name}</span></> : null}</h1>
      </header>

      {kind && !checkins[kind] && (
        <a class="card soft prompt" href={`#/checkin/${kind}`} style="text-decoration:none;color:inherit">
          <span class="orb"><Icon name={kind === 'morning' ? 'sun' : 'moon'} size={24} /></span>
          <span class="grow">
            <h3>{kind === 'morning' ? 'Morning check-in' : 'Night check-in'}</h3>
            <p class="muted small">{kind === 'morning' ? 'Two minutes to set up the day.' : 'Close the loop on today.'}</p>
          </span>
          <span class="faint"><Icon name="chev" /></span>
        </a>
      )}
      {(checkins.morning || checkins.night) && (
        <div class="chips" style="margin:0 2px 14px">
          {checkins.morning && <a class="chip on" href="#/checkin/morning"><Icon name="sun" size={15} /> Morning{checkins.morning.mood ? ` · mood ${checkins.morning.mood}` : ''}</a>}
          {checkins.night && <a class="chip on" href="#/checkin/night"><Icon name="moon" size={15} /> Night{checkins.night.mood ? ` · mood ${checkins.night.mood}` : ''}</a>}
          {!kind && !checkins.night && <a class="chip" href="#/checkin/night"><Icon name="moon" size={15} /> Night check-in</a>}
        </div>
      )}

      <section class="card">
        <div class="card-h"><h2>Quick log</h2><button class="btn ghost sm" onClick={() => setSheet({ open: true, metric: null })}>More</button></div>
        <div class="qgrid">
          {quick.map((m) => {
            const v = value(m)
            return (
              <button class={`qbtn ${m.role} ${v && m.role === 'habit' ? 'done' : ''}`}
                onClick={(e) => tap(m, e.currentTarget as HTMLElement, (e as MouseEvent).clientX, (e as MouseEvent).clientY)}
                onContextMenu={(e) => { e.preventDefault(); setSheet({ open: true, metric: m }) }}>
                <span class="q-name">{m.name}</span>
                <span class={`q-val ${v == null ? 'none' : ''}`}>{v == null ? (isOneTap(m) ? '+1' : 'Log') : fmtValue(m, v)}</span>
              </button>
            )
          })}
        </div>
        <p class="faint small" style="margin-top:10px">Counters add one per tap. Press and hold any tile for more options.</p>
      </section>

      <section class="card">
        <div class="card-h"><h2>Today’s tasks</h2><a class="btn ghost sm" href="#/tasks">All</a></div>
        <QuickAdd defaultDue={day} />
        {tasks == null ? null : due.length + top.length === 0
          ? <p class="empty">Nothing due today. Add one above.</p>
          : [...due, ...top].map((t) => <TaskRow t={t} key={t.id} />)}
      </section>

      {events.length > 0 && (
        <section class="card">
          <div class="card-h"><h2>Calendar</h2><a class="btn ghost sm" href="#/calendar">Week</a></div>
          {events.map((e) => (
            <div class="event"><span class="when">{e.all_day ? 'All day' : fmtTime(e.starts_at)}</span><span class="bar-v" /><span class="grow">{e.title}{e.location && <div class="faint small">{e.location}</div>}</span></div>
          ))}
        </section>
      )}

      {logs.length > 0 && (
        <section class="card">
          <div class="card-h"><h2>Logged today</h2></div>
          {logs.slice(0, 12).map((l) => {
            const m = metricById(l.metric_id)
            if (!m) return null
            return (
              <div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)">
                <span><span class="faint small" style="display:inline-block;width:68px">{fmtTime(l.occurred_at)}</span>{m.name}{l.note && <span class="faint"> · {l.note}</span>}</span>
                <span class="row"><span class="muted">{l.value_text ?? fmtValue(m, l.value_num)}</span>
                  <button class="faint" aria-label="Delete" onClick={() => deleteLog(l.id).then(() => toast('Deleted'))}><Icon name="x" size={16} /></button></span>
              </div>
            )
          })}
        </section>
      )}

      <button class="fab" aria-label="Log something" onClick={() => setSheet({ open: true, metric: null })}><Icon name="plus" size={28} stroke={2.4} /></button>
      <LogSheet open={sheet.open} metric={sheet.metric} onClose={() => setSheet({ open: false, metric: null })} />
    </>
  )
}
