import { useState } from 'preact/hooks'
import { useRows, addRow, patchRow, dropRow, registerDemo } from '../lib/rows'
import { toast } from '../lib/store'
import { Icon } from '../ui/icons'
import { Sheet } from '../ui/kit'

/**
 * Inventories: lists of things you own (apartment, clothes, electronics, anything).
 * One table, inventory_items; the list column says which inventory a row belongs to.
 * A list exists as soon as it has one item. Claude can fill these too.
 */
export type Item = {
  id: string; list: string; name: string; qty: number | null; category: string | null; location: string | null
  value: number | null; acquired_on: string | null; notes: string | null; created_at?: string
}
const IDEAS = ['Apartment', 'Clothes', 'Electronics']

registerDemo('inventory_items', () => [
  { id: 'i1', list: 'Electronics', name: 'Microcontroller board', qty: 3, category: 'Boards', location: 'Parts bin A', value: 12, acquired_on: null, notes: null },
  { id: 'i2', list: 'Electronics', name: 'Jumper wires', qty: 1, category: 'Wiring', location: 'Parts bin B', value: null, acquired_on: null, notes: 'Mixed lengths' },
] as never)

const sumValue = (items: Item[]) => items.reduce((a, i) => a + (i.value ?? 0) * (i.qty ?? 1), 0)

export function Inventories() {
  const rows = useRows<Item>('inventory_items')
  const [open, setOpen] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const lists = new Map<string, Item[]>()
  for (const r of rows ?? []) lists.set(r.list, [...(lists.get(r.list) ?? []), r])
  const start = (n: string) => { const v = n.trim(); if (!v) return; setNaming(false); setName(''); setOpen(v) }
  return (
    <section class="card">
      <div class="card-h"><h2>Inventories</h2>{!naming && <button class="btn ghost sm" onClick={() => setNaming(true)}><Icon name="plus" size={16} />New</button>}</div>
      {!lists.size && !naming && <p class="faint small" style="margin-bottom:10px">Keep track of what you own, list by list. Start one when you’re ready.</p>}
      {[...lists].sort((a, b) => a[0].localeCompare(b[0])).map(([l, items]) => (
        <button class="inv-list" onClick={() => setOpen(l)}>
          <span class="grow"><b>{l}</b><div class="faint tiny">{items.length} item{items.length === 1 ? '' : 's'}{sumValue(items) ? ` · about $${Math.round(sumValue(items))}` : ''}</div></span><Icon name="chev" />
        </button>
      ))}
      {naming && <div class="row" style="gap:8px;margin-top:6px">
        <input class="input grow" autoFocus placeholder="Name it, like Kitchen" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') start(name) }} />
        <button class="btn sm primary" onClick={() => start(name)}>Start</button>
      </div>}
      {(naming || !lists.size) && <div class="chips" style="margin-top:8px">{IDEAS.filter((i) => !lists.has(i)).map((i) => <button class="chip small" onClick={() => start(i)}>+ {i}</button>)}</div>}
      <ListSheet list={open} items={open ? lists.get(open) ?? [] : []} onClose={() => setOpen(null)} />
    </section>
  )
}

export function ListSheet({ list, items, onClose }: { list: string | null; items: Item[]; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Partial<Item> | null>(null)
  const [quick, setQuick] = useState('')
  async function add() {
    const n = quick.trim(); if (!n || !list) return
    setQuick('')
    // "3 HDMI cables" sets the quantity.
    const m = n.match(/^(\d+)\s*x?\s+(.+)$/i)
    await addRow('inventory_items', { list, name: m ? m[2] : n, qty: m ? Number(m[1]) : 1, category: null, location: null, value: null, acquired_on: null, notes: null }).catch(() => {})
  }
  async function save() {
    if (!edit?.id) return
    const { id, created_at: _c, ...rest } = edit as Item
    await patchRow('inventory_items', id, { ...rest, name: rest.name?.trim() || 'Item' }).catch(() => {})
    setEdit(null)
  }
  async function takeOut(i: Item) { setEdit(null); await dropRow('inventory_items', i.id).catch(() => {}); toast(`Removed ${i.name}`) }
  const cats = [...new Set(items.map((i) => i.category).filter(Boolean))] as string[]
  const shown = items.filter((i) => !q || `${i.name} ${i.category ?? ''} ${i.location ?? ''} ${i.notes ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.category ?? '~').localeCompare(b.category ?? '~') || a.name.localeCompare(b.name))
  const set = (k: keyof Item, v: string) => setEdit({ ...edit, [k]: k === 'qty' || k === 'value' ? (v === '' ? null : Number(v)) : v || null })
  return (
    <Sheet open={!!list} onClose={() => { setEdit(null); onClose() }} title={list ?? ''} wide>
      {edit ? <>
        <label class="field"><span>Name</span><input class="input" value={edit.name ?? ''} onInput={(e) => set('name', (e.target as HTMLInputElement).value)} /></label>
        <div class="row">
          <label class="field grow"><span>How many</span><input class="input" type="number" inputMode="numeric" value={edit.qty ?? ''} onInput={(e) => set('qty', (e.target as HTMLInputElement).value)} /></label>
          <label class="field grow"><span>Worth each ($)</span><input class="input" type="number" inputMode="decimal" value={edit.value ?? ''} onInput={(e) => set('value', (e.target as HTMLInputElement).value)} /></label>
        </div>
        <div class="row">
          <label class="field grow"><span>Group</span><input class="input" list="inv-cats" placeholder="Kitchen, tops, sensors" value={edit.category ?? ''} onInput={(e) => set('category', (e.target as HTMLInputElement).value)} /></label>
          <label class="field grow"><span>Where it is</span><input class="input" placeholder="Closet, bin 2" value={edit.location ?? ''} onInput={(e) => set('location', (e.target as HTMLInputElement).value)} /></label>
        </div>
        <datalist id="inv-cats">{cats.map((c) => <option value={c} />)}</datalist>
        <label class="field"><span>Notes</span><input class="input" placeholder="Model, size, serial, receipt link" value={edit.notes ?? ''} onInput={(e) => set('notes', (e.target as HTMLInputElement).value)} /></label>
        <button class="btn primary block" onClick={save}>Save</button>
        <div class="row" style="gap:8px;margin-top:8px"><button class="btn ghost grow" onClick={() => setEdit(null)}>Back</button><button class="btn ghost danger grow" onClick={() => takeOut(edit as Item)}><Icon name="trash" size={16} />Remove</button></div>
      </> : <>
        <div class="row" style="gap:8px;margin-bottom:10px">
          <input class="input grow" placeholder="Add an item, like 3 HDMI cables" value={quick} onInput={(e) => setQuick((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
          {quick.trim() && <button class="btn sm primary" onClick={add}>Add</button>}
        </div>
        {items.length > 8 && <input class="input" style="margin-bottom:10px;border-radius:999px" placeholder={`Search ${list}`} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />}
        {!items.length && <p class="faint small">Nothing here yet. Add the first thing above. You can also ask Claude to fill it from a photo or a list.</p>}
        {shown.map((i, n) => <>
          {i.category && (n === 0 || shown[n - 1].category !== i.category) && <div class="due-day faint tiny">{i.category}</div>}
          <button class="inv-item" onClick={() => setEdit(i)}>
            <span class="grow" style="min-width:0"><div class="ellipsis">{i.name}</div>{(i.location || i.notes) && <div class="faint tiny ellipsis">{[i.location, i.notes].filter(Boolean).join(' · ')}</div>}</span>
            {(i.qty ?? 1) > 1 && <span class="pill">×{i.qty}</span>}
          </button>
        </>)}
      </>}
    </Sheet>
  )
}
