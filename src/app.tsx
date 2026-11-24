import { useEffect, useState } from 'preact/hooks'
import { supabase } from './lib/supabase'
import { getState, setState, useStore } from './lib/store'
import { loadBase } from './lib/db'
import { installIdleLock } from './lib/lock'
import { Icon } from './ui/icons'
import { Toast, Spinner } from './ui/kit'
import { AuthScreen } from './views/Auth'
import { Today } from './views/Today'
import { Tasks } from './views/Tasks'
import { Journal } from './views/Journal'
import { Insights } from './views/Insights'
import { More } from './views/More'
import { Notes } from './views/Notes'
import { Calendar } from './views/Calendar'
import { Settings } from './views/Settings'
import { CheckinView } from './views/Checkin'

function useRoute() {
  const get = () => (location.hash.replace(/^#\/?/, '') || 'today').split('?')[0]
  const [route, setRoute] = useState(get())
  useEffect(() => {
    const f = () => { setRoute(get()); window.scrollTo({ top: 0 }) }
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])
  return route
}

export function App() {
  const session = useStore((s) => s.session)
  const ready = useStore((s) => s.ready)
  const route = useRoute()

  useEffect(() => {
    installIdleLock()
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, ready: true }))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      const prev = getState().session?.user.id
      setState({ session: s })
      if (s && s.user.id !== prev) loadBase().catch(() => {})
      if (!s) setState({ areas: [], metrics: [] })
    })
    // Clean any auth tokens out of the address bar after an email link lands here.
    if (/access_token|error_description/.test(location.hash)) setTimeout(() => history.replaceState(null, '', location.pathname + '#/today'), 50)
    return () => data.subscription.unsubscribe()
  }, [])

  if (!ready) return <div class="center"><div class="glow" /><Spinner /></div>
  if (!session) return <><div class="glow" /><AuthScreen /><Toast /></>

  const [base, sub] = route.split('/')
  const tab = ['today', 'tasks', 'journal', 'insights'].includes(base) ? base : 'more'
  let view
  switch (base) {
    case 'tasks': view = <Tasks />; break
    case 'journal': view = <Journal />; break
    case 'insights': view = <Insights />; break
    case 'more': view = <More />; break
    case 'notes': view = <Notes />; break
    case 'calendar': view = <Calendar />; break
    case 'settings': view = <Settings />; break
    case 'checkin': view = <CheckinView kind={sub === 'night' ? 'night' : 'morning'} />; break
    default: view = <Today />
  }

  return (
    <>
      <div class="glow" />
      <main class="app"><div class="view" key={route}>{view}</div></main>
      <nav class="nav" aria-label="Main">
        {[
          ['today', 'home', 'Today'], ['tasks', 'tasks', 'Tasks'], ['journal', 'book', 'Journal'],
          ['insights', 'chart', 'Insights'], ['more', 'grid', 'More'],
        ].map(([r, ic, label]) => (
          <a href={`#/${r}`} class={tab === r ? 'on' : ''} aria-label={label}><Icon name={ic} /></a>
        ))}
      </nav>
      <Toast />
    </>
  )
}
