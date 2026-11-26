// Little taps under your finger.
// Android and other browsers: navigator.vibrate.
// iPhone (iOS 18 and later): Safari has no vibrate, but toggling a hidden
// <input type="checkbox" switch> plays the system's switch tick. That only works
// inside a real tap, which is why haptic() is called from click handlers.

let label: HTMLLabelElement | null = null
let last = 0
let on = true
try { on = localStorage.getItem('life-haptics') !== 'off' } catch { /* private mode */ }

export const hapticsOn = () => on
export function setHaptics(v: boolean) { on = v; try { localStorage.setItem('life-haptics', v ? 'on' : 'off') } catch { /* private mode */ } }

function ensure() {
  if (label) return label
  label = document.createElement('label')
  label.setAttribute('aria-hidden', 'true')
  label.style.cssText = 'position:fixed;left:-200px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('switch', '')
  input.tabIndex = -1
  label.appendChild(input)
  document.body.appendChild(label)
  return label
}

export function haptic(kind: 'tap' | 'success' | 'warn' = 'tap') {
  if (!on) return
  const now = Date.now()
  if (now - last < 60) return
  last = now
  try {
    if (typeof navigator.vibrate === 'function') { navigator.vibrate(kind === 'success' ? [8, 50, 12] : kind === 'warn' ? [14, 40, 14] : 8); return }
    ensure().click()
  } catch { /* no haptics here */ }
}

/** One listener for the whole app: buttons, links, chips and switches tick when tapped. */
export function installHaptics() {
  const TAPPABLE = 'button, a[href], .chip, [role="button"], [role="switch"], .note, .tog, label.check, input[type="checkbox"], select'
  document.addEventListener('click', (e) => {
    const t = e.target as Element | null
    if (!t || (label && label.contains(t)) || t.closest('.lockscreen')) return // nothing extra while Face ID runs
    const el = t.closest(TAPPABLE)
    if (!el || (el as HTMLButtonElement).disabled) return
    haptic()
  }, true)
}
