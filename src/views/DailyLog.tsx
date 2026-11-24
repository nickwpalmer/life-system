import { useEffect, useState } from 'preact/hooks'
import { useStore, toast } from '../lib/store'
import { setDaily, dayEntries, addTimedLog, remove } from '../lib/db'
import { dayKey, addDays, fromKey, fmtDay, today, fmtTime, lastNDays } from '../lib/dates'
import { dailySeries, fmtValue, LOG_GROUPS, groupOf, consistency } from '../lib/metrics'
import type { Metric } from '../lib/types'
import { Icon } from '../ui/icons'
import { Sheet, ScalePicker, Stepper, PageHead, haptic } from '../ui/kit'

const stepFor = (m: Metric) => m.unit === 'h' ? 0.5 : m.kind === 'duration' ? (m.key === 'meditation' ? 5 : 15) : 1
const scaleLabels: Record<string, [string, string, 'warm' | 'cool' | 'rev']> = {
  mood: ['Low', 'Great', 'warm'], energy: ['Drained', 'Charged', 'cool'], anxiety: ['Calm', 'Very anxious', 'rev'],
}

/** One row per tracker: set the day's total. The clock adds a timed entry if the time matters. */
export function LogRow({ m, day, onTimed }: { m: Metric; day: string; onTimed: (m: Metric) => void }) {
  const logs = useStore((s) => s.logs)
  const v = dailySeries(m, logs, [day])[0]
  const { timed } = dayEntries(m.id, day)
  const c = LOG_GROUPS.find((g) => g.key === groupOf(m))!.color
  const sub = [m.target ? `goal ${fmtValue(m, m.target)}` : '', timed.length ? `${timed.length} timed` : ''].filter(Boolean).join(' · ')
  const clock = <button class="l-time" aria-label={`Add ${m.name} at a time`} onClick={() => onTimed(m)}><Icon name="clock" size={17} /></button>

  if (m.kind === 'scale') {
    const [lo, hi, tone] = scaleLabels[m.key] ?? ['Low', 'High', 'warm']
    return (
      <div class="log-row full" style={`--c:${c}`}>
        <div class="row between"><div class="l-name">{m.name}</div><div class="row" style="gap:4px"><span class={`l-val ${v == null ? 'none' : ''}`}>{v == null ? '–' : Math.round(v * 10) / 10}</span>{clock}</div></div>
        <ScalePicker value={v == null ? null : Math.round(v)} onChange={(n) => setDaily(m, day, v != null && Math.round(v) === n ? null : n)} low={lo} high={hi} tone={tone} />
      </div>
    )
  }
  let ctrl
  if (m.kind === 'boolean') {
    ctrl = <button class={`tog ${v ? 'on' : ''}`} aria-pressed={!!v} aria-label={m.name} onClick={() => { haptic(); setDaily(m, day, v ? null : 1) }}><Icon name="check" size={20} stroke={2.6} /></button>
  } else if ((m.kind === 'count' && m.role !== 'health') || (m.kind === 'duration' && m.unit !== 'h')) {
    ctrl = <><span class={`l-val ${v == null ? 'none' : ''}`}>{v == null ? '–' : fmtValue(m, v)}</span><Stepper label={m.name} value={v} step={stepFor(m)} onChange={(n) => setDaily(m, day, n)} /></>
  } else if (m.kind === 'text') {
    ctrl = <input class="input num-in" style="width:150px !important;text-align:left" key={day} defaultValue={dayEntries(m.id, day).daily?.value_text ?? ''} onChange={(e) => setDaily(m, day, null, (e.target as HTMLInputElement).value || null)} />
  } else {
    ctrl = <><input class="input num-in" type="number" inputMode="decimal" placeholder="–" key={`${day}:${timed.length}`} defaultValue={v == null ? '' : String(Math.round(v * 100) / 100)}
      onInput={(e) => { const s = (e.target as HTMLInputElement).value; setDaily(m, day, s === '' ? null : Number(s)) }} />{m.unit && <span class="faint small">{m.unit}</span>}</>
  }
  return (
    <div class="log-row" style={`--c:${c}`}>
      <div style="min-width:0"><div class="l-name">{m.name}</div>{sub && <div class="l-sub">{sub}</div>}</div>
      <div class="ctrl">{ctrl}{clock}</div>
    </div>
  )
}

export function TimedLogSheet({ m, day, onClose }: { m: Metric | null; day: string; onClose: () => void }) {
  const logs = useStore((s) => s.logs)
  const [val, setVal] = useState('')
  const [time, setTime] = useState('')
  const [note, setNote] = useState('')
  useEffect(() => {
    if (!m) return
    const d = new Date(); setTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
    setVal(m.kind === 'boolean' || m.kind === 'count' ? '1' : ''); setNote('')
  }, [m?.id])
  if (!m) return <Sheet open={false} onClose={onClose}>{null}</Sheet>
  const timed = logs.filter((l) => l.metric_id === m.id && l.source !== 'daily' && dayKey(new Date(l.occurred_at)) === day)
  async function save() {
    const [h, mi] = time.split(':').map(Number)
    const at = fromKey(day); at.setHours(h || 0, mi || 0, 0, 0)
    const n = m!.kind === 'text' ? null : Number(val)
    if (m!.kind !== 'text' && !isFinite(n!)) return
    try { await addTimedLog(m!.id, n, m!.kind === 'text' ? val : null, note || null, at.toISOString()); toast(`${m!.name} logged at ${fmtTime(at.toISOString())}`); onClose() } catch { /* toast shown */ }
  }
  return (
    <Sheet open={!!m} onClose={onClose} title={`${m.name} at a time`}>
      <p class="muted small" style="margin:-6px 2px 14px">For when the time matters, like coffee at 4pm. It adds to {fmtDay(day).toLowerCase()}’s total.</p>
      <div class="row">
        <label class="field grow"><span>{m.unit ? `Amount (${m.unit})` : 'Amount'}</span>
          {m.kind === 'scale' ? <ScalePicker value={val ? Number(val) : null} onChange={(n) => setVal(String(n))} />
            : <input class="input" type={m.kind === 'text' ? 'text' : 'number'} inputMode="decimal" value={val} onInput={(e) => setVal((e.target as HTMLInputElement).value)} />}
        </label>
        {m.kind !== 'scale' && <label class="field" style="width:140px"><span>Time</span><input class="input" type="time" value={time} onInput={(e) => setTime((e.target as HTMLInputElement).value)} /></label>}
      </div>
      {m.kind === 'scale' && <label class="field"><span>Time</span><input class="input" type="time" value={time} onInput={(e) => setTime((e.target as HTMLInputElement).value)} /></label>}
      <label class="field"><span>Note (optional)</span><input class="input" value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} /></label>
      <button class="btn primary block" onClick={save}>Add</button>
      {timed.length > 0 && <div style="margin-top:16px">
        <div class="group-h">Timed entries {fmtDay(day).toLowerCase()}</div>
        {timed.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)).map((l) => (
          <div class="row between" style="padding:8px 2px;border-bottom:1px solid var(--line)">
            <span>{fmtTime(l.occurred_at)} · {l.value_text ?? fmtValue(m, l.value_num)}{l.note ? <span class="faint"> · {l.note}</span> : null}</span>
            <button class="faint" aria-label="Remove" onClick={() => remove('logs', l.id)}><Icon name="x" size={16} /></button>
          </div>
        ))}
      </div>}
    </Sheet>
  )
}

/** Trackers grouped as in the daily log. `only` limits to some groups (the night check-in uses this). */
export function LogGroups({ day, only, compact }: { day: string; only?: string[]; compact?: boolean }) {
  const metrics = useStore((s) => s.metrics.filter((m) => m.active).sort((a, b) => a.sort - b.sort))
  const [timed, setTimed] = useState<Metric | null>(null)
  const groups = LOG_GROUPS.filter((g) => !only || only.includes(g.key))
  return (
    <>
      {groups.map((g) => {
        const ms = metrics.filter((m) => groupOf(m) === g.key)
        if (!ms.length) return null
        const body = ms.map((m) => <LogRow m={m} day={day} onTimed={setTimed} />)
        return compact ? <div class="log-group"><div class="group-h" style={`color:${g.color}`}>{g.label}</div>{body}</div>
          : <section class="card log-group" style={`--accent:${g.color}`}><div class="card-h"><h2 style={`color:${g.color}`}>{g.label}</h2></div>{body}</section>
      })}
      <TimedLogSheet m={timed} day={day} onClose={() => setTimed(null)} />
    </>
  )
}

export function DailyLog({ day }: { day: string }) {
  const metrics = useStore((s) => s.metrics.filter((m) => m.active))
  const logs = useStore((s) => s.logs)
  const isToday = day === today()
  const go = (n: number) => { location.hash = `#/log/${dayKey(addDays(fromKey(day), n))}` }
  const filled = metrics.filter((m) => dailySeries(m, logs, [day])[0] != null).length
  const days = lastNDays(14)
  const slipping = metrics.filter((m) => m.role === 'habit' && consistency(dailySeries(m, logs, days)).lastTwoMissed)
  return (
    <>
      <PageHead title="Daily log" sub="Fill it in once, whenever suits you. Add a time only if it matters." icon="sliders" color="var(--pink)" />
      <div class="daybar">
        <button class="icon-btn" aria-label="Previous day" onClick={() => go(-1)}><Icon name="back" size={20} /></button>
        <div class="d-label"><b>{fmtDay(day)}</b><span class="faint small">{fromKey(day).toLocaleDateString([], { month: 'long', day: 'numeric' })} · {filled}/{metrics.length} logged</span></div>
        <button class="icon-btn" aria-label="Next day" disabled={isToday} style={isToday ? 'opacity:.3' : ''} onClick={() => go(1)}><Icon name="chev" size={20} /></button>
      </div>
      <div class="progress" style="margin:-4px 4px 16px"><i style={`width:${metrics.length ? (filled / metrics.length) * 100 : 0}%`} /></div>
      {isToday && slipping.length > 0 && (
        <div class="card soft flat small" style="padding:12px 14px">
          <b>Don’t miss twice:</b> {slipping.map((m) => m.name.toLowerCase()).join(', ')} skipped the last two days. Even a tiny bit today keeps it alive.
        </div>
      )}
      <div class="grid-2"><div><LogGroups day={day} only={['mind', 'body']} /></div><div><LogGroups day={day} only={['habits', 'vices', 'money', 'other']} /></div></div>
      <p class="faint small" style="text-align:center">Saves as you go. Changes sync in under a second.</p>
    </>
  )
}
