import { useEffect, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { Icon } from './icons'
import { burst } from './kit'

/**
 * A guided, one-question-at-a-time flow (check-ins, weekly review).
 * Taps on a scale move on by themselves; text steps have Next. You can step back, skip, or leave at any point.
 */
export type Step = {
  key: string
  q: ComponentChildren
  hint?: ComponentChildren
  /** The answer area. Call next() to move on (scales do it after a tap). */
  body: (next: () => void) => ComponentChildren
  /** Hide the Next button (the body moves on by itself), e.g. a scale. */
  auto?: boolean
}

export function Flow({ title, color, steps, onExit, onFinish, finishLabel = 'Done', start = 0, aside }: {
  title: string; color: string; steps: Step[]; onExit: () => void; onFinish: (btn: Element | null) => void | Promise<void>; finishLabel?: string; start?: number; aside?: ComponentChildren
}) {
  const [i, setI] = useState(start)
  const [dir, setDir] = useState<1 | -1>(1)
  const last = i === steps.length - 1
  const go = (n: number) => { setDir(n > i ? 1 : -1); setI(Math.max(0, Math.min(steps.length - 1, n))) }
  const next = () => (last ? undefined : setTimeout(() => go(i + 1), 220))
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onExit() }
    addEventListener('keydown', f); return () => removeEventListener('keydown', f)
  }, [])
  const s = steps[i]
  return (
    <div class="flow" style={`--c:${color}`}>
      <div class="flow-top">
        <span class="flow-title grow">{title}</span>
        {aside}
        <button class="icon-btn" aria-label="Stop for now" onClick={onExit}><Icon name="x" size={20} /></button>
      </div>
      <div class="flow-bar">{steps.map((_, n) => <i class={n < i ? 'done' : n === i ? 'on' : ''} onClick={() => go(n)} />)}</div>
      <div class={`flow-step ${dir > 0 ? 'fwd' : 'back'}`} key={s.key}>
        <h2 class="flow-q">{s.q}</h2>
        {s.hint && <p class="muted small flow-hint">{s.hint}</p>}
        <div class="flow-body">{s.body(next)}</div>
      </div>
      <div class="flow-nav">
        {i > 0 ? <button class="btn ghost" onClick={() => go(i - 1)}><Icon name="back" size={18} />Back</button> : <span />}
        {last
          ? <button class="btn primary grow" onClick={(e) => onFinish(e.currentTarget as Element)}>{finishLabel}</button>
          : <button class={`btn ${s.auto ? 'ghost' : 'primary'} grow`} onClick={() => go(i + 1)}>{s.auto ? 'Skip' : 'Next'}</button>}
      </div>
    </div>
  )
}

export { burst }
