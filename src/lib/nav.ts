// Getting back out of pages: an in-app back stack, an edge swipe, and tab taps that return to the top.

const path = () => location.hash.replace(/^#\/?/, '') || 'today'
const stack: string[] = [path()]
let tabs = ['today', 'more']

export const setTabs = (t: string[]) => { tabs = ['today', ...t, 'more'] }
export const isTabRoot = (p = path()) => tabs.includes(p)

/** Called on every route change. */
export function track(p: string) {
  if (stack[stack.length - 2] === p) stack.pop()
  else if (stack[stack.length - 1] !== p) { stack.push(p); if (stack.length > 60) stack.shift() }
}

/** Where "up" goes when there's no history: a page's own parent, its base, or Everything. */
export function parentOf(p = path(), fallback?: string) {
  if (fallback) return fallback
  if (p === 'inbox') return '#/tasks'
  const [base, sub] = p.split('/')
  if (sub) return `#/${base}`
  return isTabRoot(p) ? '#/today' : '#/more'
}

/** Switch views inside one page (a segmented control) without adding a step to Back. */
export function replaceRoute(href: string) {
  stack[stack.length - 1] = href.replace(/^#\/?/, '')
  location.replace(href)
}

export function goBack(fallback?: string) {
  if (stack.length > 1) history.back()
  else location.hash = parentOf(path(), fallback)
}

/** Tapping the tab you're already on brings you to its top level. */
const resetFns = new Set<() => void>()
export const onTabReset = (f: () => void) => { resetFns.add(f); return () => { resetFns.delete(f) } }
export function tabTap(r: string, e: Event) {
  const p = path()
  const base = p.split('/')[0]
  const inSection = base === r || (r === 'more' && !isTabRoot(base))
  if (!inSection) return
  e.preventDefault()
  if (p !== r) { location.hash = `#/${r}` } else { resetFns.forEach((f) => f()) }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

/** Swipe in from the left edge to go back (in the installed app, where iOS has no back gesture). */
export function installEdgeSwipe() {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone || matchMedia('(display-mode: standalone)').matches
  if (!standalone) return
  let x0 = -1, y0 = 0, t0 = 0
  addEventListener('touchstart', (e) => {
    const t = e.touches[0]
    x0 = t.clientX < 24 && e.touches.length === 1 && !document.querySelector('.sheet') ? t.clientX : -1
    y0 = t.clientY; t0 = Date.now()
  }, { passive: true })
  addEventListener('touchend', (e) => {
    if (x0 < 0) return
    const t = e.changedTouches[0]
    const dx = t.clientX - x0, dy = Math.abs(t.clientY - y0)
    x0 = -1
    if (dx > 70 && dy < 60 && Date.now() - t0 < 700 && path() !== 'today') goBack()
  }, { passive: true })
}
