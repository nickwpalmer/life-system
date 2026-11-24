import { useState } from 'preact/hooks'
import { useStore, metricByKey, toast } from '../lib/store'
import { addTimedLog, update } from '../lib/db'
import { fmtTime, today, dayKey } from '../lib/dates'
import { haptic } from '../ui/kit'

/**
 * "How are you right now?" in two taps, any time of day. Every tap is its own timed entry, so you can log
 * again ten minutes later. Change your mind within two minutes and it fixes the last one instead.
 *
 * Built on two well-used quick measures: a pleasantness scale like Apple Health's State of Mind (mood),
 * and a single stress item like the one used in workplace and student wellbeing research (stress / anxiety).
 * Both are stored on the 1 to 10 trackers mood and anxiety.
 */
export const MOODS: [number, string, string][] = [[2, 'Rough', '#8fc4ff'], [4, 'Low', '#a98bff'], [6, 'Okay', '#cdb9ff'], [8, 'Good', '#ffc08a'], [10, 'Great', '#ffa463']]
export const STRESS: [number, string, string][] = [[1, 'Calm', '#79e2b4'], [3, 'A little', '#b5e38a'], [5, 'Some', '#ffd66b'], [7, 'High', '#ffa463'], [9, 'Very high', '#ff8a7a']]
const FIX_WINDOW = 2 * 60e3

function useLast(key: string) {
  const m = useStore((s) => s.metrics.find((x) => x.key === key))
  return useStore((s) => m ? s.logs.filter((l) => l.metric_id === m.id && l.source !== 'daily' && l.value_num != null).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0] : undefined)
}
const nameOf = (scale: [number, string, string][], v: number | null | undefined) => v == null ? '' : scale.reduce((best, s) => Math.abs(s[0] - v) < Math.abs(best[0] - v) ? s : best, scale[0])[1]

export function Feel({ compact, onDone }: { compact?: boolean; onDone?: () => void }) {
  const lastMood = useLast('mood')
  const lastStress = useLast('anxiety')
  const [step, setStep] = useState<'mood' | 'stress'>('mood')
  const [picked, setPicked] = useState<{ mood?: number; stress?: number }>({})

  async function log(key: 'mood' | 'anxiety', v: number) {
    const m = metricByKey(key)
    if (!m) { toast(`Turn on the ${key === 'mood' ? 'Mood' : 'Anxiety'} tracker in Settings first`); return false }
    haptic()
    const last = key === 'mood' ? lastMood : lastStress
    try {
      if (last && Date.now() - new Date(last.occurred_at).getTime() < FIX_WINDOW) await update('logs', last.id, { value_num: v })
      else await addTimedLog(m.id, v, null, null, new Date().toISOString())
      return true
    } catch { return false }
  }
  async function pickMood(v: number) {
    setPicked({ ...picked, mood: v })
    if (await log('mood', v)) setStep('stress')
  }
  async function pickStress(v: number) {
    setPicked({ ...picked, stress: v })
    if (await log('anxiety', v)) { toast(`Logged at ${fmtTime(new Date().toISOString())}`); setTimeout(() => { setStep('mood'); setPicked({}); onDone?.() }, 500) }
  }

  const lastAt = [lastMood, lastStress].filter(Boolean).map((l) => l!.occurred_at).sort().pop()
  const lastLine = lastAt && dayKey(new Date(lastAt)) === today()
    ? `Last logged ${fmtTime(lastAt)}${lastMood ? ` · ${nameOf(MOODS, lastMood.value_num)}` : ''}${lastStress ? ` · ${nameOf(STRESS, lastStress.value_num).toLowerCase()} stress` : ''}`
    : 'Not logged yet today'
  const scale = step === 'mood' ? MOODS : STRESS
  const cur = step === 'mood' ? picked.mood : picked.stress
  return (
    <div class={`feel ${compact ? 'compact' : ''}`}>
      <div class="row between" style="margin-bottom:8px">
        <span class="feel-q">{step === 'mood' ? 'How are you right now?' : 'Stress or anxiety?'}</span>
        {step === 'stress'
          ? <button class="faint small" onClick={() => { setStep('mood'); setPicked({}); toast('Mood logged'); onDone?.() }}>Skip</button>
          : <span class="faint tiny">{lastLine}</span>}
      </div>
      <div class="moods" role="group" aria-label={step === 'mood' ? 'Mood' : 'Stress'} key={step}>
        {scale.map(([v, l, c]) => (
          <button class={`mood ${cur === v ? 'on' : ''}`} style={`--c:${c}`} onClick={() => step === 'mood' ? pickMood(v) : pickStress(v)} aria-pressed={cur === v}>
            <i style={`--s:${0.55 + (step === 'mood' ? v : 10 - v) / 25}`} /><span>{l}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
