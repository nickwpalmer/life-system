import { useEffect, useState } from 'preact/hooks'
import { useStore, toast, getState } from '../lib/store'
import { insert, update, remove, restore } from '../lib/db'
import { today, daysUntil, fmtShort } from '../lib/dates'
import { nextBirthday, turning, daysSince } from '../lib/cal'
import type { Person } from '../lib/types'
import { Icon } from '../ui/icons'
import { Sheet, PageHead, Card } from '../ui/kit'

function Editor({ person, onClose }: { person: Person | 'new' | null; onClose: () => void }) {
  const [f, setF] = useState<Partial<Person>>({})
  useEffect(() => { if (person) setF(person === 'new' ? { name: '', relation: '', birthday: null, contact_every_days: null, notes: '' } : { ...person }) }, [person])
  if (!person) return <Sheet open={false} onClose={onClose}>{null}</Sheet>
  async function save() {
    onClose()
    if (!f.name?.trim()) return
    const row = { name: f.name.trim(), relation: f.relation || null, birthday: f.birthday || null, contact_every_days: f.contact_every_days ?? null, notes: f.notes || null }
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
      <label class="field"><span>Who they are to you</span><input class="input" placeholder="Sister, friend, mentor…" value={f.relation ?? ''} onInput={(e) => setF({ ...f, relation: (e.target as HTMLInputElement).value })} /></label>
      <label class="field"><span>Birthday</span><input class="input" type="date" value={f.birthday && f.birthday.length > 5 ? f.birthday : ''} onInput={(e) => setF({ ...f, birthday: (e.target as HTMLInputElement).value || null })} /></label>
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
      <PageHead title="People" sub="The ones who matter, so nothing slips." back="#/more" icon="users" color="var(--coral)" action={<button class="icon-btn" aria-label="Add person" onClick={() => setEdit('new')}><Icon name="plus" /></button>} />
      <div class="grid-2">
        <div>
          {due.length > 0 && <Card title="Time to reach out" icon="heart" accent="var(--coral)">
            {due.map((p) => <div class="row" style="padding:8px 0"><span class="grow"><div>{p.name}</div><div class="faint small">{p.last_contact ? `Last ${fmtShort(p.last_contact)}` : 'No contact logged yet'}</div></span><button class="btn sm" onClick={() => { update('people', p.id, { last_contact: today() }); toast(`Logged. Nice.`) }}>Talked today</button></div>)}
          </Card>}
          <Card title="Everyone" icon="users">
            {people.length ? [...people].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
              <div class="row" style="padding:10px 0;border-bottom:1px solid var(--line);cursor:pointer" onClick={() => setEdit(p)}>
                <span class="m-ico" style="width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb, var(--coral) 18%, transparent);color:var(--coral);font-weight:700;flex:none">{p.name[0]}</span>
                <span class="grow"><div>{p.name}</div><div class="faint small">{[p.relation, p.last_contact ? `talked ${fmtShort(p.last_contact)}` : ''].filter(Boolean).join(' · ')}</div></span>
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
