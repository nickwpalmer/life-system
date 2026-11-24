import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { useStore, setState } from '../lib/store'
import { Icon } from './icons'

/** Bottom sheet with slide-in/out animation. */
export function Sheet({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: ComponentChildren; title?: string }) {
  const [shown, setShown] = useState(open)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (open) { setShown(true); setLeaving(false) }
    else if (shown) { setLeaving(true); const t = setTimeout(() => { setShown(false); setLeaving(false) }, 230); return () => clearTimeout(t) }
  }, [open])
  if (!shown) return null
  return (
    <>
      <div class={`scrim ${leaving ? 'out' : ''}`} onClick={onClose} />
      <div class={`sheet ${leaving ? 'out' : ''}`} role="dialog" aria-modal="true">
        <div class="grabber" />
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </>
  )
}

export function ScalePicker({ value, onChange, low = 'Low', high = 'High' }: { value: number | null; onChange: (v: number) => void; low?: string; high?: string }) {
  return (
    <div>
      <div class="scale">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button type="button" class={value === n ? 'on' : ''} onClick={() => { haptic(); onChange(n) }}>{n}</button>
        ))}
      </div>
      <div class="scale-labels"><span>{low}</span><span>{high}</span></div>
    </div>
  )
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} class={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />
}

export function Toast() {
  const t = useStore((s) => s.toast)
  if (!t) return null
  return (
    <div class="toast" key={t.id}>
      <span>{t.text}</span>
      {t.undo ? <button onClick={() => { t.undo!(); setState({ toast: null }) }}>Undo</button> : <span style="width:8px" />}
    </div>
  )
}

export function Spinner() { return <div class="row" style="justify-content:center;padding:30px"><div class="spinner" /></div> }

export function haptic() { try { navigator.vibrate?.(8) } catch { /* iOS ignores */ } }

/** Tiny celebratory burst from an element. */
export function burst(el: Element | null, n = 14) {
  if (!el) return
  const r = el.getBoundingClientRect()
  const colors = ['#fdba74', '#c4b5fd', '#f9a8d4', '#fed7aa', '#ddd6fe']
  for (let i = 0; i < n; i++) {
    const d = document.createElement('i')
    d.className = 'confetti'
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.5
    const dist = 40 + Math.random() * 50
    d.style.left = `${r.left + r.width / 2}px`
    d.style.top = `${r.top + r.height / 2}px`
    d.style.background = colors[i % colors.length]
    d.style.setProperty('--dx', `${Math.cos(a) * dist}px`)
    d.style.setProperty('--dy', `${Math.sin(a) * dist - 20}px`)
    document.body.appendChild(d)
    setTimeout(() => d.remove(), 1200)
  }
}

export function ListInputs({ values, onChange, placeholder, count = 3 }: { values: string[]; onChange: (v: string[]) => void; placeholder: string; count?: number }) {
  const vals = Array.from({ length: count }, (_, i) => values[i] ?? '')
  return (
    <div class="list-inputs">
      {vals.map((v, i) => (
        <input class="input" value={v} placeholder={`${placeholder} ${i + 1}`}
          onInput={(e) => { const next = [...vals]; next[i] = (e.target as HTMLInputElement).value; onChange(next) }} />
      ))}
    </div>
  )
}

export function BackHeader({ title, href = '#/more', action }: { title: string; href?: string; action?: ComponentChildren }) {
  return (
    <div class="page-title">
      <div class="row">
        <a class="icon-btn" href={href} aria-label="Back"><Icon name="back" size={20} /></a>
        <h1>{title}</h1>
      </div>
      {action}
    </div>
  )
}
