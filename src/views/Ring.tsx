import { useState } from 'preact/hooks'
import { useRows, registerDemo, reloadAll } from '../lib/rows'
import { supabase } from '../lib/supabase'
import { getState, toast } from '../lib/store'
import { bootstrap } from '../lib/db'
import { Icon } from '../ui/icons'
import { lastNDays, inDays, fmtShort, relTime } from '../lib/dates'
import { LineChart } from '../ui/charts'
import { Card } from '../ui/kit'

/**
 * Ultrahuman ring numbers, display-only. A private GitHub Action pulls them each morning into ring_days.vals;
 * sleep, sleep score, HRV, resting HR and steps also land in the daily log (ring beats Apple Health for the same day).
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
      if (data?.setup) { toast('One setup step left: see Help › Ultrahuman ring'); location.hash = '#/help/health'; return }
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
  if (rows === null) return null
  if (!rows.length) return (
    <Card title="Ring" icon="pulse" accent="var(--mint)">
      <p class="muted small">Your ring’s recovery, sleep stages and VO2 max will show here once the direct pull is switched on. It needs an Ultrahuman token saved in your private backups repo; <a href="#/help/health">Help</a> has the two steps. Until then, the Apple Health Shortcut keeps your sleep, HRV and steps coming.</p>
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
      <LineChart days={days} min={0} max={100} series={[{ label: 'Recovery', color: '#79e2b4', values: s('recovery_index') }, { label: 'Sleep score', color: '#a98bff', values: s('sleep_score') }, { label: 'Movement', color: '#ffa463', values: s('movement_index') }]} />
      <div class="legend"><span><i class="dot" style="background:#79e2b4" /> Recovery</span><span><i class="dot" style="background:#a98bff" /> Sleep score</span><span><i class="dot" style="background:#ffa463" /> Movement</span></div>
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
