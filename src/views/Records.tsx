import { useEffect, useState } from 'preact/hooks'
import { useRows, addRow, patchRow, dropRow, registerDemo } from '../lib/rows'
import { toast } from '../lib/store'
import { daysUntil, fmtShort, fromKey, inDays } from '../lib/dates'
import { usePrefs } from '../lib/prefs'
import { Icon } from '../ui/icons'
import { Sheet, PageHead, Switch, haptic } from '../ui/kit'

/**
 * Records: the documents and facts you need to find fast (insurance, car, taxes, IDs, leases).
 * Each record says where the original lives and, if it has one, when it expires.
 * No password, SSN or file fields. Logins keep the username only; files live in Google Drive and are linked.
 */
export type Rec = {
  id: string; name: string; category: string; issuer: string | null; details: string | null; location: string | null
  link: string | null; login_hint: string | null; expires_on: string | null; renews: boolean; notes: string | null; pinned: boolean
  created_at?: string; updated_at?: string
}

export const CATS: { k: string; label: string; icon: string; c: string }[] = [
  { k: 'insurance', label: 'Insurance', icon: 'heart', c: 'var(--mint)' },
  { k: 'vehicle', label: 'Vehicle', icon: 'compass', c: 'var(--sky)' },
  { k: 'taxes', label: 'Taxes', icon: 'money', c: 'var(--gold)' },
  { k: 'identity', label: 'IDs', icon: 'face', c: 'var(--lilac)' },
  { k: 'accounts', label: 'Accounts', icon: 'lock', c: 'var(--violet)' },
  { k: 'medical', label: 'Medical', icon: 'pulse', c: 'var(--pink)' },
  { k: 'housing', label: 'Housing', icon: 'home', c: 'var(--peach)' },
  { k: 'school', label: 'School', icon: 'school', c: 'var(--lilac)' },
  { k: 'other', label: 'Other', icon: 'note', c: 'var(--muted)' },
]
export const catOf = (k: string) => CATS.find((c) => c.k === k) ?? CATS[CATS.length - 1]

/** Common things to add, so a new record starts with the right category. */
const STARTERS: [string, string, boolean][] = [
  ['Health insurance', 'insurance', false], ['Car registration', 'vehicle', true], ['Car insurance', 'insurance', true],
  ['Driver’s license', 'identity', true], ['Passport', 'identity', false], ['Tax return', 'taxes', false], ['W-2', 'taxes', false],
  ['Lease', 'housing', false], ['Renters insurance', 'insurance', true],
]

export const SOON_DAYS = 30
export type ExpState = 'none' | 'ok' | 'soon' | 'expired'
export function expState(r: Pick<Rec, 'expires_on'>): ExpState {
  if (!r.expires_on) return 'none'
  const n = daysUntil(r.expires_on)
  return n < 0 ? 'expired' : n <= SOON_DAYS ? 'soon' : 'ok'
}
export function expText(r: Pick<Rec, 'expires_on' | 'renews'>): string {
  if (!r.expires_on) return ''
  const n = daysUntil(r.expires_on), d = fmtShort(r.expires_on)
  const yr = fromKey(r.expires_on).getFullYear() !== new Date().getFullYear() ? `, ${fromKey(r.expires_on).getFullYear()}` : ''
  if (n < 0) return `${r.renews ? 'Renewal overdue' : 'Expired'} · ${d}${yr}`
  if (n === 0) return 'Expires today'
  if (n === 1) return 'Expires tomorrow'
  if (n <= SOON_DAYS) return `Expires in ${n} days · ${d}`
  return `${r.renews ? 'Renews' : 'Good until'} ${d}${yr}`
}

registerDemo('records', () => [
  { id: 'r1', name: 'Health insurance', category: 'insurance', issuer: 'Example Health', details: 'Silver PPO. Member ID on the card in your wallet.', location: 'Card in wallet; plan PDF in Drive › Insurance', link: null, login_hint: 'sam.example on the Example Health portal', expires_on: inDays(37), renews: false, notes: 'Pick next year’s plan before open enrollment ends.', pinned: true },
  { id: 'r2', name: 'Car registration', category: 'vehicle', issuer: 'Secretary of State', details: '2018 hatchback', location: 'Glove box', link: null, login_hint: null, expires_on: inDays(12), renews: true, notes: null, pinned: false },
  { id: 'r3', name: 'Car insurance', category: 'insurance', issuer: 'Example Auto', details: 'Proof of insurance card', location: 'Glove box and the insurer’s app', link: null, login_hint: 'Example Auto app, same email', expires_on: inDays(-4), renews: true, notes: null, pinned: false },
  { id: 'r4', name: 'Tax return 2025', category: 'taxes', issuer: 'IRS and state', details: 'Federal and state, filed in April', location: 'Drive › Taxes › 2025', link: null, login_hint: null, expires_on: null, renews: false, notes: null, pinned: false },
  { id: 'r5', name: 'W-2 2025', category: 'taxes', issuer: 'Employer', details: null, location: 'Drive › Taxes › 2025', link: null, login_hint: 'Payroll portal, work email', expires_on: null, renews: false, notes: null, pinned: false },
  { id: 'r6', name: 'Driver’s license', category: 'identity', issuer: 'Secretary of State', details: null, location: 'Wallet', link: null, login_hint: null, expires_on: inDays(400), renews: true, notes: null, pinned: false },
] as never)

const blank = (): Partial<Rec> => ({ name: '', category: 'other', issuer: '', details: '', location: '', link: '', login_hint: '', expires_on: null, renews: false, notes: '', pinned: false })
const clean = (s: string | null | undefined) => (s ?? '').trim() || null
const looksSecret = (s: string) => /\b\d{3}-\d{2}-\d{4}\b|password\s*[:=]|pwd\s*[:=]/i.test(s)

function Editor({ rec, onClose }: { rec: Rec | Partial<Rec> | null; onClose: () => void }) {
  const [f, setF] = useState<Partial<Rec>>(blank())
  useEffect(() => { if (rec) setF({ ...blank(), ...rec }) }, [rec])
  const isNew = !rec || !('id' in rec) || !rec.id
  const set = (k: keyof Rec, v: unknown) => setF({ ...f, [k]: v })
  const text = (k: keyof Rec, label: string, ph = '', type = 'text') => (
    <label class="field"><span>{label}</span><input class="input" type={type} placeholder={ph} value={(f[k] as string) ?? ''} onInput={(e) => set(k, (e.target as HTMLInputElement).value)} /></label>
  )
  async function save() {
    const name = f.name?.trim()
    if (!name) { toast('Give it a name'); return }
    const all = `${f.details ?? ''} ${f.notes ?? ''} ${f.login_hint ?? ''}`
    if (looksSecret(all)) { toast('That looks like an SSN or a password. Leave those out.'); return }
    let link = clean(f.link)
    if (link && !/^https:\/\//i.test(link)) { if (/^http:\/\//i.test(link) || /\s/.test(link)) { toast('Links need to start with https://'); return } link = `https://${link}` }
    const row = { name, category: f.category || 'other', issuer: clean(f.issuer), details: clean(f.details), location: clean(f.location), link, login_hint: clean(f.login_hint), expires_on: f.expires_on || null, renews: !!f.renews, notes: clean(f.notes), pinned: !!f.pinned }
    haptic(); onClose()
    try { if (isNew) await addRow('records', row); else await patchRow('records', (rec as Rec).id, row); toast('Saved') } catch { /* toast shown */ }
  }
  async function del() {
    if (isNew || !confirm(`Delete “${(rec as Rec).name}”?`)) return
    onClose(); await dropRow('records', (rec as Rec).id).catch(() => {})
  }
  return (
    <Sheet open={!!rec} onClose={onClose} title={isNew ? 'New record' : 'Edit record'} wide>
      {isNew && !f.name && <div class="chips" style="margin-bottom:14px">{STARTERS.map(([n, c, r]) => <button class="chip" style={`--c:${catOf(c).c}`} onClick={() => setF({ ...f, name: n, category: c, renews: r })}>{n}</button>)}</div>}
      {text('name', 'Name', 'Health insurance, car registration…')}
      <div class="field"><span>Kind</span><div class="chips">{CATS.map((c) => <button class={`chip ${f.category === c.k ? 'on' : ''}`} style={`--c:${c.c}`} onClick={() => set('category', c.k)}>{c.label}</button>)}</div></div>
      {text('issuer', 'From', 'Insurer, state, employer…')}
      <label class="field"><span>Key details</span><textarea class="input" rows={3} placeholder="Plan, policy or member number, what it covers, the plate…" value={f.details ?? ''} onInput={(e) => set('details', (e.target as HTMLTextAreaElement).value)} /></label>
      {text('location', 'Where the original is', 'Glove box, file box, Drive › Taxes › 2025…')}
      {text('link', 'Google Drive link (optional)', 'https://drive.google.com/…', 'url')}
      {text('login_hint', 'Username (optional)', 'Username or email, and which site or app')}
      <div class="row">
        <label class="field grow"><span>Expires (optional)</span><input class="input" type="date" value={f.expires_on ?? ''} onInput={(e) => set('expires_on', (e.target as HTMLInputElement).value || null)} /></label>
        {f.expires_on && <button class="btn ghost sm" style="margin-top:8px" onClick={() => set('expires_on', null)}>Clear</button>}
      </div>
      {f.expires_on && <div class="row between" style="margin:-4px 2px 14px"><span>Renews (registration, license)</span><Switch label="Renews" on={!!f.renews} onChange={(v) => set('renews', v)} /></div>}
      <label class="field"><span>Notes</span><textarea class="input" rows={2} value={f.notes ?? ''} onInput={(e) => set('notes', (e.target as HTMLTextAreaElement).value)} /></label>
      <div class="row between" style="margin:0 2px 16px"><span>Pin to top</span><Switch label="Pin" on={!!f.pinned} onChange={(v) => set('pinned', v)} /></div>
      <button class="btn primary block" onClick={save}>Save</button>
      {!isNew && <button class="btn ghost danger block" style="margin-top:8px" onClick={del}><Icon name="trash" size={18} /> Delete</button>}
    </Sheet>
  )
}

/** One record as a card. Expired turns red; expiring within 30 days turns gold. */
export function RecCard({ r, onOpen, preview }: { r: Rec; onOpen?: () => void; preview?: string }) {
  const st = expState(r), cat = catOf(r.category)
  return (
    <div class={`rec ${st}`} style={`--c:${cat.c}`} onClick={onOpen} role={onOpen ? 'button' : undefined}>
      {preview && <span class="rec-tag">{preview}</span>}
      <div class="row" style="gap:10px;align-items:flex-start">
        <span class="m-ico"><Icon name={cat.icon} size={17} /></span>
        <span class="grow" style="min-width:0">
          <h3>{r.pinned && <span style="color:var(--orange)"><Icon name="pin" size={13} /> </span>}{r.name}</h3>
          {r.issuer && <div class="faint small">{r.issuer}</div>}
        </span>
        {st === 'expired' && <span class="stamp">{r.renews ? 'Overdue' : 'Expired'}</span>}
      </div>
      {st !== 'none' && <div class={`exp ${st}`}><Icon name={st === 'expired' ? 'x' : st === 'soon' ? 'clock' : 'check'} size={14} />{expText(r)}</div>}
      {r.details && <p>{r.details}</p>}
      {(r.location || r.link || r.login_hint) && (
        <div class="rec-meta">
          {r.location && <span><Icon name="pin" size={13} />{r.location}</span>}
          {r.login_hint && <span><Icon name="users" size={13} />{r.login_hint}</span>}
          {r.link && <a href={r.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}><Icon name="link" size={13} />Open</a>}
        </div>
      )}
    </div>
  )
}

/** Sample for the preview in Settings: the same health insurance card active, close to ending and expired. */
function Preview() {
  const base: Rec = { id: 'p', name: 'Health insurance', category: 'insurance', issuer: 'Your insurer', details: 'Plan and member number go here.', location: 'Card in wallet', link: null, login_hint: null, expires_on: null, renews: false, notes: null, pinned: false }
  return (
    <section class="card preview-box">
      <div class="card-h"><h2>Expiry preview</h2><a class="btn ghost sm" href="#/settings">Turn off</a></div>
      <p class="faint small" style="margin-bottom:12px">Sample only, not your data. This is how a record looks as its date gets close and after it passes.</p>
      <div class="rec-grid">
        <RecCard r={{ ...base, id: 'p1', expires_on: inDays(120) }} preview="Active" />
        <RecCard r={{ ...base, id: 'p2', expires_on: inDays(9) }} preview="Ending soon" />
        <RecCard r={{ ...base, id: 'p3', expires_on: inDays(-6) }} preview="Expired" />
      </div>
    </section>
  )
}

export function Records() {
  const rows = useRows<Rec>('records')
  const prefs = usePrefs()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const [edit, setEdit] = useState<Rec | Partial<Rec> | null>(null)
  const rank = (r: Rec) => ({ expired: 0, soon: 1, ok: 2, none: 3 })[expState(r)]
  const list = (rows ?? [])
    .filter((r) => !cat || r.category === cat)
    .filter((r) => !q || `${r.name} ${r.issuer ?? ''} ${r.details ?? ''} ${r.location ?? ''} ${r.notes ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || rank(a) - rank(b) || (a.expires_on ?? '9').localeCompare(b.expires_on ?? '9') || a.name.localeCompare(b.name))
  const used = CATS.filter((c) => rows?.some((r) => r.category === c.k))
  const attention = (rows ?? []).filter((r) => expState(r) === 'expired' || expState(r) === 'soon').length
  return (
    <>
      <PageHead title="Records" sub={attention ? `${attention} need${attention === 1 ? 's' : ''} a look` : 'Documents and the facts you need fast'} back="#/more" icon="layers" color="var(--peach)"
        action={<button class="btn primary sm" onClick={() => setEdit(blank())}><Icon name="plus" size={16} />Add</button>} />
      {prefs.previewExpiry && <Preview />}
      {rows === null ? <div class="skeleton" /> : !rows.length ? (
        <div class="card soft"><p class="muted">Add the things you’d hate to dig for: insurance, car registration, tax returns, W-2s, your lease. Say where each original lives, and add the expiry date if it has one.</p></div>
      ) : (
        <>
          <input class="input" style="margin-bottom:12px;border-radius:999px" placeholder="Search records" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          {used.length > 1 && <div class="chips scroll" style="margin-bottom:14px">
            <button class={`chip ${!cat ? 'on' : ''}`} onClick={() => setCat(null)}>All</button>
            {used.map((c) => <button class={`chip ${cat === c.k ? 'on' : ''}`} style={`--c:${c.c}`} onClick={() => setCat(cat === c.k ? null : c.k)}>{c.label}</button>)}
          </div>}
          {list.length ? <div class="rec-grid">{list.map((r) => <RecCard r={r} onOpen={() => setEdit(r)} />)}</div> : <div class="card"><p class="empty">Nothing matches.</p></div>}
        </>
      )}
      <a class="card prompt" href="#/notes" style="--accent:var(--peach);margin-top:14px"><span class="orb"><Icon name="note" size={20} /></span><span class="grow"><h3>Notes</h3><p class="muted small">Lists, how-tos and anything else to keep</p></span><Icon name="chev" /></a>
      <Editor rec={edit} onClose={() => setEdit(null)} />
    </>
  )
}
