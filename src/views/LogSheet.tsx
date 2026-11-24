import { useEffect, useState } from 'preact/hooks'
import { Sheet, ScalePicker, haptic } from '../ui/kit'
import { useStore, toast } from '../lib/store'
import { addLog, deleteLog } from '../lib/db'
import { presets, ROLE_LABEL } from '../lib/metrics'
import type { Metric } from '../lib/types'
import { pad } from '../lib/dates'

/** Log any metric. Opens straight to a metric, or with a picker when none is given. */
export function LogSheet({ open, metric, onClose }: { open: boolean; metric?: Metric | null; onClose: () => void }) {
  const metrics = useStore((s) => s.metrics.filter((m) => m.active))
  const [m, setM] = useState<Metric | null>(metric ?? null)
  const [num, setNum] = useState<string>('')
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [time, setTime] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setM(metric ?? null); setNum(''); setText(''); setNote('')
      const d = new Date(); setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`)
    }
  }, [open, metric])

  async function save(valueOverride?: number) {
    if (!m) return
    const v = valueOverride ?? (num === '' ? null : Number(num))
    if (m.kind !== 'text' && (v == null || Number.isNaN(v))) return
    if (m.kind === 'text' && !text.trim()) return
    setBusy(true)
    try {
      const [h, mi] = time.split(':').map(Number)
      const at = new Date(); at.setHours(h, mi, 0, 0)
      const row = await addLog(m.id, m.kind === 'text' ? null : v, m.kind === 'text' ? text.trim() : null, note.trim() || null, at.toISOString())
      haptic()
      toast(`Logged ${m.name.toLowerCase()}`, () => deleteLog(row.id))
      onClose()
    } catch (e) { toast((e as Error).message) }
    setBusy(false)
  }

  const groups = ['habit', 'vice', 'health', 'track'] as const

  return (
    <Sheet open={open} onClose={onClose} title={m ? m.name : 'Log something'}>
      {!m ? (
        <div class="stack">
          {groups.map((g) => {
            const list = metrics.filter((x) => x.role === g)
            if (!list.length) return null
            return (
              <div>
                <div class="faint small" style="margin:4px 4px 8px">{ROLE_LABEL[g]}</div>
                <div class="chips">{list.map((x) => <button class="chip" onClick={() => setM(x)}>{x.name}</button>)}</div>
              </div>
            )
          })}
        </div>
      ) : (
        <div class="stack">
          {m.kind === 'scale' && <ScalePicker value={num ? Number(num) : null} onChange={(v) => save(v)} low={m.higher_is_better === false ? 'Calm' : 'Low'} high={m.higher_is_better === false ? 'Intense' : 'Great'} />}
          {m.kind === 'boolean' && <button class="btn primary block" disabled={busy} onClick={() => save(1)}>Mark done</button>}
          {m.kind === 'text' && <textarea class="input" placeholder="What happened?" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />}
          {(m.kind === 'count' || m.kind === 'duration' || m.kind === 'number') && (
            <>
              {presets(m).length > 0 && (
                <div class="presets">
                  {presets(m).map((p) => <button onClick={() => save(p)} disabled={busy}>{m.unit === '$' ? `$${p}` : p}{m.unit && m.unit !== '$' ? <span class="faint small"> {m.unit}</span> : null}</button>)}
                </div>
              )}
              <div class="row">
                <input class="input grow" type="number" inputMode="decimal" step="any" placeholder={`Other amount${m.unit && m.unit !== '$' ? ` (${m.unit})` : ''}`} value={num} onInput={(e) => setNum((e.target as HTMLInputElement).value)} />
                <button class="btn primary" disabled={busy || num === ''} onClick={() => save()}>Log</button>
              </div>
            </>
          )}
          <div class="row">
            <input class="input grow" placeholder="Note (optional)" value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} />
            <input class="input" style="width:118px" type="time" value={time} onInput={(e) => setTime((e.target as HTMLInputElement).value)} aria-label="Time" />
          </div>
          {m.kind === 'text' && <button class="btn primary block" disabled={busy} onClick={() => save()}>Save</button>}
          {!metric && <button class="btn ghost block" onClick={() => setM(null)}>Pick something else</button>}
        </div>
      )}
    </Sheet>
  )
}
