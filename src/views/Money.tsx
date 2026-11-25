import { useEffect, useState } from 'preact/hooks'
import { supabase } from '../lib/supabase'
import { getState, useStore, toast } from '../lib/store'
import { saveProfile } from '../lib/db'
import { useRows } from '../lib/rows'
import { fmtShort, daysUntil, today, relTime, dayKey, addDays, fromKey, daysBetween } from '../lib/dates'
import { Card, Sheet } from '../ui/kit'
import { Icon } from '../ui/icons'

/** Money from Monarch: read once into fin_* tables (Claude refreshes them), shown here. Read-only. */
type Acct = { ext_id: string; name: string; institution: string | null; type: string | null; balance: number | null; apr: number | null; min_payment: number | null; hidden: boolean; as_of: string }
type Month = { month: string; category: string; amount: number }
type Rec = { ext_id: string; kind: 'income' | 'expense' | 'card'; name: string; category: string | null; amount: number | null; frequency: string | null; next_date: string | null; last_paid: string | null }
type Tx = { ext_id: string; day: string; merchant: string | null; category: string | null; amount: number; account: string | null; pending: boolean }
type Fin = { accounts: Acct[]; months: Month[]; recurring: Rec[]; tx: Tx[] }

const INCOME = new Set(['Paychecks', 'Interest', 'Other Income', 'Dividends & Capital Gains', 'ATM Deposit'])
const usd = (n: number, cents = false) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
const monthName = (m: string) => new Date(m + 'T12:00:00').toLocaleDateString([], { month: 'short' })
const CASH = /checking|savings/i, INVEST = /ira|brokerage|401k|invest/i, CARD = /credit/i

const demoFin = (): Fin => {
  const now = new Date().toISOString()
  const m = (k: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - k); return d.toISOString().slice(0, 8) + '01' }
  const cats: [string, number][] = [['Rent', -1100], ['Groceries', -220], ['Shopping', -260], ['Restaurants & Bars', -120], ['Gas', -200], ['Subscriptions', -55], ['Paychecks', 3400]]
  return {
    accounts: [
      { ext_id: '1', name: 'Checking', institution: 'Demo Bank', type: 'Checking', balance: 2400, apr: null, min_payment: null, hidden: false, as_of: now },
      { ext_id: '2', name: 'High Yield Savings', institution: 'Demo Bank', type: 'Savings', balance: 5200, apr: null, min_payment: null, hidden: false, as_of: now },
      { ext_id: '3', name: 'Roth IRA', institution: 'Demo Broker', type: 'IRA', balance: 8100, apr: null, min_payment: null, hidden: false, as_of: now },
      { ext_id: '4', name: 'Credit card', institution: 'Demo Card', type: 'Credit Card', balance: -310, apr: 24.9, min_payment: 35, hidden: false, as_of: now },
    ],
    months: [3, 2, 1, 0].flatMap((k) => cats.map(([c, a]) => ({ month: m(k), category: c, amount: Math.round(a * (k === 0 ? 0.6 : 0.85 + ((k * 7 + c.length) % 5) / 10)) }))),
    recurring: [
      { ext_id: 'r1', kind: 'expense', name: 'Rent', category: 'Rent', amount: -1100, frequency: 'monthly', next_date: new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10), last_paid: today() },
      { ext_id: 'r2', kind: 'expense', name: 'Phone', category: 'Phone', amount: -45, frequency: 'monthly', next_date: new Date(Date.now() + 12 * 864e5).toISOString().slice(0, 10), last_paid: today() },
      { ext_id: 'r3', kind: 'income', name: 'Paycheck', category: 'Paychecks', amount: 1700, frequency: 'biweekly', next_date: new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10), last_paid: today() },
    ],
    tx: [
      { ext_id: 't1', day: today(), merchant: 'Grocery store', category: 'Groceries', amount: -42.18, account: 'Credit card', pending: true },
      { ext_id: 't2', day: today(), merchant: 'Coffee', category: 'Restaurants & Bars', amount: -5.25, account: 'Credit card', pending: false },
    ],
  }
}

export function useFin() {
  const [fin, setFin] = useState<Fin | null | undefined>(undefined)
  useEffect(() => {
    if (getState().demo) { setFin(demoFin()); return }
    Promise.all([
      supabase.from('fin_accounts').select('*'),
      supabase.from('fin_monthly').select('month,category,amount').order('month'),
      supabase.from('fin_recurring').select('*'),
      supabase.from('fin_transactions').select('*').order('day', { ascending: false }).limit(60),
    ]).then(([a, m, r, t]) => {
      if (a.error || !a.data?.length) { setFin(null); return }
      setFin({ accounts: a.data as Acct[], months: (m.data ?? []) as Month[], recurring: (r.data ?? []) as Rec[], tx: (t.data ?? []) as Tx[] })
    })
  }, [])
  return fin
}

/** What the money card works from, kept on your profile (settings.money). Monarch stays the source of truth for balances. */
type Goal = { key: string; name: string; target: number; saved?: number; by?: string | null; from?: 'savings' }
type MoneySet = { normalMonth: number; payday: string; liz?: { amount: number; youOwe: boolean; note?: string; asOf?: string }; bills: { name: string; amount: number; day: number; estimate?: boolean }[]; goals: Goal[] }
const DEMO_MONEY: MoneySet = { normalMonth: 1500, payday: dayKey(addDays(new Date(), -5)), liz: { amount: 40, youOwe: true }, bills: [{ name: 'Rent share', amount: 700, day: 3 }], goals: [{ key: 'emergency', name: 'Emergency fund', target: 8000, from: 'savings' }, { key: 'car', name: 'Car fund', target: 3000, saved: 400, by: '2027-08-31' }] }

/** The next payday on a two-week cycle from a known one. */
const nextPayday = (anchor: string) => { let d = fromKey(anchor); while (dayKey(d) <= today()) d = addDays(d, 14); return dayKey(d) }
/** The next date a monthly bill on day N falls. */
const nextOn = (day: number) => { const t = new Date(); const d = new Date(t.getFullYear(), t.getMonth(), day); if (dayKey(d) < today()) d.setMonth(d.getMonth() + 1); return dayKey(d) }
type DocRow = { id: string; name: string; expires_on: string | null }

/** Safe to spend until payday, months of runway, what's between you and Liz, the next money dates and three goals. */
function MoneyCard({ fin }: { fin: Fin }) {
  const demo = useStore((s) => s.demo)
  const saved = useStore((s) => s.profile?.settings?.money as MoneySet | undefined)
  const m = saved ?? (demo ? DEMO_MONEY : undefined)
  const docs = useRows<DocRow>('records')
  const [edit, setEdit] = useState(false)
  const [why, setWhy] = useState(false)
  if (!m) return null
  const live = fin.accounts.filter((a) => !a.hidden && a.balance != null)
  const sum = (re: RegExp) => live.filter((a) => re.test(a.type ?? '')).reduce((s, a) => s + (a.balance ?? 0), 0)
  const checking = sum(/checking/i), savings = sum(/savings/i), cards = -sum(CARD)
  const pay = nextPayday(m.payday)
  const billsDue = m.bills.map((b) => ({ ...b, on: nextOn(b.day) })).filter((b) => b.on < pay)
  const lizOwed = m.liz?.youOwe ? m.liz.amount : 0
  const safe = checking - cards - billsDue.reduce((a, b) => a + b.amount, 0) - lizOwed
  const runway = (checking + savings) / (m.normalMonth || 1)
  const tone = runway >= 6 ? 'var(--mint)' : runway >= 3 ? 'var(--gold)' : 'var(--coral)'
  const days = daysBetween(today(), pay)
  const dates = [
    { on: pay, label: 'Payday' },
    ...m.bills.map((b) => ({ on: nextOn(b.day), label: b.name.replace(/ \(.*\)/, '') })),
    ...(docs ?? []).filter((d) => d.expires_on && daysUntil(d.expires_on) >= 0 && daysUntil(d.expires_on) <= 60).map((d) => ({ on: d.expires_on!, label: `${d.name} ends` })),
  ].sort((a, b) => a.on.localeCompare(b.on)).slice(0, 4)
  return (
    <section class="card money-card">
      <button class="mc-top" onClick={() => setWhy(!why)} aria-expanded={why}>
        <span class="faint small">Safe to spend until payday</span>
        <b class="mc-big">{usd(Math.max(0, safe))}</b>
        <span class="faint tiny">{days === 0 ? 'Payday is today' : `${days} day${days === 1 ? '' : 's'}, through ${fmtShort(pay)}`} · tap for how</span>
      </button>
      {why && <div class="mc-why small">
        <div class="row between"><span>Checking</span><span>{usd(checking)}</span></div>
        <div class="row between"><span>Card balances</span><span>−{usd(cards)}</span></div>
        {billsDue.map((b) => <div class="row between"><span>{b.name}{b.estimate ? ' (about)' : ''}, {fmtShort(b.on)}</span><span>−{usd(b.amount)}</span></div>)}
        {lizOwed > 0 && <div class="row between"><span>What you owe Liz</span><span>−{usd(lizOwed)}</span></div>}
      </div>}
      <div class="mc-row">
        <div><b style={`color:${tone}`}>{runway.toFixed(1)}</b><span>months of runway</span></div>
        {m.liz && <button onClick={() => setEdit(true)}><b>{m.liz.amount ? usd(m.liz.amount) : 'Even'}</b><span>{m.liz.amount ? (m.liz.youOwe ? 'you owe Liz' : 'Liz owes you') : 'with Liz'}</span></button>}
      </div>
      <div class="mc-dates">{dates.map((d) => <div class="row between small"><span>{d.label}</span><span class="faint">{fmtShort(d.on)}</span></div>)}</div>
      <div class="mc-goals">
        {m.goals.map((g) => {
          const have = g.from === 'savings' ? savings : g.saved ?? 0
          const p = Math.min(1, have / g.target)
          return (
            <button class="mc-goal" onClick={() => setEdit(true)}>
              <div class="row between small"><span>{g.name}</span><span class="faint">{usd(have)} of {usd(g.target)}{g.by ? ` · by ${fmtShort(g.by)}` : ''}</span></div>
              <div class="cat-bar"><i style={`width:${p * 100}%;${p >= 1 ? 'background:var(--mint)' : ''}`} /></div>
            </button>
          )
        })}
      </div>
      <button class="faint tiny" style="margin-top:8px" onClick={() => setEdit(true)}><Icon name="edit" size={12} /> Edit these numbers</button>
      <MoneyEdit open={edit} m={m} onClose={() => setEdit(false)} />
    </section>
  )
}

function MoneyEdit({ open, m, onClose }: { open: boolean; m: MoneySet; onClose: () => void }) {
  const [f, setF] = useState<MoneySet>(m)
  useEffect(() => { if (open) setF(JSON.parse(JSON.stringify(m))) }, [open])
  const num = (v: string) => Number(v.replace(/[^0-9.]/g, '')) || 0
  async function save() { onClose(); await saveProfile({ settings: { money: { ...f, liz: f.liz ? { ...f.liz, asOf: today() } : f.liz } } }).then(() => toast('Saved')).catch(() => {}) }
  return (
    <Sheet open={open} onClose={onClose} title="Money numbers">
      <div class="row">
        <label class="field grow"><span>A normal month costs</span><input class="input" inputMode="decimal" value={f.normalMonth} onInput={(e) => setF({ ...f, normalMonth: num((e.target as HTMLInputElement).value) })} /></label>
        <label class="field grow"><span>A recent payday</span><input class="input" type="date" value={f.payday} onInput={(e) => setF({ ...f, payday: (e.target as HTMLInputElement).value || f.payday })} /></label>
      </div>
      {f.liz && <div class="field"><span>Shared costs with Liz</span>
        <div class="row" style="gap:8px">
          <input class="input" style="max-width:120px" inputMode="decimal" value={f.liz.amount} onInput={(e) => setF({ ...f, liz: { ...f.liz!, amount: num((e.target as HTMLInputElement).value) } })} />
          <div class="seg grow"><button class={f.liz.youOwe ? 'on' : ''} onClick={() => setF({ ...f, liz: { ...f.liz!, youOwe: true } })}>You owe</button><button class={!f.liz.youOwe ? 'on' : ''} onClick={() => setF({ ...f, liz: { ...f.liz!, youOwe: false } })}>Liz owes</button></div>
        </div>
        {f.liz.note && <p class="faint tiny" style="margin-top:6px">{f.liz.note}</p>}
      </div>}
      {f.bills.map((b, i) => <div class="row">
        <label class="field grow"><span>{b.name}</span><input class="input" inputMode="decimal" value={b.amount} onInput={(e) => { const bills = [...f.bills]; bills[i] = { ...b, amount: num((e.target as HTMLInputElement).value) }; setF({ ...f, bills }) }} /></label>
        <label class="field" style="width:90px"><span>Day</span><input class="input" inputMode="numeric" value={b.day} onInput={(e) => { const bills = [...f.bills]; bills[i] = { ...b, day: Math.min(28, Math.max(1, num((e.target as HTMLInputElement).value))) }; setF({ ...f, bills }) }} /></label>
      </div>)}
      {f.goals.map((g, i) => <label class="field"><span>{g.name}: {g.from === 'savings' ? `goal (saved counts your savings accounts)` : 'saved so far'}</span>
        <input class="input" inputMode="decimal" value={g.from === 'savings' ? g.target : g.saved ?? 0} onInput={(e) => { const goals = [...f.goals]; goals[i] = g.from === 'savings' ? { ...g, target: num((e.target as HTMLInputElement).value) } : { ...g, saved: num((e.target as HTMLInputElement).value) }; setF({ ...f, goals }) }} /></label>)}
      <button class="btn primary block" onClick={save}>Save</button>
    </Sheet>
  )
}

export function MoneyPanel() {
  const fin = useFin()
  const [allTx, setAllTx] = useState(false)
  if (fin === undefined) return <div class="card skeleton" style="height:120px" />
  if (fin === null) return null

  const live = fin.accounts.filter((a) => !a.hidden && a.balance != null)
  const hidden = fin.accounts.filter((a) => a.hidden)
  const total = (re: RegExp) => live.filter((a) => re.test(a.type ?? '')).reduce((s, a) => s + (a.balance ?? 0), 0)
  const cash = total(CASH), invested = total(INVEST), owed = -total(CARD)
  const asOf = fin.accounts.reduce((m, a) => (a.as_of > m ? a.as_of : m), '')

  // Spending per month (expense categories only, refunds net out).
  const months = [...new Set(fin.months.map((x) => x.month))].sort()
  const spendBy = (m: string) => -fin.months.filter((x) => x.month === m && !INCOME.has(x.category)).reduce((s, x) => s + x.amount, 0)
  const thisMonth = today().slice(0, 8) + '01'
  const series = months.map((m) => ({ m, v: Math.max(0, spendBy(m)), partial: m === thisMonth }))
  const peak = Math.max(1, ...series.map((s) => s.v))

  // Categories over the last three full months.
  const full = months.filter((m) => m < thisMonth).slice(-3)
  const catTotals = new Map<string, number>()
  for (const x of fin.months) if (full.includes(x.month) && !INCOME.has(x.category)) catTotals.set(x.category, (catTotals.get(x.category) ?? 0) - x.amount)
  const cats = [...catTotals].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 7)
  const catPeak = Math.max(1, ...cats.map(([, v]) => v))

  // Bills in the next 30 days, and recurring items Monarch hasn't seen lately.
  const bills = fin.recurring.filter((r) => r.kind !== 'income' && r.next_date && daysUntil(r.next_date) >= -2 && daysUntil(r.next_date) <= 30 && (r.amount ?? 0) !== 0)
    .sort((a, b) => a.next_date!.localeCompare(b.next_date!))
  const stale = (r: Rec) => r.last_paid != null && daysUntil(r.last_paid) < -100
  const pay = fin.recurring.find((r) => r.kind === 'income')
  const tx = fin.tx.filter((t) => !(t.category === 'Interest' && Math.abs(t.amount) < 1)).slice(0, allTx ? 60 : 8)

  return <>
    <MoneyCard fin={fin} />
    <div class="stat-row">
      <div class="stat" style="--c:var(--mint)"><div class="s-val">{usd(cash)}</div><div class="s-lbl">cash</div></div>
      <div class="stat" style="--c:var(--violet)"><div class="s-val">{usd(invested)}</div><div class="s-lbl">invested</div></div>
      <div class="stat" style="--c:var(--orange)"><div class="s-val">{usd(owed)}</div><div class="s-lbl">on cards</div></div>
    </div>
    {hidden.length > 0 && <section class="card note-card" style="--accent:var(--gold)">
      <p class="small"><b>Monarch isn’t sharing {hidden.map((h) => h.name).join(' or ')}.</b> Your paycheck and rent go through there, so income and rent stop after September here. Moving them to another connection in Monarch (Settings, then Institutions) fixes it.</p>
    </section>}
    <div class="grid-2">
      <div>
        <Card title="Spending by month" icon="wallet" accent="var(--gold)">
          <div class="mbars">{series.map((s) => <div class="mbar"><span class="mb-v">{usd(s.v)}</span><i style={`height:${Math.max(4, (s.v / peak) * 100)}%`} class={s.partial ? 'partial' : ''} /><span class="faint tiny">{monthName(s.m)}{s.partial ? ' so far' : ''}</span></div>)}</div>
          {hidden.length > 0 && <p class="faint tiny" style="margin-top:8px">Missing what goes through the unshared accounts.</p>}
        </Card>
        {cats.length > 0 && <Card title={`Where it goes · ${monthName(full[0]!)} to ${monthName(full[full.length - 1]!)}`} icon="layers">
          {cats.map(([c, v]) => <div class="cat-row"><div class="row between small"><span>{c}</span><span class="faint">{usd(v / full.length)}/mo</span></div><div class="cat-bar"><i style={`width:${(v / catPeak) * 100}%`} /></div></div>)}
        </Card>}
      </div>
      <div>
        <Card title="Coming up" icon="cal" accent="var(--orange)">
          {pay?.next_date && <div class="row between small fin-row"><span>{pay.name}</span><span class="pos">{usd(pay.amount ?? 0, true)} · {fmtShort(pay.next_date)}</span></div>}
          {bills.length ? bills.map((b) => <div class="fin-row"><div class="row between small"><span>{b.name}</span><span>{usd(b.amount ?? 0, true)} · {fmtShort(b.next_date!)}</span></div>
            {stale(b) && <div class="faint tiny">Monarch last saw this {fmtShort(b.last_paid!)}. Still real?</div>}</div>) : <p class="muted small">No bills in the next 30 days.</p>}
        </Card>
        <Card title="Recent" icon="clock" action={fin.tx.length > 8 && <button class="link" onClick={() => setAllTx(!allTx)}>{allTx ? 'Less' : 'All'}</button>}>
          {tx.map((t) => <div class="row between small fin-row"><span class="grow" style="min-width:0"><div class="ellipsis">{t.merchant}{t.pending && <span class="faint"> · pending</span>}</div><div class="faint tiny">{fmtShort(t.day)} · {t.category}</div></span><span class={t.amount > 0 ? 'pos' : ''}>{usd(t.amount, true)}</span></div>)}
        </Card>
        <Card title="Accounts" icon="layers">
          {live.sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0)).map((a) => <div class="row between small fin-row"><span><div>{a.name}</div><div class="faint tiny">{a.institution}{a.apr ? ` · ${a.apr}% APR` : ''}</div></span><span class={(a.balance ?? 0) < 0 ? 'neg' : ''}>{usd(a.balance ?? 0, true)}</span></div>)}
          <p class="faint tiny" style="margin-top:8px">Read from Monarch {asOf ? relTime(asOf) : ''}. Nothing here can change Monarch.</p>
        </Card>
      </div>
    </div>
  </>
}
