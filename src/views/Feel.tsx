import { useEffect, useState } from 'preact/hooks'
import { useStore, setState, metricByKey, toast } from '../lib/store'
import { addTimedLog, remove, restore } from '../lib/db'
import { fmtTime, today, dayKey } from '../lib/dates'
import { Sheet, ScalePicker, haptic } from '../ui/kit'
import { Icon } from '../ui/icons'

/**
 * "How are you right now?" Any time, as often as you like. Each answer is its own timed point
 * on the 1 to 10 trackers mood, energy, anxiety (stress / anxiety) and focus, so the app can line
 * them up against sleep, substances, classes and work. Answer one row or all four.
 */
export const FEELS: { key: string; label: string; low: string; high: string; tone: 'warm' | 'cool' | 'rev' }[] = [
  { key: 'mood', label: 'Mood', low: 'Rough', high: 'Great', tone: 'warm' },
  { key: 'energy', label: 'Energy', low: 'Drained', high: 'Wired', tone: 'warm' },
  { key: 'anxiety', label: 'Stress or anxiety', low: 'Calm', high: 'Very high', tone: 'rev' },
  { key: 'focus', label: 'Focus', low: 'Scattered', high: 'Locked in', tone: 'cool' },
]
const WHEN: [string, number][] = [['Just now', 0], ['30 min ago', 30], ['1 hour ago', 60], ['2 hours ago', 120]]

/** Today's timed points, newest first, grouped by when they were logged. */
function useTodayPoints() {
  const ids = useStore((s) => s.metrics.filter((m) => FEELS.some((f) => f.key === m.key)).map((m) => [m.id, m.key] as const))
  return useStore((s) => {
    const byId = new Map(ids)
    const pts = s.logs.filter((l) => byId.has(l.metric_id) && l.source !== 'daily' && l.value_num != null && dayKey(new Date(l.occurred_at)) === today())
    const groups = new Map<string, typeof pts>()
    for (const p of pts) groups.set(p.occurred_at.slice(0, 16), [...(groups.get(p.occurred_at.slice(0, 16)) ?? []), p])
    return [...groups].sort((a, b) => b[0].localeCompare(a[0])).map(([, g]) => ({ at: g[0].occurred_at, items: g.map((l) => ({ ...l, key: byId.get(l.metric_id)! })) }))
  })
}

export function FeelSheet() {
  const open = useStore((s) => s.feel)
  const [vals, setVals] = useState<Record<string, number>>({})
  const [ago, setAgo] = useState(0)
  const [clock, setClock] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const points = useTodayPoints()
  useEffect(() => { if (open) { setVals({}); setAgo(0); setClock(''); setNote('') } }, [open])
  const close = () => setState({ feel: false })
  const when = () => {
    if (clock) { const [h, m] = clock.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d }
    return new Date(Date.now() - ago * 60e3)
  }
  async function save() {
    const keys = Object.keys(vals)
    if (!keys.length || busy) return
    setBusy(true)
    const at = when().toISOString()
    try {
      for (const [i, k] of keys.entries()) {
        const m = metricByKey(k)
        if (m) await addTimedLog(m.id, vals[k], null, i === 0 && note.trim() ? note.trim() : null, at)
      }
      haptic()
      toast(`Logged for ${fmtTime(at)}`)
      close()
    } catch { /* shown */ } finally { setBusy(false) }
  }
  async function drop(g: { items: { id: string }[] }) {
    const rows = g.items.map((i) => ({ ...i }))
    for (const r of g.items) await remove('logs', r.id).catch(() => {})
    toast('Removed', () => rows.forEach((r) => restore('logs', r as never)))
  }
  const n = Object.keys(vals).length
  return (
    <Sheet open={open} onClose={close} title="How are you right now?">
      {FEELS.map((f) => (
        <div class="feel-row">
          <div class="row between"><span class="feel-l">{f.label}</span>{vals[f.key] != null && <button class="faint tiny" onClick={() => { const v = { ...vals }; delete v[f.key]; setVals(v) }}>Clear</button>}</div>
          <ScalePicker value={vals[f.key] ?? null} low={f.low} high={f.high} tone={f.tone} onChange={(v) => setVals({ ...vals, [f.key]: v })} />
        </div>
      ))}
      <div class="field"><span>When</span><div class="chips">
        {WHEN.map(([l, m]) => <button class={`chip ${!clock && ago === m ? 'on' : ''}`} onClick={() => { setAgo(m); setClock('') }}>{l}</button>)}
        <label class={`chip ${clock ? 'on' : ''}`} style="position:relative">{clock ? fmtTime(when().toISOString()) : 'Pick a time'}
          <input type="time" class="chip-time" value={clock} onInput={(e) => setClock((e.target as HTMLInputElement).value)} /></label>
      </div></div>
      <label class="field"><span>Note <span class="faint">(optional)</span></span><input class="input" placeholder="What’s going on?" value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} /></label>
      <button class="btn primary block" disabled={!n || busy} onClick={save}>{n ? `Log ${n === 1 ? 'it' : `these ${n}`}` : 'Pick at least one'}</button>
      {points.length > 0 && <div style="margin-top:18px">
        <div class="faint tiny" style="margin-bottom:6px">Earlier today</div>
        {points.map((g) => (
          <div class="feel-pt">
            <span class="faint small" style="width:64px">{fmtTime(g.at)}</span>
            <span class="grow small">{g.items.map((i) => `${FEELS.find((f) => f.key === i.key)?.label.split(' ')[0]} ${i.value_num}`).join(' · ')}</span>
            <button class="icon-btn sm" aria-label="Remove" onClick={() => drop(g)}><Icon name="x" size={15} /></button>
          </div>
        ))}
      </div>}
    </Sheet>
  )
}
