import { useEffect, useState } from 'preact/hooks'
import { useRows, addRow, dropRow, patchRow, registerDemo } from '../lib/rows'
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
  { name: 'Caffeine', unit: 'mg', amount: 100 }, { name: 'Alcohol', unit: 'drink', amount: 1 }, { name: 'THC', unit: 'hit', amount: 1 },
  { name: 'NAD+', unit: 'mg', amount: 300 }, { name: 'Modafinil', unit: 'mg', amount: 100 },
]
const COLORS = ['#ffa463', '#ff8cc8', '#79e2b4', '#8fc4ff', '#ffd66b', '#a98bff', '#ff8a7a', '#6fe0dc']
export const subColor = (name: string, all: string[]) => COLORS[Math.max(0, all.indexOf(name)) % COLORS.length]

/**
 * Names that mean the same thing group together: case and spacing don't matter, anything in brackets
 * ("NAD+ (injection)") is detail, and a few common aliases fold in.
 */
const ALIAS: Record<string, string> = { weed: 'thc', marijuana: 'thc', cannabis: 'thc', 'vape pen': 'thc', b12: 'methylcobalamin b12', 'vitamin b12': 'methylcobalamin b12', 'semax and selank': 'semax + selank', 'neuro strip': 'semax + selank', beer: 'alcohol', wine: 'alcohol' }
export const subKey = (name: string) => { const k = name.toLowerCase().replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim(); return ALIAS[k] ?? k }

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
  const seen: string[] = [], keys = new Set<string>()
  for (const r of rows ?? []) { const k = subKey(r.substance); if (!keys.has(k)) { keys.add(k); seen.push(r.substance.replace(/\s*\(.*?\)\s*/g, ' ').trim()) } }
  return [...seen, ...STARTERS.map((s) => s.name).filter((n) => !keys.has(subKey(n)))]
}
/** The display name a row belongs to. */
const nameFor = (r: Sub, names: string[]) => names.find((n) => subKey(n) === subKey(r.substance)) ?? r.substance

/** Log a substance, or (with `edit`) change one you logged: what, how much, when, note. */
export function SubstanceSheet({ open, onClose, initial, edit }: { open: boolean; onClose: () => void; initial?: string; edit?: Sub | null }) {
  const rows = useRows<Sub>('substance_logs')
  const names = useNames(rows)
  const [name, setName] = useState('')
  const [fresh, setFresh] = useState(false)
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState('')
  const [when, setWhen] = useState<'now' | 'earlier' | 'day'>('now')
  const [date, setDate] = useState(today())
  const [time, setTime] = useState('')
  const [note, setNote] = useState('')
  const pick = (n: string) => {
    if (n === '__new') { setFresh(true); setName(''); return }
    setFresh(false); setName(n)
    if (edit) return
    const last = rows?.find((r) => subKey(r.substance) === subKey(n))
    const st = STARTERS.find((s) => s.name === n)
    setAmount(String(last?.amount ?? st?.amount ?? 1)); setUnit(last?.unit ?? st?.unit ?? '')
  }
  useEffect(() => {
    if (!open) return
    if (edit) {
      const d = new Date(edit.occurred_at)
      setFresh(false); setName(nameFor(edit, names)); setAmount(edit.amount != null ? String(edit.amount) : ''); setUnit(edit.unit ?? '')
      setWhen(edit.time_known ? 'earlier' : 'day'); setDate(dayKey(d)); setTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`); setNote(edit.note ?? '')
    } else {
      setFresh(false); setWhen('now'); setDate(today()); setTime(''); setNote('')
      if (initial) pick(initial); else { setName(''); setAmount(''); setUnit('') }
    }
  }, [open, edit?.id])
  async function save() {
    // Reuse the name you've logged before, so "caffeine" and "Caffeine" stay one thing.
    const n = names.find((x) => subKey(x) === subKey(name)) ?? name.trim()
    if (!n) return
    const [y, mo, dd] = date.split('-').map(Number)
    let at = new Date()
    if (when === 'earlier' && time) { const [h, m] = time.split(':').map(Number); at = new Date(y, mo - 1, dd, h, m) }
    if (when === 'day') at = new Date(y, mo - 1, dd, 12, 0)
    haptic()
    const row = { substance: edit && subKey(edit.substance) === subKey(n) ? edit.substance : n, amount: amount ? Number(amount) : null, unit: unit.trim() || null, occurred_at: at.toISOString(), time_known: when !== 'day', note: note.trim() || null }
    try {
      if (edit) { await patchRow('substance_logs', edit.id, row); toast('Updated') }
      else { await addRow('substance_logs', { ...row, source: 'app' }); toast(`${n} logged${when === 'day' ? '' : ` at ${fmtTime(at.toISOString())}`}`) }
      onClose()
    } catch { /* toast shown */ }
  }
  async function del() { if (!edit) return; onClose(); await dropRow('substance_logs', edit.id).catch(() => {}); toast('Entry deleted') }
  const listed = names.includes(name)
  return (
    <Sheet open={open} onClose={onClose} title={edit ? 'Edit entry' : 'Log a substance'}>
      <label class="field"><span>What</span>
        <select class="input" value={fresh || (!listed && name) ? '__new' : name} onChange={(e) => pick((e.target as HTMLSelectElement).value)}>
          <option value="" disabled>Choose…</option>
          {names.map((n) => <option value={n}>{n}</option>)}
          <option value="__new">Something new…</option>
        </select></label>
      {(fresh || (!listed && name)) && <label class="field"><span>Name it</span><input class="input" autoFocus placeholder="Anything non-food" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} /></label>}
      <div class="row">
        <label class="field grow"><span>Amount</span><input class="input" type="number" inputMode="decimal" value={amount} onInput={(e) => setAmount((e.target as HTMLInputElement).value)} /></label>
        <label class="field grow"><span>Unit</span><input class="input" placeholder="mg, cup, drink…" value={unit} onInput={(e) => setUnit((e.target as HTMLInputElement).value)} /></label>
      </div>
      <div class="field"><span>When</span><div class="chips">
        {!edit && <button class={`chip ${when === 'now' ? 'on' : ''}`} onClick={() => setWhen('now')}>Just now</button>}
        <button class={`chip ${when === 'earlier' ? 'on' : ''}`} onClick={() => setWhen('earlier')}>{edit ? 'At a time' : 'Earlier'}</button>
        <button class={`chip ${when === 'day' ? 'on' : ''}`} onClick={() => setWhen('day')}>No set time</button>
      </div></div>
      {when !== 'now' && <div class="row">
        <label class="field grow"><span>Day</span><input class="input" type="date" max={today()} value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value || today())} /></label>
        {when === 'earlier' && <label class="field grow"><span>Time</span><input class="input" type="time" value={time} onInput={(e) => setTime((e.target as HTMLInputElement).value)} /></label>}
      </div>}
      <label class="field"><span>Note (optional)</span><input class="input" value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} /></label>
      <button class="btn primary block" disabled={!name.trim()} onClick={save}>{edit ? 'Save' : 'Log it'}</button>
      {edit && <button class="btn ghost danger block" style="margin-top:8px" onClick={del}><Icon name="trash" size={18} /> Delete entry</button>}
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
  const mine = rows.filter((r) => subKey(r.substance) === subKey(name))
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
  const used = names.filter((n) => rows?.some((r) => subKey(r.substance) === subKey(n)))
  const [sel, setSel] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [newest, setNewest] = useState(true)
  const [editing, setEditing] = useState<Sub | null>(null)
  const choose = (n: string | null) => { setSel(n); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const wk = dayKey(weekStart())
  const countWeek = (n: string) => (rows ?? []).filter((r) => subKey(r.substance) === subKey(n) && dayKey(new Date(r.occurred_at)) >= wk).length
  // Most used this week first; the line above the filters says the week in one go.
  const byWeek = [...used].sort((a, b) => countWeek(b) - countWeek(a) || a.localeCompare(b))
  const wkTotal = (rows ?? []).filter((r) => dayKey(new Date(r.occurred_at)) >= wk).length
  const top = byWeek.filter((n) => countWeek(n) > 0).slice(0, 3).map((n) => `${n} ${countWeek(n)}`)
  const weekLine = wkTotal ? `This week: ${wkTotal} entr${wkTotal === 1 ? 'y' : 'ies'}${top.length ? ` · ${top.join(', ')}` : ''}` : 'Nothing logged this week yet.'
  const list = (rows ?? []).filter((r) => !sel || subKey(r.substance) === subKey(sel)).sort((a, b) => newest ? b.occurred_at.localeCompare(a.occurred_at) : a.occurred_at.localeCompare(b.occurred_at))
  const groups = new Map<string, Sub[]>()
  for (const r of list.slice(0, 200)) { const d = dayKey(new Date(r.occurred_at)); groups.set(d, [...(groups.get(d) ?? []), r]) }
  return (
    <>
      <PageHead title="Substances" sub="Everything non-food, in order" icon="flask" color="var(--orange)" back="#/area/health"
        action={<button class="btn primary sm" onClick={() => setOpen(true)}><Icon name="plus" size={16} />Log</button>} />
      {rows === null ? <div class="skeleton" /> : !rows.length ? (
        <div class="card soft"><p class="muted">Nothing logged yet. Tap Log, or the + button. Coffee, a drink, a supplement or a med all go here.</p></div>
      ) : (
        <>
          <p class="muted small sub-week">{weekLine}</p>
          <div class="chip-scroll">
            <button class={`chip ${!sel ? 'on' : ''}`} onClick={() => choose(null)}>All</button>
            {byWeek.map((n) => <button class={`chip ${sel === n ? 'on' : ''}`} style={`--c:${subColor(n, names)}`} onClick={() => choose(sel === n ? null : n)}>{n}</button>)}
          </div>
          <Card title={sel ? `${sel} log` : 'Log'} icon="list" accent="var(--orange)" action={<button class="faint small" onClick={() => setNewest(!newest)}>{newest ? 'Newest first' : 'Oldest first'}</button>}>
            {[...groups].map(([d, items]) => (
              <div class="sublog">
                <div class="faint small" style="margin:10px 2px 4px">{fmtDay(d)}</div>
                {items.map((r) => (
                  <button class="row subrow" onClick={() => setEditing(r)}>
                    <i class="dot" style={`background:${subColor(nameFor(r, names), names)}`} />
                    <span class="grow" style="min-width:0"><b class="w5">{nameFor(r, names)}</b>{fmtAmt(r) && <span class="muted"> {fmtAmt(r)}</span>}{r.note && <div class="faint small">{r.note}</div>}</span>
                    <span class="faint small">{r.time_known ? fmtTime(r.occurred_at) : 'No time'}</span>
                  </button>
                ))}
              </div>
            ))}
          </Card>
          {sel && <Detail name={sel} rows={rows} color={subColor(sel, names)} />}
        </>
      )}
      <SubstanceSheet open={open} onClose={() => setOpen(false)} initial={sel ?? undefined} />
      <SubstanceSheet open={!!editing} edit={editing} onClose={() => setEditing(null)} />
    </>
  )
}
