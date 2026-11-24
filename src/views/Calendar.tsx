import { useEffect, useState } from 'preact/hooks'
import { eventsBetween, listTasks } from '../lib/db'
import { useStore } from '../lib/store'
import { addDays, startOfDay, dayKey, fmtDay, fmtTime } from '../lib/dates'
import type { CalEvent, Task } from '../lib/types'
import { BackHeader, Spinner } from '../ui/kit'

/**
 * Week view. Google Calendar stays the source of truth; events land in the
 * calendar_events table (synced by Claude for now). Tasks with due dates show alongside.
 */
export function Calendar() {
  const version = useStore((s) => s.dataVersion)
  const [offset, setOffset] = useState(0)
  const [events, setEvents] = useState<CalEvent[] | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const start = addDays(startOfDay(), offset * 7)
  useEffect(() => {
    eventsBetween(start, addDays(start, 7)).then(setEvents).catch(() => setEvents([]))
    listTasks().then(setTasks).catch(() => {})
  }, [offset, version])

  const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(start, i)))
  return (
    <>
      <BackHeader title="Calendar" action={
        <div class="row"><button class="btn sm" onClick={() => setOffset(offset - 1)}>‹</button><button class="btn sm" onClick={() => setOffset(0)}>Now</button><button class="btn sm" onClick={() => setOffset(offset + 1)}>›</button></div>
      } />
      {events == null ? <Spinner /> : (
        <>
          {events.length === 0 && offset === 0 && (
            <div class="card soft"><p class="small">Your Google Calendar isn’t connected to the app yet. Once it is, your events show up here next to your tasks.</p></div>
          )}
          {days.map((d) => {
            const evs = events.filter((e) => dayKey(new Date(e.starts_at)) === d)
            const ts = tasks.filter((t) => t.due_date === d)
            return (
              <section class="card" style="padding:14px 16px">
                <div class="card-h" style="margin-bottom:6px"><h2>{fmtDay(d)}</h2></div>
                {evs.length + ts.length === 0 ? <p class="faint small">Open</p> : (
                  <>
                    {evs.map((e) => <div class="event"><span class="when">{e.all_day ? 'All day' : fmtTime(e.starts_at)}</span><span class="bar-v" /><span class="grow">{e.title}{e.location && <div class="faint small">{e.location}</div>}</span></div>)}
                    {ts.map((t) => <div class="event"><span class="when">{t.due_time ? t.due_time.slice(0, 5) : 'Task'}</span><span class="bar-v" style="background:var(--surface-3)" /><span class="grow muted">{t.title}</span></div>)}
                  </>
                )}
              </section>
            )
          })}
        </>
      )}
    </>
  )
}
