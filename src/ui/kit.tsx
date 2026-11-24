import { createPortal } from 'preact/compat'
import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { useStore, setState } from '../lib/store'
import { Icon } from './icons'

/** Bottom sheet on phones, centered card on wide screens. Esc closes. */
export function Sheet({ open, onClose, children, title, wide }: { open: boolean; onClose: () => void; children: ComponentChildren; title?: string; wide?: boolean }) {
  const [shown, setShown] = useState(open)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (open) { setShown(true); setLeaving(false) }
    else if (shown) { setLeaving(true); const t = setTimeout(() => { setShown(false); setLeaving(false) }, 200); return () => clearTimeout(t) }
  }, [open])
  useEffect(() => {
    if (!open) return
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    addEventListener('keydown', f); document.body.classList.add('noscroll')
    return () => { removeEventListener('keydown', f); document.body.classList.remove('noscroll') }
  }, [open])
  if (!shown) return null
  // Portal to <body>: an animated ancestor (the page-enter transform) would otherwise trap position:fixed.
  return createPortal(
    <>
      <div class={`scrim ${leaving ? 'out' : ''}`} onClick={onClose} />
      <div class={`sheet ${wide ? 'wide' : ''} ${leaving ? 'out' : ''}`} role="dialog" aria-modal="true">
        <div class="grabber" />
        {title && <div class="sheet-h"><h2>{title}</h2><button class="icon-btn sm" aria-label="Close" onClick={onClose}><Icon name="x" size={18} /></button></div>}
        {children}
      </div>
    </>,
    document.body,
  )
}

export function ScalePicker({ value, onChange, low = 'Low', high = 'High', tone = 'warm' }: { value: number | null; onChange: (v: number) => void; low?: string; high?: string; tone?: 'warm' | 'cool' | 'rev' }) {
  return (
    <div>
      <div class={`scale ${tone}`}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button type="button" class={value === n ? 'on' : value != null && n < value ? 'under' : ''} style={`--i:${n}`} onClick={() => { haptic(); onChange(n) }}>{n}</button>
        ))}
      </div>
      <div class="scale-labels"><span>{low}</span><span>{high}</span></div>
    </div>
  )
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} class={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />
}

export function Stepper({ value, onChange, step = 1, min = 0, label }: { value: number | null; onChange: (v: number | null) => void; step?: number; min?: number; label: string }) {
  const v = value ?? 0
  return (
    <div class="stepper" role="group" aria-label={label}>
      <button type="button" class="step" aria-label={`Less ${label}`} disabled={!value} onClick={() => { haptic(); const n = Math.max(min, v - step); onChange(n === 0 ? null : n) }}><Icon name="minus" size={18} stroke={2.4} /></button>
      <button type="button" class="step plus" aria-label={`More ${label}`} onClick={() => { haptic(); onChange(v + step) }}><Icon name="plus" size={18} stroke={2.4} /></button>
    </div>
  )
}

/** Progress ring, 0..1. */
export function Ring({ value, size = 44, stroke = 5, color = 'url(#ringgrad)', children }: { value: number; size?: number; stroke?: number; color?: string; children?: ComponentChildren }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  return (
    <span class="ring" style={`width:${size}px;height:${size}px`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs><linearGradient id="ringgrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffa463" /><stop offset=".5" stop-color="#ff8cc8" /><stop offset="1" stop-color="#a98bff" /></linearGradient></defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" stroke-width={stroke} />
        <circle class="ring-fg" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} stroke-width={stroke} stroke-linecap="round"
          stroke-dasharray={c} stroke-dashoffset={c * (1 - Math.max(0, Math.min(1, value)))} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      {children && <span class="ring-c">{children}</span>}
    </span>
  )
}

export function Toast() {
  const t = useStore((s) => s.toast)
  if (!t) return null
  return (
    <div class="toast" key={t.id} role="status">
      <span>{t.text}</span>
      {t.undo ? <button onClick={() => { t.undo!(); setState({ toast: null }) }}>Undo</button> : <span style="width:8px" />}
    </div>
  )
}

export function Spinner() { return <div class="row" style="justify-content:center;padding:30px"><div class="spinner" /></div> }

export function haptic() { try { navigator.vibrate?.(8) } catch { /* iOS ignores */ } }

/** Tiny celebratory burst from an element. */
export function burst(el: Element | null, n = 14) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const r = el.getBoundingClientRect()
  const colors = ['#ffa463', '#ff8cc8', '#a98bff', '#ffd66b', '#79e2b4', '#8fc4ff']
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

/** Page header. On phones a back arrow shows when `back` is set; the sidebar handles it on desktop. */
export function PageHead({ title, sub, back, action, icon, color }: { title: ComponentChildren; sub?: ComponentChildren; back?: string; action?: ComponentChildren; icon?: string; color?: string }) {
  return (
    <div class="page-title">
      <div class="row" style="min-width:0">
        {back && <a class="icon-btn back" href={back} aria-label="Back"><Icon name="back" size={20} /></a>}
        {icon && <span class="title-ico" style={color ? `--c:${color}` : ''}><Icon name={icon} size={20} /></span>}
        <div style="min-width:0"><h1>{title}</h1>{sub && <p class="muted small">{sub}</p>}</div>
      </div>
      {action}
    </div>
  )
}

/** Kept for older screens. */
export function BackHeader({ title, href = '#/more', action }: { title: string; href?: string; action?: ComponentChildren }) {
  return <PageHead title={title} back={href} action={action} />
}

export function Card({ title, action, children, class: cls = '', accent, icon }: { title?: ComponentChildren; action?: ComponentChildren; children: ComponentChildren; class?: string; accent?: string; icon?: string }) {
  return (
    <section class={`card ${cls}`} style={accent ? `--accent:${accent}` : ''}>
      {(title || action) && (
        <div class="card-h">
          <h2 class="row" style="gap:8px">{icon && <span class="h-ico"><Icon name={icon} size={15} stroke={2.2} /></span>}{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function AreaDot({ color }: { color: string | null | undefined }) {
  return <i class="dot" style={`background:${color ?? 'var(--faint)'}`} />
}
