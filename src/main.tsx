import { render } from 'preact'
import { installUpdates } from './lib/update'
import { App } from './app'
import './styles.css'
import { applyTheme, applyLogo, type LogoKey } from './lib/prefs'

// Theme and icon before the first paint, so there's no flash of the wrong one.
try {
  const t = localStorage.getItem('life-theme') as 'dark' | 'light' | 'auto' | null
  if (t) applyTheme(t)
  const l = localStorage.getItem('life-logo') as LogoKey | null
  if (l) applyLogo(l)
} catch { /* private mode */ }

installUpdates()
render(<App />, document.getElementById('app')!)
