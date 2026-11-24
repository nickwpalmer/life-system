import { useEffect, useState } from 'preact/hooks'
import { useStore } from '../lib/store'
import { logsSince, checkinsSince, listTasks, recentlyDone } from '../lib/db'
import { lastNDays } from '../lib/dates'
import { dailySeries, streak, fmtValue } from '../lib/metrics'
import type { Checkin, Log, Metric, Task } from '../lib/types'
import { LineChart, BarChart, Heat } from '../ui/charts'
import { Spinner } from '../ui/kit'

const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
const r1 = (n: number | null) => (n == null ? '–' : String(Math.round(n * 10) / 10))

function mergeDaily(days: string[], checkins: Checkin[], field: 'mood' | 'energy' | 'stress', metric: Metric | undefined, logs: Log[]) {
  const fromLogs = metric ? dailySeries(metric, logs, days) : days.map(() => null)
  return days.map((d, i) => avg([...checkins.filter((c) => c.day === d).map((c) => c[field]), fromLogs[i]]))
}

export function Insights() {
  const metrics = useStore((s) => s.metrics)
  const areas = useStore((s) => s.areas.filter((a) => !a.archived))
  const version = useStore((s) => s.dataVersion)
  const [range, setRange] = useState(30)
  const [area, setArea] = useState<string | null>(null)
  const [data, setData] = useState<{ logs: Log[]; checkins: Checkin[]; open: Task[]; done: Task[] } | null>(null)

  useEffect(() => {
    Promise.all([logsSince(range), checkinsSince(range), listTasks(), recentlyDone(range)])
      .then(([logs, checkins, open, done]) => setData({ logs, checkins, open, done })).catch(() => setData({ logs: [], checkins: [], open: [], done: [] }))
  }, [range, version])

  if (!data) return <><div class="page-title"><h1>Insights</h1></div><Spinner /></>

  const days = lastNDays(range)
  const byKey = (k: string) => metrics.find((m) => m.key === k)
  const inArea = (m: Metric) => !area || m.area_id === area
  const mentalKey = areas.find((a) => a.key === 'mental')?.id
  const showMood = !area || area === mentalKey

  const mood = mergeDaily(days, data.checkins, 'mood', byKey('mood'), data.logs)
  const energy = mergeDaily(days, data.checkins, 'energy', byKey('energy'), data.logs)
  const stress = mergeDaily(days, data.checkins, 'stress', byKey('anxiety'), data.logs)
  const sleepM = byKey('sleep_hours')
  const sleep = sleepM ? dailySeries(sleepM, data.logs, days) : []
  const ciDays = days.map((d) => (data.checkins.some((c) => c.day === d) ? 1 : null))

  const habits = metrics.filter((m) => m.active && m.role === 'habit' && inArea(m))
  const vices = metrics.filter((m) => m.active && m.role === 'vice' && inArea(m))
  const others = metrics.filter((m) => m.active && (m.role === 'track' || m.role === 'health') && inArea(m) && !['mood', 'energy', 'anxiety', 'sleep_hours'].includes(m.key))
    .filter((m) => data.logs.some((l) => l.metric_id === m.id))
  const doneN = data.done.filter((t) => !area || t.area_id === area).length
  const openN = data.open.filter((t) => !area || t.area_id === area).length
  const recent = Math.min(range, 14)

  return (
    <>
      <div class="page-title"><h1>Insights</h1></div>
      <div class="chips" style="margin:0 2px 10px">
        {[7, 30, 90].map((n) => <button class={`chip ${range === n ? 'on' : ''}`} onClick={() => setRange(n)}>{n} days</button>)}
      </div>
      <div class="chips" style="margin:0 2px 14px">
        <button class={`chip ${!area ? 'on' : ''}`} onClick={() => setArea(null)}>Everything</button>
        {areas.map((a) => <button class={`chip ${area === a.id ? 'on' : ''}`} onClick={() => setArea(a.id)}><i class="dot" style={`background:${a.color}`} />{a.name}</button>)}
      </div>

      <div class="stat-row">
        {showMood ? <div class="stat"><div class="s-val grad-text">{r1(avg(mood))}</div><div class="s-lbl">Avg mood</div></div>
          : <div class="stat"><div class="s-val grad-text">{openN}</div><div class="s-lbl">Open tasks</div></div>}
        <div class="stat"><div class="s-val">{doneN}</div><div class="s-lbl">Tasks done</div></div>
        <div class="stat"><div class="s-val">{streak(ciDays)}</div><div class="s-lbl">Check-in streak</div></div>
      </div>

      {showMood && (
        <section class="card">
          <div class="card-h"><h2>Mood, energy, stress</h2></div>
          {mood.some((v) => v != null) || energy.some((v) => v != null) ? (
            <>
              <LineChart days={days} min={1} max={10} series={[
                { label: 'Mood', color: '#fdba74', values: mood },
                { label: 'Energy', color: '#c4b5fd', values: energy },
                { label: 'Stress', color: '#f9a8d4', values: stress },
              ]} />
              <div class="legend"><span><i class="dot" style="background:#fdba74" /> Mood</span><span><i class="dot" style="background:#c4b5fd" /> Energy</span><span><i class="dot" style="background:#f9a8d4" /> Stress</span></div>
            </>
          ) : <p class="empty">Do a check-in or log your mood and this fills in.</p>}
        </section>
      )}

      {sleepM && inArea(sleepM) && (
        <section class="card">
          <div class="card-h"><h2>Sleep</h2><span class="muted small">avg {r1(avg(sleep))} h</span></div>
          {sleep.some((v) => v != null) ? <BarChart days={days} values={sleep} color="#a5b4fc" target={8} /> : <p class="empty">Log sleep in your morning check-in.</p>}
        </section>
      )}

      {habits.length > 0 && (
        <section class="card">
          <div class="card-h"><h2>Habits</h2><span class="faint small">last {recent} days</span></div>
          {habits.map((m) => {
            const s = dailySeries(m, data.logs, days)
            const total = s.reduce<number>((a, b) => a + (b ?? 0), 0)
            return (
              <div class="metric-row">
                <div class="row between" style="margin-bottom:8px"><span>{m.name}</span>
                  <span class="muted small">{streak(s) > 0 ? `${streak(s)} day streak · ` : ''}{fmtValue(m, total)}</span></div>
                <Heat values={s.slice(-recent)} color="#fdba74" />
              </div>
            )
          })}
        </section>
      )}

      {vices.length > 0 && (
        <section class="card">
          <div class="card-h"><h2>Vices</h2><span class="faint small">per day, last {range}</span></div>
          {vices.map((m) => {
            const s = dailySeries(m, data.logs, days)
            const half = Math.floor(days.length / 2)
            const a1 = avg(s.slice(0, half).map((v) => v ?? 0)), a2 = avg(s.slice(half).map((v) => v ?? 0))
            const trend = a1 != null && a2 != null && (a1 > 0 || a2 > 0) ? (a2 < a1 ? '↓ trending down' : a2 > a1 ? '↑ trending up' : 'steady') : ''
            const any = s.some((v) => v)
            return (
              <div class="metric-row">
                <div class="row between" style="margin-bottom:8px"><span>{m.name}</span>
                  <span class="muted small">{any ? `${r1(avg(s.map((v) => v ?? 0)))}/day${trend ? ` · ${trend}` : ''}` : 'none logged'}</span></div>
                {any && <Heat values={s.slice(-recent)} color="#f9a8d4" />}
              </div>
            )
          })}
        </section>
      )}

      {others.map((m) => {
        const s = dailySeries(m, data.logs, days)
        return (
          <section class="card">
            <div class="card-h"><h2>{m.name}</h2><span class="muted small">avg {fmtValue(m, avg(s))}</span></div>
            {m.kind === 'scale' ? <LineChart days={days} min={1} max={10} series={[{ label: m.name, color: '#fdba74', values: s }]} /> : <BarChart days={days} values={s} color="#fdba74" />}
          </section>
        )
      })}
    </>
  )
}
