import { useEffect, useState } from 'preact/hooks'
import { useStore, toast } from '../lib/store'
import { syncAll, syncRing, sourceTimes, type Times } from '../lib/sync'
import { lastLoadedAt } from '../lib/db'
import { relTime, daysBetween, today, fmtShort } from '../lib/dates'
import { Icon } from '../ui/icons'
import { Card } from '../ui/kit'

/** "Today 11:23 PM" or "Tue 4:05 PM", plus how long ago, so it reads at a glance. */
export function when(iso: string | null) {
  if (!iso) return 'Never'
  const d = new Date(iso)
  const day = d.toDateString() === new Date().toDateString() ? 'Today' : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  return `${day} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · ${relTime(iso)}`
}
const fresh = (iso: string | null | undefined, h: number) => !!iso && Date.now() - new Date(iso).getTime() < h * 3600e3

/**
 * Every outside source with when it last came in and how it gets here. The ring and your own data can be
 * pulled from here. The calendar and Monarch are copied in by Claude, so the app can show when, not force it.
 */
export function SyncStatus() {
  const synced = useStore((s) => s.synced_at)
  const demo = useStore((s) => s.demo)
  const [t, setT] = useState<Times | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = () => sourceTimes().then(setT).catch(() => {})
  useEffect(() => { load() }, [demo])
  const all = async () => { setBusy('all'); await syncAll().catch(() => {}); await load(); setBusy(null) }
  const ring = async () => { setBusy('ring'); const [, line] = await syncRing().catch(() => ['fail', 'Couldn’t reach the ring sync'] as const); toast(line); await load(); setBusy(null) }
  const behind = t?.ringDay ? daysBetween(t.ringDay, today()) : null
  const pulled = lastLoadedAt()
  const row = (name: string, icon: string, state: 'ok' | 'warn' | 'off', last: string | null, how: string, btn?: preact.ComponentChildren) => (
    <div class="srow">
      <span class="m-ico"><Icon name={icon} size={18} /></span>
      <span class="grow" style="min-width:0"><div class="row" style="gap:8px"><b class="w5">{name}</b><i class={`cstat ${state}`} /></div><div class="small">{when(last)}</div><div class="faint tiny">{how}</div></span>
      {btn}
    </div>
  )
  return (
    <Card title="Syncs" icon="history" accent="var(--sky)" action={<button class={`btn sm ${busy === 'all' ? 'busy' : ''}`} disabled={!!busy} onClick={all}><Icon name="history" size={16} />{busy === 'all' ? 'Syncing…' : 'Sync now'}</button>}>
      {row('Your data', 'lock', 'ok', pulled ? new Date(pulled).toISOString() : null, 'Pulled when you open the app, every 5 minutes while it’s open, and on Sync now.')}
      {row('Google Calendar', 'cal', synced ? (fresh(synced, 8) ? 'ok' : 'warn') : 'off', synced, 'Claude copies it in every 6 hours. To get it sooner, ask Claude to copy your calendar.')}
      {row('Canvas', 'school', t?.canvas ? (fresh(t.canvas, 8) ? 'ok' : 'warn') : 'off', t?.canvas ?? null, 'Comes in with the calendar copy. Google refreshes the Canvas feed on its own schedule, often hours apart.')}
      {row('Ultrahuman ring', 'pulse', behind == null ? 'off' : behind <= 1 ? 'ok' : 'warn', t?.ringAt ?? null, `GitHub pulls it at 7:40 AM and 6:40 PM.${t?.ringDay ? ` Newest night: ${fmtShort(t.ringDay)}.` : ''}`,
        <button class="btn ghost sm" disabled={!!busy} onClick={ring}>{busy === 'ring' ? 'Pulling…' : 'Pull'}</button>)}
      {row('Monarch', 'money', t?.monarch ? (fresh(t.monarch, 24 * 8) ? 'ok' : 'warn') : 'off', t?.monarch ?? null, 'Claude copies balances in when it does a money check, or when you ask.')}
      <p class="faint tiny" style="margin-top:8px">A true Sync now for the calendar would need the app to sign in to Google itself. Until then, the copy runs on Claude’s schedule. <a class="link" href="#/help/ring">If the ring stops syncing</a></p>
    </Card>
  )
}
