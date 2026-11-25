import { bootstrap } from './db'
import { reloadAll } from './rows'
import { getState, setState, toast } from './store'
import { supabase } from './supabase'
import { relTime, fmtShort, daysBetween, today } from './dates'

/**
 * Sync with everything the app talks to, one row each, so you can see what worked:
 * your data (Supabase), the app itself (GitHub), Google Calendar, the ring and Monarch.
 */
export type SyncState = 'wait' | 'ok' | 'warn' | 'fail' | 'off'
export type SyncItem = { key: string; label: string; state: SyncState; detail: string }

const LABELS: [string, string][] = [['data', 'Your data'], ['app', 'App version'], ['calendar', 'Google Calendar'], ['ring', 'Ultrahuman ring'], ['monarch', 'Monarch']]

let running: Promise<void> | null = null
let hideTimer: number | undefined

function put(key: string, state: SyncState, detail: string) {
  const items = (getState().sync ?? []).map((i) => (i.key === key ? { ...i, state, detail } : i))
  setState({ sync: items })
}

/** Ask GitHub Pages for a newer version of the app. If there is one, the app reloads itself into it. */
export async function checkAppUpdate(): Promise<'new' | 'latest' | 'none'> {
  if (!('serviceWorker' in navigator)) return 'none'
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return 'none'
  await reg.update().catch(() => {})
  return reg.waiting || reg.installing ? 'new' : 'latest'
}

/** When each outside source last brought something in. */
export async function sourceTimes() {
  if (getState().demo) return { monarch: new Date(Date.now() - 2 * 3600e3).toISOString(), ringDay: today() }
  const [a, r] = await Promise.all([
    supabase.from('fin_accounts').select('as_of').order('as_of', { ascending: false }).limit(1),
    supabase.from('ring_days').select('day').not('vals->sleep_hours', 'is', null).order('day', { ascending: false }).limit(1),
  ])
  return { monarch: (a.data?.[0] as { as_of?: string } | undefined)?.as_of ?? null, ringDay: (r.data?.[0] as { day?: string } | undefined)?.day ?? null }
}

/** Ask the ring-sync function for the newest nights. Returns a short line for people. */
export async function syncRing(): Promise<[SyncState, string]> {
  if (getState().demo) return ['ok', 'Last night is in']
  const { data, error } = await supabase.functions.invoke('ring-sync', { method: 'POST' })
  if (error) return ['fail', 'Couldn’t reach the ring sync']
  if (data?.setup) return ['off', 'Needs reconnecting. See Help.']
  await reloadAll()
  const t = await sourceTimes()
  if (!t.ringDay) return ['warn', 'No nights yet']
  const behind = daysBetween(t.ringDay, today())
  return behind <= 0 ? ['ok', 'Last night is in'] : ['warn', `Newest night is ${fmtShort(t.ringDay)}. Open the Ultrahuman app so the ring uploads.`]
}

/** Pull everything fresh. Quiet runs (on resume, every few minutes) show nothing. */
export function syncAll(quiet = false) {
  if (running) return running
  if (!quiet) { window.clearTimeout(hideTimer); setState({ sync: LABELS.map(([key, label]) => ({ key, label, state: 'wait', detail: 'Checking…' })) }) }
  const demo = getState().demo
  const step = async (key: string, f: () => Promise<[SyncState, string]>) => {
    if (quiet && key !== 'data') return
    try { const [s, d] = await f(); if (!quiet) put(key, s, d) } catch { if (!quiet) put(key, 'fail', 'Couldn’t reach it') }
  }
  running = Promise.all([
    step('data', async () => { if (!demo) await Promise.all([bootstrap(true), reloadAll()]); return ['ok', 'Up to date'] }),
    step('app', async () => {
      if (demo) return ['ok', 'Latest version']
      const u = await checkAppUpdate()
      if (u === 'new') { setTimeout(() => location.reload(), 2500); return ['ok', 'New version found. Reloading…'] }
      return ['ok', 'Latest version']
    }),
    step('ring', syncRing),
    step('monarch', async () => {
      const t = await sourceTimes()
      if (!t.monarch) return ['off', 'No balances yet']
      const fresh = Date.now() - new Date(t.monarch).getTime() < 8 * 864e5
      return [fresh ? 'ok' : 'warn', `Balances from ${relTime(t.monarch)}`]
    }),
  ]).then(() => {
    if (quiet) return
    // Claude copies the calendar in every 2 hours, so this shows when it last landed.
    const s = getState().synced_at
    put('calendar', !s ? 'off' : Date.now() - new Date(s).getTime() < 6 * 3600e3 ? 'ok' : 'warn', s ? `Copied ${relTime(s)}` : 'Not copied yet')
    hideTimer = window.setTimeout(() => setState({ sync: null }), 7000)
  }).catch(() => { if (!quiet) toast('Couldn’t sync. Check your connection.') })
    .finally(() => { running = null })
  return running
}
