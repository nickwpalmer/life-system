import { useEffect, useState } from 'preact/hooks'
import { supabase, lockEnabled, setLockFlag } from '../lib/supabase'
import { useStore, toast, getState } from '../lib/store'
import { saveMetric, saveArea, saveProfile, clearData } from '../lib/db'
import { passkeySupported } from '../lib/lock'
import { ROLE_LABEL } from '../lib/metrics'
import type { Area, Metric, MetricKind, MetricRole } from '../lib/types'
import { Icon } from '../ui/icons'
import { Sheet, Switch, PageHead } from '../ui/kit'
import { HealthSync } from './HealthSync'

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
      <div class="field"><span>Kind</span><div class="chips">{(['habit', 'vice', 'health', 'track'] as MetricRole[]).map((r) => <button class={`chip ${f.role === r ? 'on' : ''}`} onClick={() => setF({ ...f, role: r, higher_is_better: r !== 'vice' })}>{ROLE_LABEL[r]}</button>)}</div></div>
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

export function Settings() {
  const metrics = useStore((s) => s.metrics)
  const areas = useStore((s) => s.areas)
  const profile = useStore((s) => s.profile)
  const [name, setName] = useState(profile?.display_name ?? '')
  const [pw, setPw] = useState('')
  const [mEdit, setMEdit] = useState<{ open: boolean; m: Metric | null }>({ open: false, m: null })
  const [aEdit, setAEdit] = useState<{ open: boolean; a: Area | null }>({ open: false, a: null })

  async function changePw() {
    if (pw.length < 10) { toast('Use at least 10 characters'); return }
    const { error } = await supabase.auth.updateUser({ password: pw })
    toast(error ? error.message : 'Password updated'); if (!error) setPw('')
  }

  return (
    <>
      <PageHead title="Settings" back="#/more" icon="gear" color="var(--muted)" />
      <section class="card">
        <div class="card-h"><h2>You</h2></div>
        <label class="field"><span>What should the app call you?</span>
          <input class="input" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} onBlur={() => saveProfile({ display_name: name.trim() || undefined }).then(() => toast('Saved'))} />
        </label>
        <p class="faint small">Signed in as {getState().session?.user.email}</p>
      </section>

      <Security />
      <HealthSync />

      <section class="card">
        <div class="card-h"><h2>On your Mac</h2></div>
        <p class="muted small" style="line-height:1.55">Open this page in Safari, then choose File, Add to Dock. Your iPhone passkey syncs through iCloud Keychain, so the Mac signs in with Touch ID or your iPhone. If it doesn’t show up, sign in with your password once and tap “Add Face ID on this device” above. Press N anywhere to capture, and 1 to 7 to jump between screens.</p>
      </section>

      <section class="card">
        <div class="card-h"><h2>Trackers</h2><button class="btn ghost sm" onClick={() => setMEdit({ open: true, m: null })}>Add</button></div>
        {(['habit', 'vice', 'health', 'track'] as const).map((r) => (
          <div>
            <div class="faint small" style="margin:12px 2px 2px">{ROLE_LABEL[r]}</div>
            {metrics.filter((m) => m.role === r).map((m) => (
              <div class="row between" style={`padding:10px 2px;border-bottom:1px solid var(--line);${m.active ? '' : 'opacity:.45'}`} onClick={() => setMEdit({ open: true, m })}>
                <span>{m.name}{m.unit ? <span class="faint small"> · {m.unit}</span> : null}</span>
                <span class="faint small row">{m.show_today && m.active ? 'on Today' : m.active ? '' : 'off'}<Icon name="chev" size={16} /></span>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section class="card">
        <div class="card-h"><h2>Areas of life</h2><button class="btn ghost sm" onClick={() => setAEdit({ open: true, a: null })}>Add</button></div>
        {areas.map((a) => (
          <div class="row between" style={`padding:10px 2px;border-bottom:1px solid var(--line);${a.archived ? 'opacity:.45' : ''}`} onClick={() => setAEdit({ open: true, a })}>
            <span class="row"><i class="dot" style={`background:${a.color}`} />{a.name}</span><span class="faint"><Icon name="chev" size={16} /></span>
          </div>
        ))}
      </section>

      <section class="card">
        <div class="card-h"><h2>Password</h2></div>
        <div class="row"><input class="input grow" type="password" autocomplete="new-password" placeholder="New password" value={pw} onInput={(e) => setPw((e.target as HTMLInputElement).value)} /><button class="btn" onClick={changePw}>Save</button></div>
      </section>

      <button class="btn ghost danger block" onClick={async () => { await supabase.auth.signOut(); clearData() }}><Icon name="out" size={18} /> Sign out</button>
      <p class="faint small" style="text-align:center;margin-top:16px">Life v0.2</p>

      <MetricEditor open={mEdit.open} metric={mEdit.m} onClose={() => setMEdit({ open: false, m: null })} />
      <AreaEditor open={aEdit.open} area={aEdit.a} onClose={() => setAEdit({ open: false, a: null })} />
    </>
  )
}
