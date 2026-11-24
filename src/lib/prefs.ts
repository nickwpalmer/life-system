import { useStore, getState } from './store'
import { saveProfile } from './db'

/** Personal preferences, saved in profiles.settings.prefs so they follow you between phone and Mac. */
export type Prefs = {
  /** When each hero on Home starts, as HH:MM. Morning runs until log starts, log until night, night until morning. */
  windows: { morning: string; log: string; night: string }
  /** The three middle slots of the bottom bar. Home and Everything are always there. */
  tabs: string[]
  theme: 'dark' | 'light' | 'auto'
  logo: LogoKey
  /** Calendar layers shown by default. */
  cal: { personal: boolean; work: boolean; classes: boolean; assignments: boolean; important: boolean }
  sleepDefault: number
  /** What each Google calendar is, by its name. Unlisted calendars are guessed from the name. */
  calRoles: Record<string, CalRole>
  /** Shows a sample record as active, ending soon and expired at the top of Records. Temporary. */
  previewExpiry: boolean
}
export type CalRole = 'personal' | 'work' | 'classes' | 'assignments' | 'important'
export type LogoKey = 'classic' | 'sunset' | 'night' | 'mono' | 'glass'

export const DEFAULT_PREFS: Prefs = {
  windows: { morning: '04:30', log: '09:00', night: '20:00' },
  tabs: ['tasks', 'school', 'calendar'],
  theme: 'dark',
  logo: 'classic',
  cal: { personal: true, work: true, classes: true, assignments: false, important: true },
  sleepDefault: 7,
  calRoles: {},
  previewExpiry: false,
}

const merge = (p: Partial<Prefs> | undefined): Prefs => ({
  ...DEFAULT_PREFS, ...p,
  windows: { ...DEFAULT_PREFS.windows, ...p?.windows },
  cal: { ...DEFAULT_PREFS.cal, ...p?.cal },
  calRoles: { ...p?.calRoles },
  tabs: p?.tabs?.length === 3 ? p.tabs : DEFAULT_PREFS.tabs,
})

export const getPrefs = () => merge(getState().profile?.settings?.prefs as Partial<Prefs> | undefined)
export const usePrefs = () => useStore((s) => merge(s.profile?.settings?.prefs as Partial<Prefs> | undefined))

export async function savePrefs(patch: Partial<Prefs>) {
  const next = { ...getPrefs(), ...patch }
  try { localStorage.setItem('life-theme', next.theme); localStorage.setItem('life-logo', next.logo) } catch { /* private mode */ }
  applyTheme(next.theme); applyLogo(next.logo)
  await saveProfile({ settings: { prefs: next } })
}

const mins = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0) }

/** Which hero Home shows right now. */
export function phaseNow(p: Prefs, d = new Date()): 'morning' | 'log' | 'night' {
  const t = d.getHours() * 60 + d.getMinutes()
  const m = mins(p.windows.morning), l = mins(p.windows.log), n = mins(p.windows.night)
  const inRange = (a: number, b: number) => a <= b ? t >= a && t < b : t >= a || t < b
  if (inRange(m, l)) return 'morning'
  if (inRange(l, n)) return 'log'
  return 'night'
}

export function applyTheme(theme: Prefs['theme']) {
  const light = theme === 'light' || (theme === 'auto' && matchMedia('(prefers-color-scheme: light)').matches)
  document.documentElement.dataset.theme = light ? 'light' : 'dark'
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', light ? '#f7f2ff' : '#140f1f')
}

export const LOGOS: { key: LogoKey; name: string }[] = [
  { key: 'classic', name: 'Classic' }, { key: 'sunset', name: 'Sunset' }, { key: 'night', name: 'Night' },
  { key: 'mono', name: 'Black & white' }, { key: 'glass', name: 'Glass' },
]
export const logoUrl = (k: LogoKey, size: 180 | 512 = 180) => `${import.meta.env.BASE_URL}logos/${k}-${size}.png`

/** iPhone reads the touch icon when you add the app to the Home Screen, so swap it ahead of time. */
export function applyLogo(k: LogoKey) {
  document.querySelectorAll('link[rel=apple-touch-icon]').forEach((l) => l.setAttribute('href', logoUrl(k)))
}

/** Which layer a calendar belongs to: your choice first, then a guess from its name. */
export function calRole(p: Prefs, name: string | null): CalRole {
  const n = name ?? ''
  if (p.calRoles[n]) return p.calRoles[n]
  if (/canvas|assignment|homework/i.test(n)) return 'assignments'
  if (/class|school|course|lecture/i.test(n)) return 'classes'
  if (/work|shift|job/i.test(n)) return 'work'
  if (/claude|important|deadline/i.test(n)) return 'important'
  return 'personal'
}
