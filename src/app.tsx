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
import { Calendar } from './views/Calendar'
import { Settings } from './views/Settings'
import { CheckinView } from './views/Checkin'
import { Goals } from './views/Goals'
import { WeeklyReview } from './views/Review'
import { AreaView } from './views/Area'
import { People } from './views/People'
import { Capture } from './views/Capture'

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

// Everything you can go to. `tab` = shows in the phone tab bar.
const NAV: { r: string; icon: string; label: string; c: string; tab?: boolean; group: 'main' | 'life' | 'system' }[] = [
  { r: 'today', icon: 'home', label: 'Today', c: 'var(--orange)', tab: true, group: 'main' },
  { r: 'tasks', icon: 'tasks', label: 'Tasks', c: 'var(--violet)', tab: true, group: 'main' },
  { r: 'log', icon: 'sliders', label: 'Daily log', c: 'var(--pink)', tab: true, group: 'main' },
  { r: 'calendar', icon: 'cal', label: 'Calendar', c: 'var(--sky)', group: 'main' },
  { r: 'journal', icon: 'book', label: 'Journal', c: 'var(--mint)', tab: true, group: 'main' },
  { r: 'goals', icon: 'target', label: 'Goals', c: 'var(--gold)', group: 'life' },
  { r: 'review', icon: 'review', label: 'Weekly review', c: 'var(--lilac)', group: 'life' },
  { r: 'insights', icon: 'chart', label: 'Insights', c: 'var(--teal)', group: 'life' },
  { r: 'people', icon: 'users', label: 'People', c: 'var(--coral)', group: 'life' },
  { r: 'notes', icon: 'note', label: 'Reference', c: 'var(--peach)', group: 'life' },
  { r: 'settings', icon: 'gear', label: 'Settings', c: 'var(--muted)', group: 'system' },
]

function Sidebar({ base }: { base: string }) {
  const inbox = useStore((s) => s.tasks.filter((t) => t.status === 'inbox').length)
  const areas = useStore((s) => s.areas)
  const a = (n: typeof NAV[number]) => (
    <a class={`s-item ${base === n.r ? 'on' : ''}`} href={`#/${n.r}`} style={`--c:${n.c}`}>
      <span class="s-ico"><Icon name={n.icon} size={19} /></span>{n.label}
      {n.r === 'tasks' && inbox > 0 && <span class="badge">{inbox}</span>}
    </a>
  )
  return (
    <aside class="side" aria-label="Main">
      <a class="brand" href="#/today"><img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" />Life</a>
      <button class="btn primary new" onClick={() => setState({ capture: true })}><Icon name="plus" size={18} /> Capture <span class="tiny" style="opacity:.6">N</span></button>
      {NAV.filter((n) => n.group === 'main').map(a)}
      <div class="s-label">Life</div>
      {NAV.filter((n) => n.group === 'life').map(a)}
      <div class="s-label">Areas</div>
      {areas.filter((x) => !x.archived && ['education', 'mental', 'finances'].includes(x.key)).map((x) => (
        <a class={`s-item ${base === 'area' && location.hash.endsWith(x.key) ? 'on' : ''}`} href={`#/area/${x.key}`} style={`--c:${x.color}`}>
          <span class="s-ico"><i class="dot" style={`background:${x.color};width:10px;height:10px;margin:0 4px`} /></span>{x.name}
        </a>
      ))}
      <div style="height:10px" />
      {NAV.filter((n) => n.group === 'system').map(a)}
      <div class="s-foot">Press N to capture · 1–5 to switch</div>
    </aside>
  )
}

function TabBar({ base }: { base: string }) {
  const inbox = useStore((s) => s.tasks.some((t) => t.status === 'inbox'))
  const tabs = NAV.filter((n) => n.tab)
  const onTab = tabs.some((t) => t.r === base)
  return (
    <nav class="nav" aria-label="Main">
      {tabs.map((n) => (
        <a href={`#/${n.r}`} class={base === n.r ? 'on' : ''} style={`--c:${n.c}`} aria-label={n.label}>
          <Icon name={n.icon} />{n.r === 'tasks' && inbox && <i class="nb" />}
        </a>
      ))}
      <a href="#/more" class={!onTab ? 'on' : ''} style="--c:var(--lilac)" aria-label="More"><Icon name="grid" /></a>
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
      const map: Record<string, string> = { '1': 'today', '2': 'tasks', '3': 'log', '4': 'calendar', '5': 'journal', '6': 'goals', '7': 'review' }
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
    case 'tasks': view = <Tasks />; break
    case 'inbox': view = <Tasks initial="inbox" />; break
    case 'log': view = <DailyLog day={sub || today()} />; break
    case 'journal': view = <Journal />; break
    case 'insights': view = <Insights />; break
    case 'more': view = <More />; break
    case 'notes': view = <Notes />; break
    case 'calendar': view = <Calendar />; break
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
      <Toast />
    </>
  )
}
