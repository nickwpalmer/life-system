import { useEffect, useState } from 'preact/hooks'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { getState, setState, useStore } from './lib/store'
import { bootstrap, clearData, installRefresh } from './lib/db'
import { installIdleLock } from './lib/lock'
import { today } from './lib/dates'
import { Icon } from './ui/icons'
import { Toast, Spinner } from './ui/kit'
import { AuthScreen } from './views/Auth'
import { Today } from './views/Today'
import { Tasks } from './views/Tasks'
import { DailyLog } from './views/DailyLog'
import { Journal } from './views/Journal'
import { Insights } from './views/Insights'
import { More } from './views/More'
import { Notes } from './views/Notes'
import { Records } from './views/Records'
import { AssetPage } from './views/Assets'
import { Calendar } from './views/Calendar'
import { Settings } from './views/Settings'
import { CheckinView } from './views/Checkin'
import { Goals } from './views/Goals'
import { WeeklyReview } from './views/Review'
import { AreaView } from './views/Area'
import { People, GlobalPersonSheet } from './views/People'
import { Capture } from './views/Capture'
import { Substances, GlobalSubstanceSheet } from './views/Substances'
import { Education } from './views/Education'
import { Changes } from './views/Changes'
import { Help } from './views/Help'
import { usePrefs, logoUrl, applyTheme, applyLogo } from './lib/prefs'
import { syncAll } from './lib/sync'

/** Pull down at the top of any screen to sync with the database. */
function PullToSync() {
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let y0: number | null = null, d = 0
    const start = (e: TouchEvent) => { y0 = window.scrollY <= 0 && !document.querySelector('.sheet') ? e.touches[0].clientY : null; d = 0 }
    const move = (e: TouchEvent) => { if (y0 === null) return; d = Math.max(0, e.touches[0].clientY - y0); setPull(Math.min(d, 110)) }
    const end = () => {
      if (y0 !== null && d > 80) { setBusy(true); syncAll().finally(() => setBusy(false)) }
      y0 = null; d = 0; setPull(0)
    }
    addEventListener('touchstart', start, { passive: true }); addEventListener('touchmove', move, { passive: true }); addEventListener('touchend', end)
    return () => { removeEventListener('touchstart', start); removeEventListener('touchmove', move); removeEventListener('touchend', end) }
  }, [])
  if (!pull && !busy) return null
  return <div class={`ptr ${busy || pull > 80 ? 'ready' : ''}`} style={`transform:translate(-50%, ${busy ? 18 : pull * 0.4}px)`}><Icon name="history" size={18} />{busy ? 'Syncing…' : pull > 80 ? 'Release to sync' : 'Pull to sync'}</div>
}

function useRoute() {
  const get = () => location.hash.replace(/^#\/?/, '') || 'today'
  const [route, setRoute] = useState(get())
  useEffect(() => {
    const f = () => { setRoute(get()); window.scrollTo({ top: 0 }) }
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])
  return route
}

const isDemo = /[?&]demo\b/.test(location.search)

// Everything you can go to. The bottom bar shows Home, three of these (you pick in Settings), and Everything.
export type NavItem = { r: string; icon: string; label: string; c: string; group: 'main' | 'life' | 'plan' | 'ref' | 'system'; sub?: string }
export const NAV: NavItem[] = [
  { r: 'today', icon: 'home', label: 'Home', c: 'var(--orange)', group: 'main' },
  { r: 'tasks', icon: 'tasks', label: 'Tasks', c: 'var(--violet)', group: 'main', sub: 'Capture, sort, do' },
  { r: 'calendar', icon: 'cal', label: 'Calendar', c: 'var(--sky)', group: 'main', sub: 'Month, week, free time' },
  { r: 'log', icon: 'sliders', label: 'Daily log', c: 'var(--pink)', group: 'main', sub: 'Today’s numbers' },
  { r: 'journal', icon: 'book', label: 'Journal', c: 'var(--mint)', group: 'main', sub: 'Write it down' },
  { r: 'school', icon: 'school', label: 'Education', c: 'var(--lilac)', group: 'life', sub: 'Classes, degree, history' },
  { r: 'money', icon: 'money', label: 'Finances', c: 'var(--gold)', group: 'life', sub: 'Accounts, bills, spending' },
  { r: 'health', icon: 'heart', label: 'Health', c: 'var(--mint)', group: 'life', sub: 'Sleep, body, mind' },
  { r: 'substances', icon: 'flask', label: 'Substances', c: 'var(--orange)', group: 'life', sub: 'Everything non-food' },
  { r: 'goals', icon: 'target', label: 'Goals', c: 'var(--gold)', group: 'plan', sub: 'What you’re building' },
  { r: 'review', icon: 'review', label: 'Weekly review', c: 'var(--lilac)', group: 'plan', sub: 'Last week, next week' },
  { r: 'insights', icon: 'chart', label: 'Insights', c: 'var(--teal)', group: 'plan', sub: 'Patterns and reviews' },
  { r: 'people', icon: 'users', label: 'People', c: 'var(--coral)', group: 'ref', sub: 'Birthdays, keeping in touch' },
  { r: 'records', icon: 'layers', label: 'Records', c: 'var(--peach)', group: 'ref', sub: 'Car, apartment, insurance, taxes' },
  { r: 'changes', icon: 'history', label: 'Claude’s changes', c: 'var(--violet)', group: 'system', sub: 'See, undo, leave Claude a note' },
  { r: 'settings', icon: 'gear', label: 'Settings', c: 'var(--muted)', group: 'system', sub: 'Preferences and connections' },
  { r: 'help', icon: 'help', label: 'Help', c: 'var(--sky)', group: 'system', sub: 'How things work' },
]
export const navItem = (r: string) => NAV.find((n) => n.r === r)

function Sidebar({ base }: { base: string }) {
  const inbox = useStore((s) => s.tasks.filter((t) => t.status === 'inbox').length)
  const a = (n: NavItem) => (
    <a class={`s-item ${base === n.r ? 'on' : ''}`} href={`#/${n.r}`} style={`--c:${n.c}`}>
      <span class="s-ico"><Icon name={n.icon} size={19} /></span>{n.label}
      {n.r === 'tasks' && inbox > 0 && <span class="badge">{inbox}</span>}
    </a>
  )
  return (
    <aside class="side" aria-label="Main">
      <a class="brand" href="#/today"><img src={logoUrl(usePrefs().logo)} alt="" />Life</a>
      <button class="btn primary new" onClick={() => setState({ capture: true })}><Icon name="plus" size={18} /> Capture <span class="tiny" style="opacity:.6">N</span></button>
      {NAV.filter((n) => n.group === 'main').map(a)}
      <div class="s-label">Areas</div>
      {NAV.filter((n) => n.group === 'life').map(a)}
      <div class="s-label">Plan and look back</div>
      {NAV.filter((n) => n.group === 'plan').map(a)}
      <div class="s-label">Reference</div>
      {NAV.filter((n) => n.group === 'ref').map(a)}
      <div style="height:10px" />
      {NAV.filter((n) => n.group === 'system').map(a)}
      <div class="s-foot">Press N to capture · 1–7 to switch</div>
    </aside>
  )
}

function TabBar({ base }: { base: string }) {
  const inbox = useStore((s) => s.tasks.some((t) => t.status === 'inbox'))
  const prefs = usePrefs()
  const tabs = [navItem('today')!, ...prefs.tabs.map(navItem).filter((n): n is NavItem => !!n)]
  const onTab = tabs.some((t) => t.r === base)
  return (
    <nav class="nav" aria-label="Main">
      {tabs.map((n) => (
        <a href={`#/${n.r}`} class={base === n.r ? 'on' : ''} style={`--c:${n.c}`} aria-label={n.label}>
          <Icon name={n.icon} />{n.r === 'tasks' && inbox && <i class="nb" />}
        </a>
      ))}
      <a href="#/more" class={!onTab ? 'on' : ''} style="--c:var(--lilac)" aria-label="Everything"><Icon name="grid" /></a>
    </nav>
  )
}

function useShortcuts() {
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable) return
      if (document.querySelector('.sheet')) return
      if (e.key === 'n' || e.key === 'c') { e.preventDefault(); setState({ capture: true }) }
      const map: Record<string, string> = { '1': 'today', '2': 'tasks', '3': 'calendar', '4': 'school', '5': 'log', '6': 'journal', '7': 'money' }
      if (map[e.key]) location.hash = `#/${map[e.key]}`
    }
    addEventListener('keydown', f)
    return () => removeEventListener('keydown', f)
  }, [])
}

export function App() {
  const session = useStore((s) => s.session)
  const ready = useStore((s) => s.ready)
  const loaded = useStore((s) => s.loaded)
  const route = useRoute()
  useShortcuts()
  const { theme, logo } = usePrefs()
  // Prefs live on your profile, so a change on the phone shows up on the Mac too.
  useEffect(() => {
    if (!loaded) return
    applyTheme(theme); applyLogo(logo)
    try { localStorage.setItem('life-theme', theme); localStorage.setItem('life-logo', logo) } catch { /* private mode */ }
  }, [theme, logo, loaded])

  useEffect(() => {
    if (isDemo) {
      import('./lib/demo').then(({ demoData }) => {
        setState({ ...demoData(), demo: true, loaded: true, ready: true, session: { user: { id: 'demo', email: 'demo@example.com' } } as unknown as Session })
      })
      return
    }
    installIdleLock()
    installRefresh()
    supabase.auth.getSession().then(({ data }) => {
      setState({ session: data.session, ready: true })
      if (data.session) bootstrap(true).catch(() => setState({ loaded: true }))
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      const prev = getState().session?.user.id
      setState({ session: s })
      if (s && s.user.id !== prev) bootstrap(true).catch(() => setState({ loaded: true }))
      if (!s) clearData()
    })
    // Clean any auth tokens out of the address bar after an email link lands here.
    if (/access_token|error_description/.test(location.hash)) setTimeout(() => history.replaceState(null, '', location.pathname + '#/today'), 50)
    return () => data.subscription.unsubscribe()
  }, [])

  if (!ready) return <div class="center"><div class="glow"><i /></div><Spinner /></div>
  if (!session) return <><div class="glow"><i /></div><AuthScreen /><Toast /></>

  const [path] = route.split('?')
  const [base, sub] = path.split('/')
  let view
  if (!loaded) view = <><div class="skeleton" style="width:40%;height:30px" /><div class="skeleton" /><div class="skeleton" style="width:70%" /></>
  else switch (base) {
    case 'tasks': view = <Tasks areaKey={sub} />; break
    case 'school': view = <Education tab={sub} />; break
    case 'money': view = <AreaView areaKey="finances" />; break
    case 'health': view = <AreaView areaKey="health" />; break
    case 'substances': view = <Substances />; break
    case 'changes': view = <Changes />; break
    case 'help': view = <Help section={sub} />; break
    case 'inbox': view = <Tasks initial="inbox" />; break
    case 'log': view = <DailyLog day={sub || today()} />; break
    case 'journal': view = <Journal />; break
    case 'insights': view = <Insights />; break
    case 'more': view = <More />; break
    case 'notes': view = <Notes />; break
    case 'records': view = sub ? <AssetPage key={sub} ref_={sub} /> : <Records />; break
    case 'calendar': view = <Calendar mode={sub} />; break
    case 'settings': view = <Settings />; break
    case 'goals': view = <Goals />; break
    case 'review': view = <WeeklyReview />; break
    case 'people': view = <People />; break
    case 'area': view = <AreaView areaKey={sub} />; break
    case 'checkin': view = <CheckinView kind={sub === 'night' ? 'night' : 'morning'} />; break
    default: view = <Today />
  }

  return (
    <>
      <div class="glow"><i /></div>
      {isDemo && <span class="demo-banner">Demo data</span>}
      <div class="shell">
        <Sidebar base={base} />
        <main class="app"><div class="view" key={path}>{view}</div></main>
      </div>
      {base !== 'checkin' && <button class="fab" aria-label="Capture" onClick={() => setState({ capture: true })}><Icon name="plus" size={26} stroke={2.4} /></button>}
      <TabBar base={base} />
      <Capture />
      <GlobalSubstanceSheet />
      <GlobalPersonSheet />
      <PullToSync />
      <Toast />
    </>
  )
}
