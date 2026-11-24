import { useEffect, useState } from 'preact/hooks'
import { supabase, lockEnabled, setLockFlag } from '../lib/supabase'
import { useStore, toast, getState } from '../lib/store'
import { saveMetric, saveArea, saveProfile, clearData } from '../lib/db'
import { passkeySupported } from '../lib/lock'
import { ROLE_LABEL } from '../lib/metrics'
import type { Area, Metric, MetricKind, MetricRole } from '../lib/types'
import { Icon } from '../ui/icons'
import { Sheet, Switch, PageHead } from '../ui/kit'
import { syncAll } from '../lib/sync'
import { usePrefs, savePrefs, LOGOS, logoUrl } from '../lib/prefs'
import { relTime } from '../lib/dates'
import { NAV } from '../app'

type Passkey = { id: string; friendly_name?: string; created_at: string; last_used_at?: string }

function Security() {
  const [keys, setKeys] = useState<Passkey[] | null>(null)
  const [lock, setLock] = useState(lockEnabled())
  const [msg, setMsg] = useState('')
  const load = () => supabase.auth.passkey.list().then(({ data, error }) => {
    if (error) { setKeys([]); if (/disabled/i.test(error.message)) setMsg('Face ID sign-in needs one switch flipped on the server first. Claude has the steps.') }
    else setKeys((data as unknown as Passkey[]) ?? [])
  })
  useEffect(() => { load() }, [])

  async function add() {
    setMsg('')
    const { error } = await supabase.auth.registerPasskey()
    if (error) { setMsg(/disabled/i.test(error.message) ? 'Face ID sign-in isn’t switched on for this app yet.' : /exists/i.test(error.message) ? 'This device already has one.' : error.message); return }
    toast('Face ID added'); load()
  }
  function toggleLock(on: boolean) {
    if (on && !keys?.length) { setMsg('Add Face ID first, so you can get back in.'); return }
    setLockFlag(on); setLock(on)
    toast(on ? 'Face ID lock on' : 'Face ID lock off')
  }
  async function remove(id: string) {
    if (!confirm('Remove this passkey?')) return
    await supabase.auth.passkey.delete({ passkeyId: id }); load()
  }

  return (
    <section class="card">
      <div class="card-h"><h2>Face ID & security</h2></div>
      {!passkeySupported() && <p class="muted small">This browser can’t use passkeys.</p>}
      {keys?.map((k) => (
        <div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)">
          <span><Icon name="face" size={18} /> {k.friendly_name || 'Passkey'} <span class="faint small">· added {new Date(k.created_at).toLocaleDateString()}</span></span>
          <button class="faint" onClick={() => remove(k.id)} aria-label="Remove"><Icon name="x" size={16} /></button>
        </div>
      ))}
      <button class="btn block" style="margin-top:12px" onClick={add}><Icon name="face" size={20} /> Add Face ID on this device</button>
      <div class="row between" style="margin-top:16px">
        <span><div>Require Face ID to open</div><div class="faint small">Nothing that unlocks your data is saved on the device. Locks after 2 min away.</div></span>
        <Switch label="Require Face ID" on={lock} onChange={toggleLock} />
      </div>
      {msg && <p class="err" style="margin-top:10px">{msg}</p>}
    </section>
  )
}

function MetricEditor({ open, metric, onClose }: { open: boolean; metric: Metric | null; onClose: () => void }) {
  const areas = useStore((s) => s.areas)
  const [f, setF] = useState<Partial<Metric>>({})
  useEffect(() => { if (open) setF(metric ? { ...metric } : { name: '', kind: 'count', role: 'habit', active: true, show_today: true, higher_is_better: true }) }, [open])
  const kinds: [MetricKind, string][] = [['count', 'Count'], ['boolean', 'Yes / no'], ['duration', 'Time'], ['scale', '1 to 10'], ['number', 'Number'], ['text', 'Text']]
  async function save() {
    if (!f.name?.trim()) return
    const { id, name, kind, unit, role, target, target_period, higher_is_better, area_id, active, show_today } = f
    try { await saveMetric({ id, name: name.trim(), kind, unit: unit || null, role, target: target ?? null, target_period: target ? (target_period ?? 'day') : null, higher_is_better, area_id: area_id ?? null, active, show_today }); onClose() }
    catch (e) { toast((e as Error).message) }
  }
  return (
    <Sheet open={open} onClose={onClose} title={metric ? 'Edit tracker' : 'New tracker'}>
      <label class="field"><span>Name</span><input class="input" value={f.name ?? ''} onInput={(e) => setF({ ...f, name: (e.target as HTMLInputElement).value })} /></label>
      <div class="field"><span>Type</span><div class="chips">{kinds.map(([k, l]) => <button class={`chip ${f.kind === k ? 'on' : ''}`} onClick={() => setF({ ...f, kind: k })}>{l}</button>)}</div></div>
      <div class="field"><span>Kind</span><div class="chips">{(['habit', 'health', 'track'] as MetricRole[]).map((r) => <button class={`chip ${f.role === r ? 'on' : ''}`} onClick={() => setF({ ...f, role: r, higher_is_better: true })}>{ROLE_LABEL[r]}</button>)}</div></div>
      <div class="row">
        <label class="field grow"><span>Unit</span><input class="input" placeholder="min, h, $, glass…" value={f.unit ?? ''} onInput={(e) => setF({ ...f, unit: (e.target as HTMLInputElement).value })} /></label>
        <label class="field grow"><span>Daily goal</span><input class="input" type="number" inputMode="decimal" value={f.target ?? ''} onInput={(e) => setF({ ...f, target: (e.target as HTMLInputElement).value ? Number((e.target as HTMLInputElement).value) : null })} /></label>
      </div>
      <div class="field"><span>Area</span><div class="chips">{areas.filter((a) => !a.archived).map((a) => <button class={`chip ${f.area_id === a.id ? 'on' : ''}`} onClick={() => setF({ ...f, area_id: a.id })}><i class="dot" style={`background:${a.color}`} />{a.name}</button>)}</div></div>
      <div class="row between" style="margin:6px 2px 12px"><span>Show on Today</span><Switch label="Show on Today" on={!!f.show_today} onChange={(v) => setF({ ...f, show_today: v })} /></div>
      <div class="row between" style="margin:6px 2px 18px"><span>Active</span><Switch label="Active" on={f.active !== false} onChange={(v) => setF({ ...f, active: v })} /></div>
      <button class="btn primary block" onClick={save}>Save</button>
    </Sheet>
  )
}

const PALETTE = ['#ffa463', '#a98bff', '#ff8cc8', '#79e2b4', '#ffd66b', '#ff8a7a', '#8fc4ff', '#6fe0dc', '#ffc08a', '#cdb9ff']

function AreaEditor({ open, area, onClose }: { open: boolean; area: Area | null; onClose: () => void }) {
  const [f, setF] = useState<Partial<Area>>({})
  useEffect(() => { if (open) setF(area ? { ...area } : { name: '', color: PALETTE[0], archived: false }) }, [open])
  async function save() {
    if (!f.name?.trim()) return
    try { await saveArea({ id: f.id, name: f.name.trim(), color: f.color ?? null, archived: !!f.archived }); onClose() } catch (e) { toast((e as Error).message) }
  }
  return (
    <Sheet open={open} onClose={onClose} title={area ? 'Edit area' : 'New area'}>
      <label class="field"><span>Name</span><input class="input" value={f.name ?? ''} onInput={(e) => setF({ ...f, name: (e.target as HTMLInputElement).value })} /></label>
      <div class="field"><span>Color</span><div class="chips">{PALETTE.map((c) => <button aria-label={c} class={`chip ${f.color === c ? 'on' : ''}`} style="width:40px;padding:0;justify-content:center" onClick={() => setF({ ...f, color: c })}><i class="dot" style={`background:${c};width:16px;height:16px`} /></button>)}</div></div>
      {area && <div class="row between" style="margin:6px 2px 18px"><span>Archived</span><Switch label="Archived" on={!!f.archived} onChange={(v) => setF({ ...f, archived: v })} /></div>}
      <button class="btn primary block" onClick={save}>Save</button>
    </Sheet>
  )
}

function Appearance() {
  const p = usePrefs()
  return (
    <section class="card">
      <div class="card-h"><h2>Look</h2></div>
      <div class="field"><span>Theme</span><div class="seg">
        {(['dark', 'light', 'auto'] as const).map((t) => <button class={p.theme === t ? 'on' : ''} onClick={() => savePrefs({ theme: t })}>{t === 'auto' ? 'Match phone' : t[0].toUpperCase() + t.slice(1)}</button>)}
      </div></div>
      <div class="field"><span>App icon</span>
        <div class="logos">{LOGOS.map((l) => <button class={p.logo === l.key ? 'on' : ''} onClick={() => savePrefs({ logo: l.key })} aria-label={l.name}><img src={logoUrl(l.key)} alt="" /><span>{l.name}</span></button>)}</div>
      </div>
      <p class="faint small">To see a new icon on your Home Screen, remove Life from the Home Screen and add it again from Safari (Share, then Add to Home Screen). Your data stays put.</p>
    </section>
  )
}

function Windows() {
  const p = usePrefs()
  const set = (k: keyof typeof p.windows, v: string) => v && savePrefs({ windows: { ...p.windows, [k]: v } })
  return (
    <section class="card">
      <div class="card-h"><h2>Morning and night times</h2></div>
      <p class="faint small" style="margin-bottom:10px">When Home offers the morning check-in, switches to your day, and offers the night check-in.</p>
      <div class="row">
        <label class="field grow"><span>Morning</span><input class="input" type="time" value={p.windows.morning} onChange={(e) => set('morning', (e.target as HTMLInputElement).value)} /></label>
        <label class="field grow"><span>Day</span><input class="input" type="time" value={p.windows.log} onChange={(e) => set('log', (e.target as HTMLInputElement).value)} /></label>
        <label class="field grow"><span>Night</span><input class="input" type="time" value={p.windows.night} onChange={(e) => set('night', (e.target as HTMLInputElement).value)} /></label>
      </div>
    </section>
  )
}

function TabPicker() {
  const p = usePrefs()
  const [slot, setSlot] = useState(0)
  const opts = NAV.filter((n) => !['today', 'settings', 'help', 'more'].includes(n.r))
  const put = (r: string) => {
    const tabs = [...p.tabs]
    const at = tabs.indexOf(r)
    if (at === slot) return
    if (at >= 0) tabs[at] = tabs[slot] // already in the bar: swap the two
    tabs[slot] = r
    savePrefs({ tabs })
    setSlot((slot + 1) % 3)
  }
  return (
    <section class="card">
      <div class="card-h"><h2>Bottom bar</h2></div>
      <p class="faint small" style="margin-bottom:10px">Tap a spot in the middle, then pick what goes there. Home and Everything stay put.</p>
      <div class="tabbar-preview pick">
        <span class="fixed"><Icon name="home" size={18} />Home</span>
        {p.tabs.map((r, i) => { const n = NAV.find((x) => x.r === r); return <button class={slot === i ? 'on' : ''} onClick={() => setSlot(i)} aria-label={`Spot ${i + 1}: ${n?.label}`}><Icon name={n?.icon ?? 'grid'} size={18} />{n?.label ?? r}</button> })}
        <span class="fixed"><Icon name="grid" size={18} />Everything</span>
      </div>
      <div class="chips" style="margin-top:12px">{opts.map((n) => <button class={`chip ${p.tabs[slot] === n.r ? 'on' : ''}`} style={`--c:${n.c}`} onClick={() => put(n.r)}>{n.label}</button>)}</div>
    </section>
  )
}

/** Drive times and pay, used by the calendar's Free time, School and Work views. */
function TravelPay() {
  const p = usePrefs()
  const n = (v: string) => v === '' ? null : Number(v)
  return (
    <section class="card">
      <div class="card-h"><h2>Travel and pay</h2></div>
      <p class="faint small" style="margin-bottom:10px">Drive time each way gets added around class days and shifts when the calendar counts your free time. Nothing is added to Google Calendar.</p>
      <div class="row">
        <label class="field grow"><span>To school (min)</span><input class="input" type="number" inputMode="numeric" value={p.commute.school || ''} onChange={(e) => savePrefs({ commute: { ...p.commute, school: n((e.target as HTMLInputElement).value) ?? 0 } })} /></label>
        <label class="field grow"><span>To work (min)</span><input class="input" type="number" inputMode="numeric" value={p.commute.work || ''} onChange={(e) => savePrefs({ commute: { ...p.commute, work: n((e.target as HTMLInputElement).value) ?? 0 } })} /></label>
      </div>
      <div class="row">
        <label class="field grow"><span>Hourly rate ($)</span><input class="input" type="number" inputMode="decimal" value={p.pay.rate ?? ''} onChange={(e) => savePrefs({ pay: { ...p.pay, rate: n((e.target as HTMLInputElement).value) } })} /></label>
        <label class="field grow"><span>Tips per hour ($)</span><input class="input" type="number" inputMode="decimal" value={p.pay.tips ?? ''} onChange={(e) => savePrefs({ pay: { ...p.pay, tips: n((e.target as HTMLInputElement).value) } })} /></label>
      </div>
    </section>
  )
}

function Connections() {
  const synced = useStore((s) => s.synced_at)
  const demo = useStore((s) => s.demo)
  const [st, setSt] = useState<{ monarch: string | null; health: string | null; key: boolean } | null>(null)
  useEffect(() => {
    if (demo) { setSt({ monarch: new Date(Date.now() - 2 * 864e5).toISOString(), health: null, key: false }); return }
    Promise.all([
      supabase.from('fin_accounts').select('as_of').order('as_of', { ascending: false }).limit(1),
      supabase.from('ingest_keys').select('last_used_at').order('last_used_at', { ascending: false, nullsFirst: false }).limit(1),
    ]).then(([a, k]) => setSt({ monarch: (a.data?.[0] as { as_of?: string })?.as_of ?? null, health: (k.data?.[0] as { last_used_at?: string })?.last_used_at ?? null, key: !!k.data?.length }))
  }, [demo])
  const ago = (iso: string | null) => (iso ? relTime(iso) : null)
  const fresh = (iso: string | null, h: number) => !!iso && Date.now() - new Date(iso).getTime() < h * 3600e3
  const rows: [string, string, string, 'ok' | 'warn' | 'off', string?][] = [
    ['Google Calendar', 'cal', synced ? `Copied ${ago(synced)}, every 2 hours` : 'Not copied yet', synced ? (fresh(synced, 6) ? 'ok' : 'warn') : 'off'],
    ['Monarch', 'money', st?.monarch ? `Balances from ${ago(st.monarch)}. Claude reads it when asked.` : 'No balances yet', st?.monarch ? (fresh(st.monarch, 24 * 8) ? 'ok' : 'warn') : 'off'],
    ['Apple Health', 'heart', st?.health ? `Last sent ${ago(st.health)}` : st?.key ? 'Set up, nothing sent yet' : 'Not set up yet. Tap for the steps.', st?.health ? (fresh(st.health, 36) ? 'ok' : 'warn') : 'off', '#/help/health'],
    ['Claude', 'sparkle', 'Reads and writes your data, logs every change', 'ok', '#/changes'],
    ['Supabase', 'lock', 'Your private database. Only you can read it.', 'ok'],
    ['GitHub', 'link', 'Holds the app’s code (no personal data)', 'ok', 'https://github.com/nickwpalmer/life-system'],
  ]
  return (
    <section class="card">
      <div class="card-h"><h2>Connections</h2></div>
      {rows.map(([n, ic, sub, s, href]) => {
        const inner = <><span class="m-ico"><Icon name={ic} size={18} /></span><span class="grow"><div>{n}</div><div class="faint tiny">{sub}</div></span><i class={`cstat ${s}`} aria-label={s === 'ok' ? 'Working' : s === 'warn' ? 'Behind' : 'Not set up'} /></>
        return href ? <a class="conn" href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener">{inner}</a> : <div class="conn">{inner}</div>
      })}
    </section>
  )
}

export function Settings() {
  const metrics = useStore((s) => s.metrics)
  const areas = useStore((s) => s.areas)
  const profile = useStore((s) => s.profile)
  const [name, setName] = useState(profile?.display_name ?? '')
  const [pw, setPw] = useState('')
  const [pwOpen, setPwOpen] = useState(false)
  const [mEdit, setMEdit] = useState<{ open: boolean; m: Metric | null }>({ open: false, m: null })
  const [aEdit, setAEdit] = useState<{ open: boolean; a: Area | null }>({ open: false, a: null })

  async function changePw() {
    if (pw.length < 10) { toast('Use at least 10 characters'); return }
    const { error } = await supabase.auth.updateUser({ password: pw })
    toast(error ? error.message : 'Password changed'); if (!error) { setPw(''); setPwOpen(false) }
  }

  const [trackersOpen, setTrackersOpen] = useState(false)
  const on = metrics.filter((m) => m.active && m.role !== 'vice')
  return (
    <>
      <PageHead title="Settings" back="#/more" icon="gear" color="var(--muted)" />
      <section class="card">
        <div class="card-h"><h2>How this works</h2></div>
        <p class="small" style="margin:-2px 0 12px;line-height:1.5">This app is just for you. Its code sits on <b>GitHub</b>, which also serves the app, with none of your data in it. Your data lives in your own private <b>Supabase</b> database that only you can open. <b>Claude</b> reads and writes it for you and logs every change, so you can undo any of it.</p>
        <div class="row between" style="padding:8px 2px;border-top:1px solid var(--line)"><span class="muted">Signed in as</span><span class="small">{getState().session?.user.email}</span></div>
        <label class="field" style="margin-top:6px"><span>Your name</span>
          <input class="input" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} onBlur={() => saveProfile({ display_name: name.trim() || undefined }).then(() => toast('Saved'))} />
        </label>
        <div class="row wrap" style="gap:8px">
          <button class="btn ghost sm" onClick={() => syncAll()}><Icon name="history" size={16} />Sync now</button>
          <a class="btn ghost sm" href="#/changes">Claude’s changes</a>
          {!pwOpen && <button class="btn ghost sm" onClick={() => setPwOpen(true)}>Change password</button>}
        </div>
        {pwOpen && <div class="row" style="margin-top:10px"><input class="input grow" type="password" autocomplete="new-password" placeholder="New password" value={pw} onInput={(e) => setPw((e.target as HTMLInputElement).value)} /><button class="btn" onClick={changePw}>Save</button></div>}
      </section>

      <Appearance />
      <TabPicker />
      <Windows />
      <TravelPay />
      <Security />
      <Connections />

      <button class="card prompt" style="--accent:var(--violet);width:100%;text-align:left" onClick={() => setTrackersOpen(true)}>
        <span class="orb"><Icon name="sliders" size={20} /></span><span class="grow"><h3>Trackers</h3><p class="muted small">{on.length} on · what the daily log and check-ins ask about</p></span><Icon name="chev" />
      </button>
      <Sheet open={trackersOpen} onClose={() => setTrackersOpen(false)} title="Trackers">
        <button class="btn ghost sm" style="margin-bottom:6px" onClick={() => setMEdit({ open: true, m: null })}><Icon name="plus" size={16} />Add a tracker</button>
        {(['habit', 'health', 'track'] as const).map((r) => (
          <div>
            <div class="faint small" style="margin:12px 2px 2px">{ROLE_LABEL[r]}</div>
            {metrics.filter((m) => m.role === r).map((m) => (
              <div class="row between" style={`padding:10px 2px;border-bottom:1px solid var(--line);${m.active ? '' : 'opacity:.45'}`} onClick={() => setMEdit({ open: true, m })}>
                <span>{m.name}{m.unit ? <span class="faint small"> · {m.unit}</span> : null}</span>
                <span class="faint small row">{m.show_today && m.active ? 'on Home' : m.active ? '' : 'off'}<Icon name="chev" size={16} /></span>
              </div>
            ))}
          </div>
        ))}
      </Sheet>

      <section class="card">
        <div class="card-h"><h2>Areas of life</h2><button class="btn ghost sm" onClick={() => setAEdit({ open: true, a: null })}>Add</button></div>
        <p class="faint small" style="margin:-4px 0 6px">Areas sort your tasks, goals, trackers and journal, and each gets its own page and color. Adding one gives you a new place to file things. Archiving one hides it from pickers and Home but keeps everything filed under it; nothing is deleted.</p>
        {areas.map((a) => (
          <div class="row between" style={`padding:10px 2px;border-bottom:1px solid var(--line);${a.archived ? 'opacity:.45' : ''}`} onClick={() => setAEdit({ open: true, a })}>
            <span class="row"><i class="dot" style={`background:${a.color}`} />{a.name}</span><span class="faint"><Icon name="chev" size={16} /></span>
          </div>
        ))}
      </section>

      <a class="card prompt" href="#/help" style="--accent:var(--sky)"><span class="orb"><Icon name="help" size={20} /></span><span class="grow"><h3>Help</h3><p class="muted small">Apple Health setup, Mac, shortcuts, the icon</p></span><Icon name="chev" /></a>
      <button class="btn ghost danger block" onClick={async () => { await supabase.auth.signOut(); clearData() }}><Icon name="out" size={18} /> Sign out</button>
      <p class="faint small" style="text-align:center;margin-top:16px">Life v0.4</p>

      <MetricEditor open={mEdit.open} metric={mEdit.m} onClose={() => setMEdit({ open: false, m: null })} />
      <AreaEditor open={aEdit.open} area={aEdit.a} onClose={() => setAEdit({ open: false, a: null })} />
    </>
  )
}
