import { useEffect, useState } from 'preact/hooks'
import { useStore, toast, getState, setState } from '../lib/store'
import { insert, update, remove, restore } from '../lib/db'
import { today, daysUntil, fmtShort } from '../lib/dates'
import { nextBirthday, turning, daysSince } from '../lib/cal'
import type { Person } from '../lib/types'
import { Icon } from '../ui/icons'
import { Sheet, PageHead, Card } from '../ui/kit'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** Month and day, year optional. Stored as MM-DD, or YYYY-MM-DD when the year is known. */
function BirthdayInput({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const parts = (value ?? '').split('-')
  const [y, m, d] = parts.length === 3 ? parts : ['', parts[0] ?? '', parts[1] ?? '']
  const put = (yy: string, mm: string, dd: string) => {
    if (!mm || !dd) { onChange(null); return }
    const md = `${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
    onChange(/^\d{4}$/.test(yy) ? `${yy}-${md}` : md)
  }
  return (
    <div class="row" style="gap:8px">
      <select class="input grow" aria-label="Birthday month" value={m} onChange={(e) => put(y, (e.target as HTMLSelectElement).value, d || '1')}>
        <option value="">Month</option>{MONTHS.map((n, i) => <option value={String(i + 1).padStart(2, '0')}>{n}</option>)}
      </select>
      <select class="input" style="width:84px" aria-label="Birthday day" value={d} onChange={(e) => put(y, m || '01', (e.target as HTMLSelectElement).value)}>
        <option value="">Day</option>{Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map((n) => <option value={n}>{Number(n)}</option>)}
      </select>
      <input class="input" style="width:96px" inputMode="numeric" placeholder="Year" aria-label="Birth year (optional)" value={y} onChange={(e) => put((e.target as HTMLInputElement).value.trim(), m, d)} />
      {value && <button class="icon-btn sm" aria-label="Clear birthday" onClick={() => onChange(null)}><Icon name="x" size={14} /></button>}
    </div>
  )
}

/** Mounted once in the app shell: opens a person from anywhere their name shows up. */
export function GlobalPersonSheet() {
  const id = useStore((s) => s.person)
  const p = useStore((s) => s.people.find((x) => x.id === id))
  return <Editor person={id === 'new' ? 'new' : p ?? null} onClose={() => setState({ person: null })} />
}

/**
 * Text with people's names turned into links that open their card. Matches full names,
 * and first names when only one person has that first name.
 */
export function PeopleText({ text }: { text: string }) {
  const people = useStore((s) => s.people)
  if (!people.length) return <>{text}</>
  const first = new Map<string, number>()
  for (const p of people) { const f = p.name.split(' ')[0].toLowerCase(); first.set(f, (first.get(f) ?? 0) + 1) }
  const keys: [string, string][] = []
  for (const p of people) {
    keys.push([p.name, p.id])
    const f = p.name.split(' ')[0]
    if (f.length >= 3 && first.get(f.toLowerCase()) === 1 && f !== p.name) keys.push([f, p.id])
  }
  keys.sort((a, b) => b[0].length - a[0].length)
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\b(${keys.map(([k]) => esc(k)).join('|')})\\b`, 'gi')
  const out: preact.ComponentChildren[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    const id = keys.find(([k]) => k.toLowerCase() === m[0].toLowerCase())?.[1]
    if (!id) continue
    out.push(text.slice(last, m.index))
    out.push(<button class="plink" onClick={(e) => { e.stopPropagation(); setState({ person: id }) }}>{m[0]}</button>)
    last = m.index! + m[0].length
  }
  out.push(text.slice(last))
  return <>{out}</>
}

function Editor({ person, onClose }: { person: Person | 'new' | null; onClose: () => void }) {
  const [f, setF] = useState<Partial<Person>>({})
  useEffect(() => { if (person) setF(person === 'new' ? { name: '', relation: '', birthday: null, contact_every_days: null, notes: '' } : { ...person }) }, [person])
  if (!person) return <Sheet open={false} onClose={onClose}>{null}</Sheet>
  async function save() {
    onClose()
    if (!f.name?.trim()) return
    const row = { name: f.name.trim(), relation: f.relation || null, birthday: f.birthday || null, contact_every_days: f.contact_every_days ?? null, notes: f.notes || null, phone: f.phone || null, email: f.email || null, org: f.org || null }
    try { if (person !== 'new') await update('people', (person as Person).id, row); else await insert('people', { ...row, last_contact: null }) } catch { /* shown */ }
  }
  async function del() {
    const p = person as Person; const row = getState().people.find((x) => x.id === p.id)
    onClose(); await remove('people', p.id).catch(() => {})
    if (row) toast('Removed', () => restore('people', row as never))
  }
  return (
    <Sheet open onClose={save} title={person === 'new' ? 'Add someone' : f.name || 'Person'}>
      <label class="field"><span>Name</span><input class="input" value={f.name ?? ''} onInput={(e) => setF({ ...f, name: (e.target as HTMLInputElement).value })} /></label>
      <div class="row">
        <label class="field grow"><span>Who they are to you</span><input class="input" placeholder="Friend, mentor, doctor" value={f.relation ?? ''} onInput={(e) => setF({ ...f, relation: (e.target as HTMLInputElement).value })} /></label>
        <label class="field grow"><span>Where (optional)</span><input class="input" placeholder="Company, school" value={f.org ?? ''} onInput={(e) => setF({ ...f, org: (e.target as HTMLInputElement).value })} /></label>
      </div>
      <div class="row">
        <label class="field grow"><span>Phone (optional)</span><input class="input" type="tel" value={f.phone ?? ''} onInput={(e) => setF({ ...f, phone: (e.target as HTMLInputElement).value })} /></label>
        <label class="field grow"><span>Email (optional)</span><input class="input" type="email" value={f.email ?? ''} onInput={(e) => setF({ ...f, email: (e.target as HTMLInputElement).value })} /></label>
      </div>
      {person !== 'new' && (f.phone || f.email) && <div class="chips" style="margin:-4px 0 12px">
        {f.phone && <a class="chip" href={`tel:${f.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" size={14} />Call</a>}
        {f.phone && <a class="chip" href={`sms:${f.phone.replace(/[^\d+]/g, '')}`}>Text</a>}
        {f.email && <a class="chip" href={`mailto:${f.email}`}>Email</a>}
      </div>}
      <div class="field"><span>Birthday</span><BirthdayInput value={f.birthday ?? null} onChange={(v) => setF({ ...f, birthday: v })} /></div>
      <div class="field"><span>Reach out every</span><div class="chips">{[[null, 'No reminder'], [7, 'Week'], [14, '2 weeks'], [30, 'Month'], [90, '3 months']].map(([d, l]) => <button class={`chip ${f.contact_every_days === d ? 'on' : ''}`} onClick={() => setF({ ...f, contact_every_days: d as number | null })}>{l}</button>)}</div></div>
      <label class="field"><span>Notes</span><textarea class="input" placeholder="Gift ideas, what they’re going through, what to ask about" value={f.notes ?? ''} onInput={(e) => setF({ ...f, notes: (e.target as HTMLTextAreaElement).value })} /></label>
      <button class="btn primary block" onClick={save}>Save</button>
      {person !== 'new' && <button class="btn ghost danger block" style="margin-top:8px" onClick={del}><Icon name="trash" size={18} /> Remove</button>}
    </Sheet>
  )
}

export function People() {
  const people = useStore((s) => s.people)
  const [edit, setEdit] = useState<Person | 'new' | null>(null)
  const bdays = people.map((p) => ({ p, d: nextBirthday(p) })).filter((x) => x.d).sort((a, b) => a.d!.localeCompare(b.d!))
  const due = people.filter((p) => p.contact_every_days && (daysSince(p.last_contact) ?? 999) >= p.contact_every_days)
  return (
    <>
      <PageHead title="People" sub="Birthdays, contacts, who to follow up with" back="#/more" icon="users" color="var(--coral)" action={<button class="icon-btn" aria-label="Add person" onClick={() => setEdit('new')}><Icon name="plus" /></button>} />
      <div class="grid-2">
        <div>
          {due.length > 0 && <Card title="Time to reach out" icon="heart" accent="var(--coral)">
            {due.map((p) => <div class="row" style="padding:8px 0"><span class="grow"><div>{p.name}</div><div class="faint small">{p.last_contact ? `Last ${fmtShort(p.last_contact)}` : 'No contact logged yet'}</div></span><button class="btn sm" onClick={() => { update('people', p.id, { last_contact: today() }); toast(`Logged. Nice.`) }}>Talked today</button></div>)}
          </Card>}
          <Card title="Everyone" icon="users">
            {people.length ? [...people].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
              <div class="row" style="padding:10px 0;border-bottom:1px solid var(--line);cursor:pointer" onClick={() => setEdit(p)}>
                <span class="m-ico" style="width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb, var(--coral) 18%, transparent);color:var(--coral);font-weight:700;flex:none">{p.name[0]}</span>
                <span class="grow" style="min-width:0"><div>{p.name}</div><div class="faint small ellipsis">{[p.relation, p.org, p.last_contact ? `talked ${fmtShort(p.last_contact)}` : ''].filter(Boolean).join(' · ')}</div></span>
                <button class="btn sm ghost" onClick={(e) => { e.stopPropagation(); update('people', p.id, { last_contact: today() }); toast(`Logged time with ${p.name}`) }}>Talked</button>
              </div>
            )) : <p class="empty">Add family and close friends. You’ll see birthdays coming and who you haven’t talked to in a while.</p>}
          </Card>
        </div>
        <Card title="Birthdays" icon="sparkle" accent="var(--pink)">
          {bdays.length ? bdays.map(({ p, d }) => { const n = daysUntil(d!), age = turning(p, d!); return (
            <div class="count" style="--c:var(--pink)"><span class="c-n"><b>{n}</b><span>{n === 1 ? 'day' : 'days'}</span></span><span class="grow"><div>{p.name}</div><div class="faint small">{fmtShort(d!)}{age ? ` · turns ${age}` : ''}</div></span></div>
          ) }) : <p class="muted small">Add birthdays and they count down here and on Today.</p>}
        </Card>
      </div>
      <Editor person={edit} onClose={() => setEdit(null)} />
    </>
  )
}
