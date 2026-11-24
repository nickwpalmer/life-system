import { useState } from 'preact/hooks'
import { useRows, addRow, patchRow, dropRow, registerDemo } from '../lib/rows'
import { useStore, toast, areaByKey } from '../lib/store'
import { fmtDay, today, inDays } from '../lib/dates'
import type { Task } from '../lib/types'
import { RecCard, RecordEditor, expState, type Rec } from './Records'
import { ListSheet, type Item as InvItem } from './Inventory'
import { TaskRow, TaskSheet, AddTask, openTask } from './Tasks'
import { Icon } from '../ui/icons'
import { Card, PageHead, Sheet } from '../ui/kit'

/**
 * Assets: the things you need to function, like your car and your apartment.
 * Each one has a page that pulls together its records (records.asset_id), its maintenance log (asset_logs),
 * its open tasks (tasks tagged with assets.tag) and, for a home, its inventory list (assets.inventory_list).
 * They live inside Records, at the top, so expiry warnings keep working in one place.
 */
export type Asset = {
  id: string; name: string; kind: 'vehicle' | 'home' | 'other'; tag: string | null; details: string | null
  inventory_list: string | null; notes: string | null; sort: number
}
export type Log = { id: string; asset_id: string; done_on: string; what: string; miles: number | null; cost: number | null; where_done: string | null; notes: string | null }

const KIND = {
  vehicle: { icon: 'car', c: 'var(--sky)', label: 'Vehicle', starters: [['Registration', 'vehicle', true], ['Car insurance', 'insurance', true], ['Parking pass', 'vehicle', true], ['Title', 'vehicle', false]] as [string, string, boolean][] },
  home: { icon: 'home', c: 'var(--peach)', label: 'Home', starters: [['Lease', 'housing', false], ['Renters insurance', 'insurance', true]] as [string, string, boolean][] },
  other: { icon: 'layers', c: 'var(--lilac)', label: 'Other', starters: [] as [string, string, boolean][] },
}

registerDemo('assets', () => [
  { id: 'as1', name: '2018 Hatchback', kind: 'vehicle', tag: 'car', details: 'Rattle from the back left on bumps.', inventory_list: null, notes: null, sort: 1 },
  { id: 'as2', name: 'Apartment', kind: 'home', tag: 'apartment', details: 'Two bedroom, second floor.', inventory_list: 'Apartment', notes: null, sort: 2 },
] as never)
registerDemo('asset_logs', () => [
  { id: 'al1', asset_id: 'as1', done_on: inDays(-60), what: 'Oil change', miles: 84200, cost: 49, where_done: 'Quick lube', notes: null },
  { id: 'al2', asset_id: 'as1', done_on: inDays(-200), what: 'New front tires', miles: 80100, cost: 260, where_done: null, notes: null },
] as never)

const findAsset = (list: Asset[] | null, ref: string) => list?.find((a) => a.id === ref || a.tag === ref)
const href = (a: Asset) => `#/records/${a.tag || a.id}`
const money = (n: number) => `$${Math.round(n).toLocaleString()}`

/** The row of assets at the top of Records. */
export function AssetsStrip() {
  const assets = useRows<Asset>('assets')
  const recs = useRows<Rec>('records')
  const tasks = useStore((s) => s.tasks)
  const [adding, setAdding] = useState(false)
  if (!assets) return null
  return (
    <section class="card">
      <div class="card-h"><h2>Your things</h2><button class="btn ghost sm" onClick={() => setAdding(true)}><Icon name="plus" size={16} />Add</button></div>
      {!assets.length && <p class="faint small">Add your car or your place to keep its papers, repairs and to-dos on one page.</p>}
      <div class="asset-grid">{assets.map((a) => {
        const k = KIND[a.kind] ?? KIND.other
        const open = a.tag ? tasks.filter((t) => openTask(t) && t.tags?.includes(a.tag!)).length : 0
        const warn = (recs ?? []).filter((r) => r.asset_id === a.id && (expState(r) === 'expired' || expState(r) === 'soon')).length
        return (
          <a class="asset" href={href(a)} style={`--c:${k.c}`}>
            <span class="m-ico"><Icon name={k.icon} size={18} /></span>
            <span class="grow" style="min-width:0"><b class="ellipsis" style="display:block">{a.name}</b>
              <span class="faint tiny">{[open ? `${open} to do` : 'Nothing to do', warn ? `${warn} record${warn === 1 ? '' : 's'} need a look` : ''].filter(Boolean).join(' · ')}</span></span>
            {warn > 0 && <span class="dot" style="background:var(--gold)" />}
            <Icon name="chev" size={18} />
          </a>
        )
      })}</div>
      <AssetSheet asset={adding ? {} : null} onClose={() => setAdding(false)} />
    </section>
  )
}

/** One asset's page: records, maintenance, tasks, inventory. */
export function AssetPage({ ref_ }: { ref_: string }) {
  const assets = useRows<Asset>('assets')
  const recs = useRows<Rec>('records')
  const logs = useRows<Log>('asset_logs')
  const inv = useRows<InvItem>('inventory_items')
  const tasks = useStore((s) => s.tasks)
  const [editRec, setEditRec] = useState<Rec | Partial<Rec> | null>(null)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [editLog, setEditLog] = useState<Partial<Log> | null>(null)
  const [editAsset, setEditAsset] = useState<Partial<Asset> | null>(null)
  const [invOpen, setInvOpen] = useState(false)
  const [allLogs, setAllLogs] = useState(false)
  if (!assets) return <div class="skeleton" />
  const a = findAsset(assets, ref_)
  if (!a) return <><PageHead title="Not found" back="#/records" /><div class="card"><p class="muted">That isn’t one of your things anymore.</p></div></>
  const k = KIND[a.kind] ?? KIND.other
  const mine = (recs ?? []).filter((r) => r.asset_id === a.id).sort((x, y) => ({ expired: 0, soon: 1, ok: 2, none: 3 })[expState(x)] - ({ expired: 0, soon: 1, ok: 2, none: 3 })[expState(y)])
  const missing = k.starters.filter(([n]) => !mine.some((r) => r.name.toLowerCase().includes(n.toLowerCase().replace(/^car /, ''))))
  const open = a.tag ? tasks.filter((t) => openTask(t) && t.tags?.includes(a.tag!)).sort((x, y) => (x.due_date ?? '9').localeCompare(y.due_date ?? '9')) : []
  const log = (logs ?? []).filter((l) => l.asset_id === a.id)
  const spent = log.filter((l) => l.done_on >= `${new Date().getFullYear()}-01-01`).reduce((s, l) => s + (l.cost ?? 0), 0)
  const items = a.inventory_list ? (inv ?? []).filter((i) => i.list === a.inventory_list) : []
  const home = areaByKey('home')
  return (
    <>
      <PageHead title={a.name} sub={k.label} back="#/records" icon={k.icon} color={k.c}
        action={<button class="btn ghost sm" onClick={() => setEditAsset(a)}><Icon name="edit" size={16} />Edit</button>} />
      {(a.details || a.notes) && <div class="card soft">{a.details && <p>{a.details}</p>}{a.notes && <p class="muted small" style="margin-top:6px">{a.notes}</p>}</div>}

      <Card title="Records" icon="layers" accent={k.c}>
        {mine.length ? <div class="rec-grid">{mine.map((r) => <RecCard r={r} onOpen={() => setEditRec(r)} />)}</div> : <p class="faint small">Nothing linked yet.</p>}
        <div class="chips" style="margin-top:10px">
          {missing.map(([n, c, renews]) => <button class="chip small" onClick={() => setEditRec({ name: n, category: c, renews, asset_id: a.id, issuer: '', details: '', location: '', link: '', login_hint: '', expires_on: null, notes: '', pinned: false })}>+ {n}</button>)}
          <button class="chip small" onClick={() => setEditRec({ name: '', category: a.kind === 'home' ? 'housing' : a.kind === 'vehicle' ? 'vehicle' : 'other', asset_id: a.id, issuer: '', details: '', location: '', link: '', login_hint: '', expires_on: null, renews: false, notes: '', pinned: false })}>+ Other</button>
        </div>
      </Card>

      <Card title="To do" icon="tasks" accent={k.c}>
        <AddTask defaults={{ tags: a.tag ? [a.tag] : [], area_id: home?.id ?? null }} placeholder={`Add a ${a.kind === 'vehicle' ? 'car' : a.kind === 'home' ? 'home' : ''} task…`.replace('  ', ' ')} />
        {open.length ? open.map((t) => <TaskRow t={t} onOpen={setEditTask} />) : <p class="empty" style="padding:8px">Nothing open.</p>}
      </Card>

      <Card title={a.kind === 'home' ? 'Repairs and upkeep' : 'Maintenance'} icon="wrench" accent={k.c}
        action={<button class="btn ghost sm" onClick={() => setEditLog({ asset_id: a.id, done_on: today(), what: '', miles: null, cost: null, where_done: null, notes: null })}><Icon name="plus" size={16} />Log</button>}>
        {!log.length && <p class="faint small">Log oil changes, repairs and inspections here{a.kind === 'vehicle' ? ', with the mileage' : ''}.</p>}
        {log.slice(0, allLogs ? 999 : 6).map((l) => (
          <button class="gi-row gi-main" style="width:100%" onClick={() => setEditLog(l)}>
            <span class="grow" style="min-width:0"><div class="ellipsis">{l.what}</div>
              <div class="faint tiny ellipsis">{[fmtDay(l.done_on).replace(/^\w+, /, ''), l.miles != null ? `${l.miles.toLocaleString()} mi` : '', l.where_done ?? '', l.notes ?? ''].filter(Boolean).join(' · ')}</div></span>
            {l.cost != null && <span class="faint small">{money(l.cost)}</span>}
          </button>
        ))}
        {log.length > 6 && <button class="btn ghost sm block" style="margin-top:8px" onClick={() => setAllLogs(!allLogs)}>{allLogs ? 'Show less' : `All ${log.length}`}</button>}
        {spent > 0 && <p class="faint tiny" style="margin-top:8px">{money(spent)} this year.</p>}
      </Card>

      {(a.kind === 'home' || a.inventory_list) && (
        <Card title="Inventory" icon="list" accent={k.c}>
          <button class="inv-list" onClick={() => { if (!a.inventory_list) patchRow('assets', a.id, { inventory_list: a.name }).catch(() => {}); setInvOpen(true) }}>
            <span class="grow"><b>{a.inventory_list ?? a.name}</b><div class="faint tiny">{items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : 'Nothing listed yet'}</div></span><Icon name="chev" />
          </button>
        </Card>
      )}

      <RecordEditor rec={editRec} onClose={() => setEditRec(null)} />
      <TaskSheet task={editTask} onClose={() => setEditTask(null)} />
      <LogSheet log={editLog} vehicle={a.kind === 'vehicle'} onClose={() => setEditLog(null)} />
      <AssetSheet asset={editAsset} onClose={() => setEditAsset(null)} />
      <ListSheet list={invOpen ? a.inventory_list ?? a.name : null} items={items} onClose={() => setInvOpen(false)} />
    </>
  )
}

function LogSheet({ log, vehicle, onClose }: { log: Partial<Log> | null; vehicle: boolean; onClose: () => void }) {
  const [f, setF] = useState<Partial<Log> | null>(null)
  const cur = f && f.id === log?.id && f.asset_id === log?.asset_id ? f : log
  const set = (p: Partial<Log>) => setF({ ...cur, ...p })
  const num = (v: string) => v === '' ? null : Number(v)
  const txt = (v: string) => v.trim() ? v : null
  async function save() {
    if (!cur?.what?.trim()) { toast('Say what was done'); return }
    const { id, ...rest } = cur as Log
    const body = { ...rest, what: rest.what.trim() }
    if (id) await patchRow('asset_logs', id, body).catch(() => {})
    else await addRow('asset_logs', body).catch(() => {})
    setF(null); onClose()
  }
  return (
    <Sheet open={!!log} onClose={() => { setF(null); onClose() }} title={log?.id ? 'Edit entry' : 'Log it'}>
      {cur && <>
        {!cur.id && !cur.what && <div class="chips" style="margin-bottom:12px">{(vehicle ? ['Oil change', 'Tire rotation', 'New battery', 'Inspection', 'Repair'] : ['Repair', 'Maintenance request', 'Filter change', 'Cleaning']).map((w) => <button class="chip small" onClick={() => set({ what: w })}>{w}</button>)}</div>}
        <label class="field"><span>What</span><input class="input" value={cur.what ?? ''} onInput={(e) => set({ what: (e.target as HTMLInputElement).value })} /></label>
        <div class="row">
          <label class="field grow"><span>When</span><input class="input" type="date" value={cur.done_on ?? ''} onInput={(e) => set({ done_on: (e.target as HTMLInputElement).value || today() })} /></label>
          {vehicle && <label class="field grow"><span>Miles</span><input class="input" type="number" inputMode="numeric" value={cur.miles ?? ''} onInput={(e) => set({ miles: num((e.target as HTMLInputElement).value) })} /></label>}
          <label class="field grow"><span>Cost ($)</span><input class="input" type="number" inputMode="decimal" value={cur.cost ?? ''} onInput={(e) => set({ cost: num((e.target as HTMLInputElement).value) })} /></label>
        </div>
        <label class="field"><span>Where</span><input class="input" placeholder={vehicle ? 'Shop, or yourself' : 'Office, or yourself'} value={cur.where_done ?? ''} onInput={(e) => set({ where_done: txt((e.target as HTMLInputElement).value) })} /></label>
        <label class="field"><span>Notes</span><input class="input" value={cur.notes ?? ''} onInput={(e) => set({ notes: txt((e.target as HTMLInputElement).value) })} /></label>
        <button class="btn primary block" onClick={save}>Save</button>
        {cur.id && <button class="btn ghost danger block" style="margin-top:8px" onClick={async () => { await dropRow('asset_logs', cur.id!).catch(() => {}); setF(null); onClose() }}><Icon name="trash" size={16} />Remove</button>}
      </>}
    </Sheet>
  )
}

function AssetSheet({ asset, onClose }: { asset: Partial<Asset> | null; onClose: () => void }) {
  const [f, setF] = useState<Partial<Asset> | null>(null)
  const cur = f && f.id === asset?.id ? f : asset
  const set = (p: Partial<Asset>) => setF({ ...cur, ...p })
  async function save() {
    const name = cur?.name?.trim()
    if (!name) { toast('Give it a name'); return }
    const kind = cur!.kind ?? 'other'
    const tag = (cur!.tag ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-') || (kind === 'vehicle' ? 'car' : kind === 'home' ? 'home' : name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
    const body = { name, kind, tag, details: cur!.details?.trim() || null, notes: cur!.notes?.trim() || null, inventory_list: cur!.inventory_list ?? null }
    if (cur!.id) await patchRow('assets', cur!.id, body).catch(() => {})
    else { await addRow('assets', { ...body, sort: Date.now() % 1e6 }).catch(() => {}); location.hash = `#/records/${tag}` }
    setF(null); onClose()
  }
  return (
    <Sheet open={!!asset} onClose={() => { setF(null); onClose() }} title={asset?.id ? 'Edit' : 'Add a thing you own'}>
      {cur && <>
        <label class="field"><span>Name</span><input class="input" placeholder="2015 hatchback, the apartment" value={cur.name ?? ''} onInput={(e) => set({ name: (e.target as HTMLInputElement).value })} /></label>
        <div class="chips" style="margin-bottom:10px">{(Object.keys(KIND) as Asset['kind'][]).map((x) => <button class={`chip small ${(cur.kind ?? 'other') === x ? 'on' : ''}`} onClick={() => set({ kind: x })}>{KIND[x].label}</button>)}</div>
        <label class="field"><span>Details</span><textarea class="input" rows={3} placeholder="Model, quirks, what to know" value={cur.details ?? ''} onInput={(e) => set({ details: (e.target as HTMLTextAreaElement).value })} /></label>
        <label class="field"><span>Task tag</span><input class="input" placeholder={cur.kind === 'vehicle' ? 'car' : 'home'} value={cur.tag ?? ''} onInput={(e) => set({ tag: (e.target as HTMLInputElement).value })} /></label>
        <p class="faint tiny" style="margin:-6px 2px 12px">Tasks with this tag show on its page.</p>
        <label class="field"><span>Notes</span><input class="input" value={cur.notes ?? ''} onInput={(e) => set({ notes: (e.target as HTMLInputElement).value })} /></label>
        <button class="btn primary block" onClick={save}>Save</button>
      </>}
    </Sheet>
  )
}
