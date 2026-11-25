import { useState } from 'preact/hooks'
import { useRows, registerDemo, reloadAll } from '../lib/rows'
import { supabase } from '../lib/supabase'
import { getState, toast } from '../lib/store'
import { bootstrap } from '../lib/db'
import { Icon } from '../ui/icons'
import { lastNDays, inDays, fmtShort, relTime, dayKey } from '../lib/dates'
import { LineChart } from '../ui/charts'
import { Card, Sheet } from '../ui/kit'
import { useStore } from '../lib/store'
import { dailySeries } from '../lib/metrics'
import { subKey, subColor, type Sub } from './Substances'

/**
 * Ultrahuman ring numbers, display-only. A private GitHub Action pulls them each morning into ring_days.vals;
 * sleep, sleep score, HRV, resting HR and steps also land in the daily log.
 */
type V = Partial<Record<'sleep_hours' | 'sleep_score' | 'hrv' | 'resting_hr' | 'steps' | 'deep_h' | 'rem_h' | 'light_h' | 'sleep_efficiency' | 'recovery_index' | 'movement_index' | 'vo2_max' | 'temp_deviation' | 'spo2' | 'active_minutes', number>>
type Day = { id: string; day: string; vals: V; fetched_at: string }

registerDemo('ring_days', () => Array.from({ length: 30 }, (_, i) => {
  const w = Math.sin(i / 3)
  return { id: `rd${i}`, day: inDays(-i), fetched_at: new Date().toISOString(), vals: { sleep_hours: 7 + w * 0.6, sleep_score: 78 + Math.round(w * 8), hrv: 52 + Math.round(w * 9), resting_hr: 56 - Math.round(w * 3), recovery_index: 70 + Math.round(w * 12), movement_index: 60 + Math.round(Math.cos(i) * 10), vo2_max: 44, deep_h: 1.4, rem_h: 1.7, sleep_efficiency: 89, temp_deviation: Math.round(w * 30) / 100, spo2: 97 } }
}) as never)

/** Asks the ring-sync edge function to pull the last 3 days from Ultrahuman right now, then refreshes. */
function SyncRing() {
  const [busy, setBusy] = useState(false)
  const go = async () => {
    if (busy) return
    if (getState().demo) { toast('Ring synced (demo)'); return }
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('ring-sync', { method: 'POST' })
      if (error) throw error
      if (data?.setup) { toast('The ring needs reconnecting. See Help.'); location.hash = '#/help/ring'; return }
      await Promise.all([reloadAll(), bootstrap(true)])
      const first = (data?.days ?? []).find((d: { note?: string }) => d.note && d.note !== 'not synced yet')
      toast(data?.latest ? `Ring synced through ${fmtShort(data.latest)}` : first ? `Couldn’t sync: ${first.note}` : 'Nothing new. Open the Ultrahuman app so the ring uploads, then try again.')
    } catch (e) { toast(`Couldn’t reach the ring sync: ${(e as Error).message}`) }
    finally { setBusy(false) }
  }
  return <button class={`btn ghost sm ${busy ? 'busy' : ''}`} onClick={go} disabled={busy} aria-label="Sync ring now"><Icon name="history" size={15} />{busy ? 'Syncing…' : 'Sync'}</button>
}

const hm = (h?: number) => (h == null ? '–' : `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`)
const n0 = (x?: number) => (x == null ? '–' : `${Math.round(x)}`)

export function RingPanel() {
  const rows = useRows<Day>('ring_days')
  const [big, setBig] = useState(false)
  if (rows === null) return null
  if (!rows.length) return (
    <Card title="Ring" icon="pulse" accent="var(--mint)">
      <p class="muted small">Nothing from your ring yet. Open the Ultrahuman app so the ring uploads, then tap Sync. If it keeps coming up empty, <a href="#/help/ring">Help</a> has how to reconnect it.</p>
    </Card>
  )
  const byDay = new Map(rows.map((r) => [r.day, r.vals]))
  // The newest row with a night's sleep; a day that's only begun carries little else.
  const latest = rows.find((r) => r.vals.sleep_hours != null) ?? rows[0]!
  const v = latest.vals
  const days = lastNDays(30)
  const s = (k: keyof V) => days.map((d) => byDay.get(d)?.[k] ?? null)
  const tile = (label: string, val: string, c: string) => <div class="stat" style={`--c:${c}`}><div class="s-val">{val}</div><div class="s-lbl">{label}</div></div>
  return (
    <Card title="Ring" icon="pulse" accent="var(--mint)" action={<SyncRing />}>
      <div class="faint small" style="margin:-4px 0 10px">{fmtShort(latest.day)} · pulled {relTime(latest.fetched_at)}</div>
      <div class="stat-row four">
        {tile('Recovery', n0(v.recovery_index), 'var(--mint)')}
        {tile('Sleep', hm(v.sleep_hours), 'var(--violet)')}
        {tile('HRV', v.hrv != null ? `${n0(v.hrv)} ms` : '–', 'var(--sky)')}
        {tile('VO2 max', n0(v.vo2_max), 'var(--orange)')}
      </div>
      <button class="chart-tap" onClick={() => setBig(true)} aria-label="Open the bigger view">
        <LineChart days={days} min={0} max={100} series={[{ label: 'Recovery', color: '#79e2b4', values: s('recovery_index') }, { label: 'Sleep score', color: '#a98bff', values: s('sleep_score') }, { label: 'Movement', color: '#ffa463', values: s('movement_index') }]} />
        <div class="legend"><span><i class="dot" style="background:#79e2b4" /> Recovery</span><span><i class="dot" style="background:#a98bff" /> Sleep score</span><span><i class="dot" style="background:#ffa463" /> Movement</span><span class="faint" style="margin-left:auto">Tap to explore</span></div>
      </button>
      <RingExplore open={big} onClose={() => setBig(false)} rows={rows} />
      <div class="faint small" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:4px 14px">
        {v.deep_h != null && <span>Deep {hm(v.deep_h)}</span>}
        {v.rem_h != null && <span>REM {hm(v.rem_h)}</span>}
        {v.sleep_efficiency != null && <span>Efficiency {n0(v.sleep_efficiency)}%</span>}
        {v.resting_hr != null && <span>Resting HR {n0(v.resting_hr)}</span>}
        {v.temp_deviation != null && <span>Skin temp {v.temp_deviation > 0 ? '+' : ''}{v.temp_deviation.toFixed(1)}°C</span>}
        {v.spo2 != null && <span>SpO2 {n0(v.spo2)}%</span>}
      </div>
    </Card>
  )
}

/**
 * The bigger view: ring numbers next to what you logged (mood, stress, energy, focus) and dots for
 * the days you took something. Each line is stretched to fill the chart, so you compare shapes, not units.
 */
const LINES: { k: string; label: string; color: string; from: 'ring' | 'log'; on?: boolean }[] = [
  { k: 'recovery_index', label: 'Recovery', color: '#79e2b4', from: 'ring', on: true },
  { k: 'sleep_score', label: 'Sleep score', color: '#a98bff', from: 'ring' },
  { k: 'sleep_hours', label: 'Sleep hours', color: '#8fc4ff', from: 'ring' },
  { k: 'hrv', label: 'HRV', color: '#6fe0dc', from: 'ring' },
  { k: 'mood', label: 'Mood', color: '#ffa463', from: 'log', on: true },
  { k: 'anxiety', label: 'Stress', color: '#ff8a7a', from: 'log' },
  { k: 'energy', label: 'Energy', color: '#ffd66b', from: 'log' },
  { k: 'focus', label: 'Focus', color: '#cdb9ff', from: 'log' },
]
function RingExplore({ open, onClose, rows }: { open: boolean; onClose: () => void; rows: Day[] }) {
  const [n, setN] = useState(30)
  const [on, setOn] = useState(() => new Set(LINES.filter((l) => l.on).map((l) => l.k)))
  const [subsOn, setSubsOn] = useState(true)
  const logs = useStore((st) => st.logs)
  const metrics = useStore((st) => st.metrics)
  const subs = useRows<Sub>('substance_logs')
  if (!open) return <Sheet open={false} onClose={onClose}>{null}</Sheet>
  const days = lastNDays(n)
  const byDay = new Map(rows.map((r) => [r.day, r.vals]))
  const raw = (l: typeof LINES[number]) => {
    if (l.from === 'ring') return days.map((d) => (byDay.get(d)?.[l.k as keyof V] as number | undefined) ?? null)
    const m = metrics.find((x) => x.key === l.k)
    return m ? dailySeries(m, logs, days) : days.map(() => null)
  }
  const scaled = (vals: (number | null)[]) => {
    const v = vals.filter((x): x is number => x != null)
    if (!v.length) return vals
    const lo = Math.min(...v), hi = Math.max(...v)
    return vals.map((x) => (x == null ? null : hi === lo ? 50 : 8 + ((x - lo) / (hi - lo)) * 84))
  }
  const shown = LINES.filter((l) => on.has(l.k))
  const series = shown.map((l) => ({ label: l.label, color: l.color, values: scaled(raw(l)) }))
  // The four substances you log most, as dot rows under the chart.
  const counts = new Map<string, { name: string; days: Set<string> }>()
  for (const r of subs ?? []) {
    const d = dayKey(new Date(r.occurred_at)); if (!days.includes(d)) continue
    const k = subKey(r.substance); const e = counts.get(k) ?? { name: r.substance.replace(/\s*\(.*?\)\s*/g, ' ').trim(), days: new Set<string>() }
    e.days.add(d); counts.set(k, e)
  }
  const top = [...counts.values()].sort((a, b) => b.days.size - a.days.size).slice(0, 4)
  const names = top.map((t) => t.name)
  const marks = subsOn ? top.map((t) => ({ color: subColor(t.name, names), days: t.days })) : []
  const toggle = (k: string) => { const x = new Set(on); if (x.has(k)) x.delete(k); else x.add(k); setOn(x) }
  return (
    <Sheet open={open} onClose={onClose} title="Ring and how you felt" wide>
      <div class="seg" style="margin-bottom:12px">{[14, 30, 90].map((d) => <button class={n === d ? 'on' : ''} onClick={() => setN(d)}>{d} days</button>)}</div>
      <div class="big-chart"><LineChart days={days} min={0} max={100} series={series} marks={marks} hideAxis /></div>
      {marks.length > 0 && <div class="legend" style="margin-top:6px">{top.map((t) => <span><i class="dot" style={`background:${subColor(t.name, names)}`} /> {t.name}</span>)}</div>}
      <div class="chips" style="margin-top:14px">
        {LINES.map((l) => <button class={`chip small ${on.has(l.k) ? 'on' : ''}`} style={`--c:${l.color}`} onClick={() => toggle(l.k)}><i class="dot" style={`background:${l.color}`} />{l.label}</button>)}
        {top.length > 0 && <button class={`chip small ${subsOn ? 'on' : ''}`} style="--c:var(--orange)" onClick={() => setSubsOn(!subsOn)}><Icon name="flask" size={13} />Substances</button>}
      </div>
      <p class="faint tiny" style="margin-top:10px">Each line is stretched to fill the chart, so you’re comparing ups and downs, not the numbers themselves. Mood, stress, energy and focus are the day’s average of what you logged.</p>
    </Sheet>
  )
}
