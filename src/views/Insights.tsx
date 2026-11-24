import { useState } from 'preact/hooks'
import { useStore } from '../lib/store'
import { lastNDays } from '../lib/dates'
import { dailySeries, fmtValue, consistency, streak } from '../lib/metrics'
import type { Metric } from '../lib/types'
import { Icon } from '../ui/icons'
import { PageHead, Card } from '../ui/kit'
import { LineChart, BarChart, Heat } from '../ui/charts'

const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }

function pearson(a: (number | null)[], b: (number | null)[]) {
  const pts: [number, number][] = []
  a.forEach((x, i) => { const y = b[i]; if (x != null && y != null) pts.push([x, y]) })
  const n = pts.length
  if (n < 7) return { r: null, n }
  const mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n
  let num = 0, dx = 0, dy = 0
  for (const [x, y] of pts) { num += (x - mx) * (y - my); dx += (x - mx) ** 2; dy += (y - my) ** 2 }
  return { r: dx && dy ? num / Math.sqrt(dx * dy) : null, n }
}

type Finding = { icon: string; c: string; text: string }

export function Insights() {
  const metrics = useStore((s) => s.metrics.filter((m) => m.active))
  const logs = useStore((s) => s.logs)
  const checkins = useStore((s) => s.checkins)
  const [range, setRange] = useState(30)
  const days = lastNDays(range)
  const k = (key: string) => metrics.find((m) => m.key === key)
  const S = (key: string) => (k(key) ? dailySeries(k(key)!, logs, days) : days.map(() => null))
  const mood = S('mood'), anx = S('anxiety'), energy = S('energy'), sleep = S('sleep_hours')
  const shift = (xs: (number | null)[]) => [null, ...xs.slice(0, -1)] // yesterday's value lined up with today

  const findings: Finding[] = []
  const rel = (label: string, a: (number | null)[], b: (number | null)[], pos: string, neg: string, icon: string, c: string) => {
    const { r, n } = pearson(a, b)
    if (r == null) return
    if (Math.abs(r) >= 0.3) findings.push({ icon, c, text: `${r > 0 ? pos : neg} (${n} days, ${Math.abs(r) >= 0.5 ? 'strong' : 'moderate'} link)` })
    else findings.push({ icon, c, text: `${label}: no clear link yet (${n} days).` })
  }
  rel('Sleep and mood', sleep, mood, 'More sleep goes with a better mood the same day.', 'Oddly, more sleep goes with lower mood. Worth watching.', 'moon', 'var(--sky)')
  rel('Caffeine and anxiety', S('caffeine'), anx, 'More caffeine goes with more anxiety.', 'More caffeine goes with less anxiety for you.', 'bolt', 'var(--orange)')
  rel('Exercise and mood', S('exercise'), mood, 'Exercise days go with a better mood.', 'Exercise days go with lower mood. Maybe it’s timing.', 'heart', 'var(--mint)')
  rel('Alcohol and next-day mood', shift(S('alcohol')), mood, 'Drinking goes with a better mood the next day.', 'Drinking goes with a lower mood the next day.', 'pulse', 'var(--coral)')
  rel('Screen time and mood', S('screen_time'), mood, 'More screen time goes with a better mood.', 'More screen time goes with a lower mood.', 'grid', 'var(--violet)')

  const habits = metrics.filter((m) => m.role === 'habit')
  const vices = metrics.filter((m) => m.role === 'vice')
  const ciDays = new Set(checkins.map((c) => c.day))
  const ciRate = days.filter((d) => ciDays.has(d)).length
  const anyData = mood.some((v) => v != null) || sleep.some((v) => v != null)

  const habitLine = (m: Metric) => {
    const s = dailySeries(m, logs, days)
    const c = consistency(s), st = streak(s)
    return (
      <div class="metric-row">
        <div class="row between"><span>{m.name}</span><span class="small faint">{c.hit}/{c.n} days{st > 1 ? ` · ${st} in a row` : ''}</span></div>
        <div class="progress" style="margin:8px 0 4px"><i style={`width:${c.pct * 100}%`} /></div>
        {c.lastTwoMissed && <div class="small" style="color:var(--peach)">Missed the last two days. Never miss twice: a tiny version today counts.</div>}
      </div>
    )
  }

  return (
    <>
      <PageHead title="Insights" icon="chart" color="var(--teal)" action={<div class="chips">{[7, 30, 90].map((n) => <button class={`chip ${range === n ? 'on' : ''}`} style="height:30px" onClick={() => setRange(n)}>{n}d</button>)}</div>} />
      <div class="stat-row four">
        <div class="stat" style="--c:var(--pink)"><div class="s-val">{avg(mood)?.toFixed(1) ?? '–'}</div><div class="s-lbl">avg mood</div></div>
        <div class="stat" style="--c:var(--sky)"><div class="s-val">{avg(sleep)?.toFixed(1) ?? '–'}</div><div class="s-lbl">avg sleep (h)</div></div>
        <div class="stat" style="--c:var(--orange)"><div class="s-val">{ciRate}</div><div class="s-lbl">days checked in</div></div>
        <div class="stat desk-only" style="--c:var(--violet)"><div class="s-val">{avg(energy)?.toFixed(1) ?? '–'}</div><div class="s-lbl">avg energy</div></div>
      </div>
      {!anyData && <div class="card soft"><p class="small">Charts fill in as you log. A week of nightly logs is enough for the first patterns.</p></div>}
      <div class="grid-2">
        <div>
          <Card title="Mood, energy, anxiety" icon="heart" accent="var(--pink)">
            <LineChart days={days} min={1} max={10} series={[{ label: 'Mood', color: '#ff8cc8', values: mood }, { label: 'Energy', color: '#ffd66b', values: energy }, { label: 'Anxiety', color: '#8fc4ff', values: anx }]} />
            <div class="legend"><span><i class="dot" style="background:#ff8cc8" /> Mood</span><span><i class="dot" style="background:#ffd66b" /> Energy</span><span><i class="dot" style="background:#8fc4ff" /> Anxiety</span></div>
          </Card>
          <Card title="Sleep" icon="moon" accent="var(--sky)">
            <BarChart days={days} values={sleep} color="#8fc4ff" target={k('sleep_hours')?.target ?? 8} />
          </Card>
          <Card title="What goes with what" icon="sparkle" accent="var(--teal)">
            {findings.length ? findings.map((f) => <div class="finding" style={`--c:${f.c}`}><span class="f-ico"><Icon name={f.icon} size={16} /></span><span class="small">{f.text}</span></div>)
              : <p class="muted small">Needs about a week of logs before patterns mean anything.</p>}
            <p class="faint tiny" style="margin-top:8px">These are patterns in your own data, not proof of cause.</p>
          </Card>
        </div>
        <div>
          <Card title="Habits" icon="flame" accent="var(--violet)">{habits.length ? habits.map(habitLine) : <p class="muted small">No habits set up.</p>}</Card>
          <Card title="Vices" icon="pulse" accent="var(--coral)">
            {vices.map((m) => { const s = dailySeries(m, logs, days); const a = avg(s); const free = s.filter((v) => !v).length; return (
              <div class="metric-row"><div class="row between small" style="margin-bottom:8px"><span>{m.name}</span><span class="faint">{free} free day{free === 1 ? "" : "s"}{a != null ? ` · avg ${fmtValue(m, a)}` : ''}</span></div><Heat values={s.slice(-28)} color="#ff8a7a" /></div>
            ) })}
          </Card>
        </div>
      </div>
    </>
  )
}
