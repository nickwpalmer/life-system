import { useState } from 'preact/hooks'
import { useStore } from '../lib/store'
import { lastNDays, today, fmtShort } from '../lib/dates'
import { dailySeries, consistency, streak } from '../lib/metrics'
import type { Metric } from '../lib/types'
import { healthHub } from '../lib/hubs'
import { PageHead, Card } from '../ui/kit'
import { LogRow, TimedLogSheet } from './DailyLog'
import { AreaView } from './Area'
import { Substances } from './Substances'

/**
 * Health, in one place (v0.7). Body is the ring, sleep, energy and health goals. Mind is mood, stress and the
 * mental-health area. Habits are the daily ones you tick off, from every area. Substances is the running log.
 * They were four pages; they share goals, they feed the same Insights, and you'd look at them together.
 */
export function Health({ tab }: { tab?: string }) {
  const on = tab === 'mind' || tab === 'habits' || tab === 'substances' ? tab : 'body'
  const hub = healthHub(on)
  if (on === 'mind') return <AreaView areaKey="mental" hub={hub} />
  if (on === 'substances') return <Substances hub={hub} />
  if (on === 'habits') return <Habits />
  return <AreaView areaKey="health" hub={hub} />
}

/** Fourteen little squares, oldest on the left: filled on days you did it. */
function Dots({ s }: { s: (number | null)[] }) {
  return <span class="hdots" aria-hidden="true">{s.map((v, i) => <i class={v ? 'on' : ''} style={i === s.length - 1 ? 'outline:1px solid var(--line-2)' : ''} />)}</span>
}

function Habits() {
  const metrics = useStore((s) => s.metrics.filter((m) => m.active && m.role === 'habit').sort((a, b) => a.sort - b.sort))
  const logs = useStore((s) => s.logs)
  const areas = useStore((s) => s.areas)
  const [timed, setTimed] = useState<Metric | null>(null)
  const days = lastNDays(14)
  const t = today()
  const doneToday = metrics.filter((m) => (dailySeries(m, logs, [t])[0] ?? 0) > 0).length
  return (
    <>
      <PageHead hub={healthHub('habits')} title="Health" sub={metrics.length ? `${doneToday} of ${metrics.length} done today` : undefined} />
      {!metrics.length ? <div class="card soft"><p class="muted">No habits set up. Add one in Settings, under trackers.</p></div> : <>
        <Card title="Today" icon="check" accent="var(--mint)">
          {metrics.map((m) => <LogRow m={m} day={t} onTimed={setTimed} />)}
        </Card>
        <Card title="Last two weeks" icon="flame" accent="var(--violet)" action={<span class="faint small">{fmtShort(days[0]!)} to today</span>}>
          {metrics.map((m) => {
            const s = dailySeries(m, logs, days)
            const c = consistency(s), st = streak(s)
            const area = areas.find((a) => a.id === m.area_id)
            return (
              <div class="habit-line">
                <div class="row between"><span>{m.name}{area && <span class="faint tiny"> · {area.name}</span>}</span><span class="small faint">{c.hit}/14{st > 1 ? ` · ${st} in a row` : ''}</span></div>
                <Dots s={s} />
                {c.lastTwoMissed && c.hit > 0 && <div class="small" style="color:var(--peach)">Missed yesterday. A tiny version today keeps it going.</div>}
              </div>
            )
          })}
        </Card>
        <p class="faint small" style="margin:0 4px 14px">Habits that never earn their place can come off. <a class="link" href="#/settings">Turn one off</a> and its history stays.</p>
      </>}
      <TimedLogSheet m={timed} day={t} onClose={() => setTimed(null)} />
    </>
  )
}
