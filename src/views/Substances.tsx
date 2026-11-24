import { useState } from 'preact/hooks'
import { useRows, addRow, dropRow, registerDemo } from '../lib/rows'
import { toast, setState, useStore } from '../lib/store'
import { dayKey, today, addDays, fmtDay, fmtTime, weekStart, lastNDays, fromKey } from '../lib/dates'
import { Icon } from '../ui/icons'
import { Sheet, PageHead, Card, haptic } from '../ui/kit'
import { BarChart } from '../ui/charts'

/**
 * Substances: one running log of everything non-food you take (coffee, alcohol, weed, supplements, meds).
 * Each entry is a row in substance_logs. Later this sits next to sleep, exercise and mood in Insights.
 */
export type Sub = { id: string; substance: string; amount: number | null; unit: string | null; occurred_at: string; time_known: boolean; note: string | null; source: string }

const STARTERS: { name: string; unit: string; amount: number }[] = [
  { name: 'Caffeine', unit: 'cup', amount: 1 }, { name: 'Alcohol', unit: 'drink', amount: 1 }, { name: 'Weed', unit: 'hit', amount: 1 },
  { name: 'NAD+', unit: 'mg', amount: 300 }, { name: 'Modafinil', unit: 'mg', amount: 100 },
]
const COLORS = ['#ffa463', '#ff8cc8', '#79e2b4', '#8fc4ff', '#ffd66b', '#a98bff', '#ff8a7a', '#6fe0dc']
export const subColor = (name: string, all: string[]) => COLORS[Math.max(0, all.indexOf(name)) % COLORS.length]

registerDemo('substance_logs', () => {
  const out: Sub[] = []
  lastNDays(40).forEach((d, i) => {
    const at = (h: number) => { const x = fromKey(d); x.setHours(h, (i * 7) % 60); return x.toISOString() }
    out.push({ id: `s${i}a`, substance: 'Caffeine', amount: 1 + (i % 3 === 0 ? 1 : 0), unit: 'cup', occurred_at: at(8), time_known: true, note: null, source: 'app' })
    if (i % 4 === 1) out.push({ id: `s${i}b`, substance: 'Alcohol', amount: 2, unit: 'drink', occurred_at: at(21), time_known: true, note: null, source: 'app' })
    if (i % 3 === 2) out.push({ id: `s${i}c`, substance: 'NAD+', amount: 300, unit: 'mg', occurred_at: at(9), time_known: true, note: null, source: 'app' })
    if (i % 9 === 4) out.push({ id: `s${i}d`, substance: 'Modafinil', amount: 100, unit: 'mg', occurred_at: at(7), time_known: true, note: 'Exam day', source: 'app' })
  })
  return out.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)) as never
})

/** Names you've used, most recent first, then the starters you haven't. */
function useNames(rows: Sub[] | null) {
  const seen: string[] = []
  for (const r of rows ?? []) if (!seen.includes(r.substance)) seen.push(r.substance)
  return [...seen, ...STARTERS.map((s) => s.name).filter((n) => !seen.includes(n))]
}

export function SubstanceSheet({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: string }) {
  const rows = useRows<Sub>('substance_logs')
  const names = useNames(rows)
  const [name, setName] = useState(initial ?? '')
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState('')
  const [when, setWhen] = useState<'now' | 'earlier' | 'day'>('now')
  const [time, setTime] = useState('')
  const [note, setNote] = useState('')
  const pick = (n: string) => {
    setName(n)
    const last = rows?.find((r) => r.substance === n)
    const st = STARTERS.find((s) => s.name === n)
    setAmount(String(last?.amount ?? st?.amount ?? 1)); setUnit(last?.unit ?? st?.unit ?? '')
  }
  const reset = () => { setName(''); setAmount(''); setUnit(''); setWhen('now'); setTime(''); setNote('') }
  async function save() {
    const n = name.trim()
    if (!n) return
    let at = new Date()
    if (when === 'earlier' && time) { const [h, m] = time.split(':').map(Number); at = new Date(); at.setHours(h, m, 0, 0) }
    if (when === 'day') { at = new Date(); at.setHours(12, 0, 0, 0) }
    haptic()
    try {
      await addRow('substance_logs', { substance: n, amount: amount ? Number(amount) : null, unit: unit.trim() || null, occurred_at: at.toISOString(), time_known: when !== 'day', note: note.trim() || null, source: 'app' })
      toast(`${n} logged${when === 'day' ? ' for today' : ` at ${fmtTime(at.toISOString())}`}`); reset(); onClose()
    } catch { /* toast shown */ }
  }
  return (
    <Sheet open={open} onClose={() => { reset(); onClose() }} title="Log a substance">
      <div class="chips" style="margin-bottom:14px">
        {names.slice(0, 10).map((n) => <button class={`chip ${name === n ? 'on' : ''}`} style={`--c:${subColor(n, names)}`} onClick={() => pick(n)}>{n}</button>)}
      </div>
      <label class="field"><span>What</span><input class="input" placeholder="Anything non-food" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} /></label>
      <div class="row">
        <label class="field grow"><span>Amount</span><input class="input" type="number" inputMode="decimal" value={amount} onInput={(e) => setAmount((e.target as HTMLInputElement).value)} /></label>
        <label class="field grow"><span>Unit</span><input class="input" placeholder="mg, cup, drink…" value={unit} onInput={(e) => setUnit((e.target as HTMLInputElement).value)} /></label>
      </div>
      <div class="field"><span>When</span><div class="chips">
        <button class={`chip ${when === 'now' ? 'on' : ''}`} onClick={() => setWhen('now')}>Just now</button>
        <button class={`chip ${when === 'earlier' ? 'on' : ''}`} onClick={() => setWhen('earlier')}>Earlier today</button>
        <button class={`chip ${when === 'day' ? 'on' : ''}`} onClick={() => setWhen('day')}>Today, no time</button>
      </div></div>
      {when === 'earlier' && <label class="field"><span>Time</span><input class="input" type="time" value={time} onInput={(e) => setTime((e.target as HTMLInputElement).value)} /></label>}
      <label class="field"><span>Note (optional)</span><input class="input" value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} /></label>
      <button class="btn primary block" disabled={!name.trim()} onClick={save}>Log it</button>
    </Sheet>
  )
}

/** The button on Home's quick log. */
export function SubstanceQuick() {
  return <button class="qbtn" style="--c:var(--orange)" onClick={() => setState({ substance: true })}><Icon name="flask" size={18} />Substance</button>
}

/** Mounted once in the app shell, opened from Home or Capture. */
export function GlobalSubstanceSheet() {
  const open = useStore((s) => s.substance)
  return <SubstanceSheet open={open} onClose={() => setState({ substance: false })} />
}

const fmtAmt = (r: Sub) => r.amount != null ? `${r.amount}${r.unit ? ` ${r.unit}` : ''}` : ''

function Detail({ name, rows, color }: { name: string; rows: Sub[]; color: string }) {
  const mine = rows.filter((r) => r.substance === name)
  const byDay = new Map<string, number>()
  for (const r of mine) { const d = dayKey(new Date(r.occurred_at)); byDay.set(d, (byDay.get(d) ?? 0) + (r.amount ?? 1)) }
  // Calendar: the last 8 weeks, Monday first.
  const start = addDays(weekStart(), -7 * 7)
  const cells = Array.from({ length: 56 }, (_, i) => dayKey(addDays(start, i)))
  const max = Math.max(1, ...byDay.values())
  // Weekly totals for 12 weeks.
  const weeks = Array.from({ length: 12 }, (_, i) => dayKey(addDays(weekStart(), -7 * (11 - i))))
  const weekly = weeks.map((w) => { let s = 0; for (let i = 0; i < 7; i++) s += byDay.get(dayKey(addDays(fromKey(w), i))) ?? 0; return s })
  const days30 = lastNDays(30)
  const used30 = days30.filter((d) => byDay.has(d)).length
  const total30 = days30.reduce((a, d) => a + (byDay.get(d) ?? 0), 0)
  const unit = mine.find((r) => r.unit)?.unit ?? ''
  const t = today()
  return (
    <>
      <div class="stats3">
        <div><b>{used30}</b><span>days in last 30</span></div>
        <div><b>{Math.round(total30 * 10) / 10}</b><span>{unit ? `${unit} in 30 days` : 'in 30 days'}</span></div>
        <div><b>{weekly[11]}</b><span>this week</span></div>
      </div>
      <Card title="Last 8 weeks" icon="cal" accent={color}>
        <div class="weekhead">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => <span>{d}</span>)}</div>
        <div class="heat7">{cells.map((d) => { const v = byDay.get(d); return <i title={`${fmtDay(d)}: ${v ?? 0}`} class={d === t ? 'today' : d > t ? 'future' : ''} style={v ? `background:${color};opacity:${0.35 + 0.65 * (v / max)}` : ''} /> })}</div>
      </Card>
      <Card title="Each week" icon="chart" accent={color}><BarChart days={weeks} values={weekly} color={color} /></Card>
    </>
  )
}

export function Substances() {
  const rows = useRows<Sub>('substance_logs')
  const names = useNames(rows)
  const used = names.filter((n) => rows?.some((r) => r.substance === n))
  const [sel, setSel] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const list = (rows ?? []).filter((r) => !sel || r.substance === sel)
  const groups = new Map<string, Sub[]>()
  for (const r of list.slice(0, 200)) { const d = dayKey(new Date(r.occurred_at)); groups.set(d, [...(groups.get(d) ?? []), r]) }
  const del = async (r: Sub) => { if (confirm(`Delete this ${r.substance} entry?`)) await dropRow('substance_logs', r.id).catch(() => {}) }
  return (
    <>
      <PageHead title="Substances" sub="Everything non-food, in order" icon="flask" color="var(--orange)" back="#/area/health"
        action={<button class="btn primary sm" onClick={() => setOpen(true)}><Icon name="plus" size={16} />Log</button>} />
      {rows === null ? <div class="skeleton" /> : !rows.length ? (
        <div class="card soft"><p class="muted">Nothing logged yet. Tap Log, or use Substance in the quick log on Home. Coffee, a drink, a supplement or a med all go here.</p></div>
      ) : (
        <>
          <div class="chips scroll" style="margin-bottom:14px">
            <button class={`chip ${!sel ? 'on' : ''}`} onClick={() => setSel(null)}>All</button>
            {used.map((n) => <button class={`chip ${sel === n ? 'on' : ''}`} style={`--c:${subColor(n, names)}`} onClick={() => setSel(n)}>{n}</button>)}
          </div>
          {sel && <Detail name={sel} rows={rows} color={subColor(sel, names)} />}
          <Card title={sel ? `${sel} log` : 'Log'} icon="list" accent="var(--orange)">
            {[...groups].map(([d, items]) => (
              <div class="sublog">
                <div class="faint small" style="margin:10px 2px 4px">{fmtDay(d)}</div>
                {items.map((r) => (
                  <div class="row" style="padding:7px 2px;border-bottom:1px solid var(--line)">
                    <i class="dot" style={`background:${subColor(r.substance, names)}`} />
                    <span class="grow">{r.substance} <span class="muted small">{fmtAmt(r)}</span>{r.note && <div class="faint small">{r.note}</div>}</span>
                    <span class="faint small">{r.time_known ? fmtTime(r.occurred_at) : 'today'}</span>
                    <button class="faint" aria-label="Delete" onClick={() => del(r)}><Icon name="x" size={15} /></button>
                  </div>
                ))}
              </div>
            ))}
          </Card>
        </>
      )}
      <SubstanceSheet open={open} onClose={() => setOpen(false)} initial={sel ?? undefined} />
    </>
  )
}
