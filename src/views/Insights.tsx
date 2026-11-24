import { useState } from 'preact/hooks'
import { useStore } from '../lib/store'
import { lastNDays } from '../lib/dates'
import { dailySeries, consistency, streak } from '../lib/metrics'
import type { Metric } from '../lib/types'
import { Icon } from '../ui/icons'
import { PageHead, Card } from '../ui/kit'
import { LineChart, BarChart } from '../ui/charts'
import { fmtShort } from '../lib/dates'
import type { Review } from '../lib/types'
import { useRows, registerDemo } from '../lib/rows'

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

  const habits = metrics.filter((m) => m.role === 'habit')
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
        {c.lastTwoMissed && <div class="small" style="color:var(--peach)">Missed yesterday. Never miss twice: a tiny version today counts.</div>}
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
        </div>
      </div>
      <AiReports />
      <Reviews />
    </>
  )
}

/** Every weekly review, newest first, with how the weeks have felt over time. */
type Report = { id: string; title: string; period_start: string | null; period_end: string | null; body: string; author: string; created_at: string }
registerDemo('reports', () => [{ id: 'rp1', title: 'Your week, read by Claude', period_start: null, period_end: null, author: 'claude', created_at: new Date().toISOString(),
  body: '## What stood out\n- Mood was steadier on days you exercised.\n- Sleep dipped midweek, and stress rose the next day.\n\n## One thing to try\nProtect one evening for winding down before your busiest day.' }] as never)

/** Plain text with ## headings and - bullets, drawn as elements (never as raw HTML). */
function Prose({ text }: { text: string }) {
  const out: preact.ComponentChildren[] = []
  let list: string[] = []
  const flush = () => { if (list.length) { out.push(<ul class="prose-ul">{list.map((l) => <li>{l}</li>)}</ul>); list = [] } }
  for (const raw of text.split('\n')) {
    const l = raw.trim()
    if (/^[-*•]\s+/.test(l)) { list.push(l.replace(/^[-*•]\s+/, '').replace(/\*\*/g, '')); continue }
    flush()
    if (!l) continue
    if (/^#{1,4}\s+/.test(l)) out.push(<h3 class="prose-h">{l.replace(/^#+\s+/, '')}</h3>)
    else out.push(<p class="prose-p">{l.replace(/\*\*/g, '')}</p>)
  }
  flush()
  return <div class="prose">{out}</div>
}

/** Claude's longer read of your data, about once a week. Claude writes these into the reports table. */
function AiReports() {
  const rows = useRows<Report>('reports')
  const [open, setOpen] = useState<string | null>(null)
  const list = [...(rows ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const cur = list.find((r) => r.id === open) ?? list[0]
  const when = (r: Report) => r.period_start && r.period_end ? `${fmtShort(r.period_start)} to ${fmtShort(r.period_end)}` : fmtShort(r.created_at.slice(0, 10))
  return (
    <Card title="AI analysis" icon="sparkle" accent="var(--teal)">
      {!cur ? <p class="muted small">Claude’s full read of your data lands here, about once a week: patterns across mood, sleep, school, money and your journal, and one or two things to try.</p> : <>
        <div class="row between" style="margin-bottom:6px"><b>{cur.title}</b><span class="faint small">{when(cur)}</span></div>
        <Prose text={cur.body} />
        {list.length > 1 && <div class="chips" style="margin-top:10px">{list.slice(0, 8).map((r) => <button class={`chip small ${r.id === cur.id ? 'on' : ''}`} onClick={() => setOpen(r.id)}>{when(r)}</button>)}</div>}
      </>}
    </Card>
  )
}

function Reviews() {
  const reviews = useStore((s) => [...s.reviews].sort((a, b) => b.week_start.localeCompare(a.week_start)))
  const [open, setOpen] = useState<string | null>(null)
  if (!reviews.length) return <Card title="Weekly reviews" icon="review" accent="var(--lilac)"><p class="muted small">Your weekly reviews collect here, so you can see how the weeks add up. <a href="#/review">Do last week’s</a>.</p></Card>
  const asc = [...reviews].reverse().slice(-12)
  return (
    <Card title="Weekly reviews" icon="review" accent="var(--lilac)" action={<a class="link" href="#/review">This week’s</a>}>
      {asc.length > 1 && <><BarChart days={asc.map((r) => r.week_start)} values={asc.map((r) => r.rating)} color="#cdb9ff" target={7} /><p class="faint tiny" style="margin:4px 0 10px">How each week felt, out of 10.</p></>}
      {reviews.slice(0, 12).map((r: Review) => (
        <div class="faq">
          <button class="row between" onClick={() => setOpen(open === r.id ? null : r.id)}><span>Week of {fmtShort(r.week_start)}</span><span class="faint small">{r.rating ? `${r.rating}/10` : ''}</span></button>
          {open === r.id && <div class="small" style="padding:0 2px 12px;line-height:1.5">
            {r.focus?.length > 0 && <p><b>Focus:</b> {r.focus.join(', ')}</p>}
            {r.wins && <p style="margin-top:4px"><b>Went well:</b> {r.wins}</p>}
            {r.lessons && <p style="margin-top:4px"><b>Change:</b> {r.lessons}</p>}
          </div>}
        </div>
      ))}
    </Card>
  )
}
