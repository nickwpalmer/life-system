import { useState } from 'preact/hooks'
import { useStore } from '../lib/store'
import { today, dayKey, addDays, fromKey, fmtTime, fmtDay, weekStart, relTime } from '../lib/dates'
import { eventsOn, calColor } from '../lib/cal'
import { Icon } from '../ui/icons'
import { PageHead, Card } from '../ui/kit'
import { openTask } from './Tasks'

export function Calendar() {
  const events = useStore((s) => s.events)
  const tasks = useStore((s) => s.tasks)
  const synced = useStore((s) => s.synced_at)
  const [offset, setOffset] = useState(0)
  const [sel, setSel] = useState(today())
  const start = addDays(weekStart(), offset * 7)
  const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(start, i)))
  const dueOn = (d: string) => tasks.filter((t) => openTask(t) && t.due_date === d)
  const calendars = [...new Set(events.map((e) => e.calendar_name ?? 'Calendar'))]
  const dayList = eventsOn(events, sel)
  const shift = (n: number) => { setOffset(offset + n); setSel(dayKey(addDays(fromKey(sel), n * 7))) }
  return (
    <>
      <PageHead title="Calendar" icon="cal" color="var(--sky)" sub={synced ? `From Google Calendar · updated ${relTime(synced)}` : 'From Google Calendar'}
        action={<div class="row" style="gap:6px"><button class="icon-btn sm" aria-label="Previous week" onClick={() => shift(-1)}><Icon name="back" size={17} /></button>{offset !== 0 && <button class="btn sm" onClick={() => { setOffset(0); setSel(today()) }}>Today</button>}<button class="icon-btn sm" aria-label="Next week" onClick={() => shift(1)}><Icon name="chev" size={17} /></button></div>} />
      <div class="days phone-only">
        {days.map((d) => { const ev = eventsOn(events, d); return (
          <button class={`${d === sel ? 'on' : ''} ${d === today() ? 'today' : ''}`} onClick={() => setSel(d)}>
            <div class="wd">{fromKey(d).toLocaleDateString([], { weekday: 'narrow' })}</div><div class="dn">{fromKey(d).getDate()}</div>
            <div class="pips">{ev.slice(0, 3).map((e) => <i style={`--c:${calColor(e.calendar_name)}`} />)}</div>
          </button>
        ) })}
      </div>
      <div class="week-cols" style="margin-bottom:14px">
        {days.map((d) => (
          <div class={`col ${d === today() ? 'today' : ''}`}>
            <h3>{fromKey(d).toLocaleDateString([], { weekday: 'short', day: 'numeric' })}</h3>
            {eventsOn(events, d).map((e) => <div class="ev" style={`--c:${calColor(e.calendar_name)}`}><div class="t">{e.all_day ? 'All day' : fmtTime(e.starts_at)}</div>{e.title}</div>)}
            {dueOn(d).map((t) => <div class="ev" style="--c:var(--violet);background:transparent;border-left-style:dashed"><div class="t">Task</div>{t.title}</div>)}
          </div>
        ))}
      </div>
      <div class="phone-only">
        <Card title={fmtDay(sel)} icon="calday" accent="var(--sky)">
          {dayList.length ? dayList.map((e) => (
            <div class="event" style={`--c:${calColor(e.calendar_name)}`}>
              <span class="when">{e.all_day ? 'All day' : <>{fmtTime(e.starts_at)}{e.ends_at && <div class="faint tiny">{fmtTime(e.ends_at)}</div>}</>}</span><span class="bar-v" />
              <span class="grow"><div class="e-t">{e.title}</div>{e.location && <div class="faint small">{e.location}</div>}<div class="faint tiny">{e.calendar_name}</div></span>
            </div>
          )) : <p class="empty" style="padding:8px">{events.length ? 'Nothing on the calendar.' : 'Events from your Google Calendar will appear here after the first sync.'}</p>}
          {dueOn(sel).length > 0 && <><div class="group-h">Tasks due</div>{dueOn(sel).map((t) => <div class="row" style="padding:6px 0"><Icon name="tasks" size={16} />{t.title}</div>)}</>}
        </Card>
      </div>
      {calendars.length > 1 && <div class="legend" style="margin:0 4px 14px">{calendars.map((c) => <span class="row" style="gap:6px"><i class="dot" style={`background:${calColor(c)}`} />{c}</span>)}</div>}
      <p class="faint small" style="text-align:center">Add or change events in Google Calendar. This view is read-only for now.</p>
    </>
  )
}
