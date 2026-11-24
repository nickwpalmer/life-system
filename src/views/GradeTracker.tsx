import { useState } from 'preact/hooks'
import { useRows, addRow, patchRow, dropRow, registerDemo } from '../lib/rows'
import { today, fmtDay } from '../lib/dates'
import { toast } from '../lib/store'
import { Icon } from '../ui/icons'
import { Card, Sheet } from '../ui/kit'

/**
 * Grade tracker for one class: every graded thing (homework, quizzes, tests, the final), the course's
 * weights, a running grade, what's due next, and what you need on the final for each letter.
 * Weights live on the course (courses.data.grading); items live in grade_items.
 */
export type Cat = { cat: string; weight: number | null; rule?: 'complete'; pass?: number; maxMissing?: number }
export type Item = {
  id: string; course_id: string; category: string; name: string; score: number | null; possible: number | null
  due_on: string | null; status: 'todo' | 'done' | 'graded' | 'missing' | 'excused'; note: string | null; sort: number
}
type CourseLike = { id: string; code: string; data?: { grading?: Cat[] } | null }

registerDemo('grade_items', () => [
  { id: 'gi1', course_id: 'c0', category: 'Homework', name: 'HW 1', score: 18, possible: 20, due_on: '2026-09-10', status: 'graded', note: null, sort: 1 },
  { id: 'gi2', course_id: 'c0', category: 'Homework', name: 'HW 2', score: 4, possible: 20, due_on: '2026-09-17', status: 'missing', note: null, sort: 2 },
  { id: 'gi3', course_id: 'c0', category: 'Tests', name: 'Test 1', score: 81, possible: 100, due_on: '2026-10-01', status: 'graded', note: null, sort: 3 },
  { id: 'gi4', course_id: 'c0', category: 'Quizzes', name: 'Quiz 4', score: 9, possible: 10, due_on: '2026-10-20', status: 'graded', note: null, sort: 4 },
  { id: 'gi5', course_id: 'c0', category: 'Homework', name: 'HW 9', score: null, possible: 15, due_on: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10), status: 'todo', note: null, sort: 5 },
  { id: 'gi6', course_id: 'c0', category: 'Final exam', name: 'Final exam', score: null, possible: null, due_on: '2026-12-18', status: 'todo', note: null, sort: 6 },
] as never)

const DEMO_GRADING: Cat[] = [{ cat: 'Final exam', weight: 30 }, { cat: 'Tests', weight: 45 }, { cat: 'Quizzes', weight: 15 }, { cat: 'Homework', weight: 10, rule: 'complete', pass: 70, maxMissing: 8 }]
const CUT: [string, number][] = [['A', 93], ['B', 83], ['C', 73], ['D', 60]]
const pctOf = (i: Item) => i.score == null ? null : i.possible ? (i.score / i.possible) * 100 : i.score
const fmt = (n: number) => `${Math.round(n * 10) / 10}`.replace(/\.0$/, '')

/** One category's standing. Completion categories (homework) count incompletes against an allowance. */
export function catStanding(c: Cat, items: Item[]) {
  const mine = items.filter((i) => i.category === c.cat && i.status !== 'excused')
  if (c.rule === 'complete') {
    const pass = c.pass ?? 70
    const inc = mine.filter((i) => i.status === 'missing' || (i.score != null && (pctOf(i) ?? 0) < pass)).length
    const known = mine.filter((i) => i.status === 'missing' || i.score != null || i.status === 'done').length
    const max = c.maxMissing ?? Infinity
    // Past due with nothing recorded: might be an incomplete, so it counts as a risk until you mark it.
    const t0 = new Date().toISOString().slice(0, 10)
    const maybe = mine.filter((i) => i.status === 'todo' && i.due_on && i.due_on < t0).length
    return { pct: known ? (inc <= max ? 100 : 0) : null, inc, maybe, left: max === Infinity ? null : max - inc, n: mine.length }
  }
  const g = mine.map(pctOf).filter((v): v is number => v != null)
  return { pct: g.length ? g.reduce((a, b) => a + b, 0) / g.length : null, inc: 0, maybe: 0, left: null, n: mine.length }
}

export function computeGrade(cats: Cat[], items: Item[]) {
  let s = 0, w = 0, scored = 0
  const rows = cats.map((c) => { const st = catStanding(c, items); if (c.weight && st.pct != null) { s += c.weight * st.pct; w += c.weight; if (c.rule !== 'complete') scored += c.weight } return { c, ...st } })
  // A completion category alone (homework done or not) says little about the grade, so wait for real scores.
  return { pct: w && scored ? s / w : null, rows, weighted: scored ? w : 0, unweighted: cats.filter((c) => c.weight == null).map((c) => c.cat) }
}

/**
 * Two what-ifs: nothing else gets turned in (everything open scores 0, open homework counts as incomplete),
 * and full catch-up (everything open scores full marks, incomplete homework gets redone).
 * Items with a final grade stay as they are; the final exam is left out of both.
 */
function scenarios(cats: Cat[], items: Item[]) {
  const fin = cats.find((c) => /final/i.test(c.cat))
  const rest = cats.filter((c) => c !== fin)
  const open = (i: Item) => i.status === 'todo' || i.status === 'missing'
  const none = items.map((i) => i.status === 'todo' ? { ...i, status: 'missing' as const, score: 0, possible: i.possible ?? 100 } : i)
  const all = items.map((i) => open(i) ? { ...i, status: 'graded' as const, score: i.possible ?? 100, possible: i.possible ?? 100 } : i)
  const a = computeGrade(rest, none).pct, b = computeGrade(rest, all).pct
  return a == null || b == null ? null : { none: a, all: b }
}

/** What the final needs for each letter, if everything else stays where it is. */
function finalNeeds(cats: Cat[], items: Item[]) {
  const fin = cats.find((c) => /final/i.test(c.cat))
  if (!fin?.weight) return null
  const finItems = items.filter((i) => i.category === fin.cat)
  if (finItems.some((i) => i.score != null)) return null
  const others = computeGrade(cats.filter((c) => c !== fin), items)
  if (others.pct == null) return null
  const W = others.weighted + fin.weight
  return CUT.map(([l, t]) => ({ l, need: (t * W - others.pct! * others.weighted) / fin.weight! }))
}

const ST: Record<Item['status'], [string, string]> = {
  todo: ['To do', 'var(--faint)'], done: ['Turned in', 'var(--sky)'], graded: ['Graded', 'var(--mint)'], missing: ['Incomplete', 'var(--coral)'], excused: ['Doesn’t count', 'var(--faint)'],
}

export function GradeTracker({ course, color }: { course: CourseLike; color: string }) {
  const all = useRows<Item>('grade_items')
  const items = (all ?? []).filter((i) => i.course_id === course.id)
  const demoCourse = course.id === 'c0'
  const cats: Cat[] = course.data?.grading ?? (demoCourse ? DEMO_GRADING : [])
  const [edit, setEdit] = useState<Partial<Item> | null>(null)
  const [weights, setWeights] = useState(false)
  const [all2, setAll] = useState(false)
  if (!cats.length && !items.length) return (
    <Card title="Grade tracker" icon="target" accent={color}>
      <p class="faint small" style="margin-bottom:10px">Add the syllabus weights and your scores and this works out your grade and what you need on the final.</p>
      <button class="btn ghost sm" onClick={() => setWeights(true)}><Icon name="sliders" size={15} />Set up weights</button>
      <WeightsSheet open={weights} course={course} cats={cats} onClose={() => setWeights(false)} />
    </Card>
  )
  const g = computeGrade(cats, items)
  const needs = finalNeeds(cats, items)
  const sc = scenarios(cats, items)
  const hw = g.rows.find((r) => r.c.rule === 'complete' && r.left != null)
  const t0 = today()
  const upcoming = items.filter((i) => i.status === 'todo' && i.due_on && i.due_on >= t0).sort((a, b) => a.due_on!.localeCompare(b.due_on!))
  const unscored = items.filter((i) => i.status === 'todo' && i.due_on && i.due_on < t0)
  const letter = g.pct == null ? null : CUT.find(([, t]) => g.pct! >= t)?.[0] ?? 'F'
  const quick = (i: Item, status: Item['status']) => patchRow('grade_items', i.id, { status }).catch(() => {})
  const row = (i: Item) => (
    <div class="gi-row">
      <button class="grow gi-main" onClick={() => setEdit(i)}>
        <div class="ellipsis">{i.name}</div>
        <div class="faint tiny">{i.category}{i.due_on ? ` · ${fmtDay(i.due_on).replace(/,.*/, '')}` : ''}{i.score != null ? ` · ${fmt(i.score)}${i.possible ? `/${fmt(i.possible)}` : '%'}` : i.possible ? ` · ${fmt(i.possible)} pts` : ''}</div>
      </button>
      {i.status === 'todo' ? <button class="chip small" onClick={() => quick(i, 'done')}><Icon name="check" size={13} />Done</button> : <span class="pill" style={`--c:${ST[i.status][1]}`}>{ST[i.status][0]}</span>}
    </div>
  )
  return (
    <Card title="Grade tracker" icon="target" accent={color} action={<button class="faint small" onClick={() => setWeights(true)}>Weights</button>}>
      <div class="row between" style="margin-bottom:6px">
        <span><b style={`font-size:28px;color:${color}`}>{letter ?? '–'}</b> <span class="muted">{g.pct != null ? `${fmt(g.pct)}%` : 'add scores and weights to see your grade'}</span></span>
        <span class="faint small">{g.weighted ? `from ${g.weighted}% of the grade` : ''}</span>
      </div>
      <div class="gcats">{g.rows.map((r) => (
        <div class="gcat"><span class="ellipsis">{r.c.cat}</span>
          <b>{r.c.rule === 'complete' ? (r.left != null ? `${r.inc} incomplete` : `${r.inc} short`) : r.pct != null ? `${fmt(r.pct)}%` : '–'}</b>
          <span class="faint tiny">{r.c.weight != null ? `${r.c.weight}%` : 'weight?'}{r.c.rule === 'complete' && r.left != null ? (r.left >= 0 ? ` · ${r.left} to spare` : ' · over the limit') : ''}{r.maybe ? ` · ${r.maybe} unsure` : ''}</span></div>
      ))}</div>
      {hw && hw.maybe > 0 && hw.left != null && hw.left - hw.maybe < 0 && <div class="gwarn">{hw.c.cat}: {hw.inc} incomplete, {hw.maybe} past due and not marked. If {hw.maybe === 1 ? 'that one is' : 'those are'} incomplete too, you’re at {hw.inc + hw.maybe} of {hw.inc + hw.left} allowed and lose the whole {hw.c.weight}%. Mark {hw.maybe === 1 ? 'it' : 'them'} below.</div>}
      {hw && hw.left != null && hw.left < 0 && <div class="gwarn">{hw.c.cat}: {hw.inc} incomplete is over the limit of {hw.inc + hw.left}, so the whole {hw.c.weight}% is gone unless some get redone.</div>}
      {sc && <div class="row" style="gap:8px;margin-top:8px"><div class="gcat grow"><span>If nothing else is turned in</span><b>{fmt(sc.none)}%</b></div><div class="gcat grow"><span>With full catch-up</span><b>{fmt(sc.all)}%</b></div></div>}
      {g.unweighted.length > 0 && <p class="faint tiny" style="margin-top:6px">{g.unweighted.join(', ')} {g.unweighted.length === 1 ? 'has' : 'have'} no weight yet, so {g.unweighted.length === 1 ? 'it isn’t' : 'they aren’t'} in the grade. Tap Weights to add them from the syllabus.</p>}
      {needs && <div class="gneeds"><div class="faint tiny" style="margin-bottom:4px">On the final, you’d need</div>
        <div class="row" style="gap:6px;flex-wrap:wrap">{needs.map((n) => <span class="pill" style={`--c:${n.need > 100 ? 'var(--faint)' : n.need <= 0 ? 'var(--mint)' : color}`}>{n.l}: {n.need > 100 ? 'out of reach' : n.need <= 0 ? 'locked in' : `${Math.ceil(n.need)}%`}</span>)}</div>
        <div class="faint tiny" style="margin-top:4px">If everything else stays where it is now.</div></div>}
      {upcoming.length > 0 && <><div class="due-day faint tiny">Coming up</div>{upcoming.slice(0, all2 ? 99 : 5).map(row)}</>}
      {unscored.length > 0 && <><div class="due-day faint tiny">Past due, not marked yet</div>{unscored.slice(0, all2 ? 99 : 4).map(row)}</>}
      {all2 && <><div class="due-day faint tiny">Everything else</div>{items.filter((i) => !upcoming.includes(i) && !unscored.includes(i)).map(row)}</>}
      <div class="row" style="gap:8px;margin-top:10px">
        <button class="btn ghost sm grow" onClick={() => setAll(!all2)}>{all2 ? 'Show less' : `All ${items.length}`}</button>
        <button class="btn ghost sm grow" onClick={() => setEdit({ course_id: course.id, category: cats[0]?.cat ?? 'Homework', name: '', status: 'todo', score: null, possible: null, due_on: null, note: null })}><Icon name="plus" size={15} />Add</button>
      </div>
      <ItemSheet item={edit} cats={cats} onClose={() => setEdit(null)} />
      <WeightsSheet open={weights} course={course} cats={cats} onClose={() => setWeights(false)} />
    </Card>
  )
}

function ItemSheet({ item, cats, onClose }: { item: Partial<Item> | null; cats: Cat[]; onClose: () => void }) {
  const [f, setF] = useState<Partial<Item> | null>(null)
  const cur = f && f.id === item?.id && f.course_id === item?.course_id ? f : item
  const set = (p: Partial<Item>) => setF({ ...cur, ...p })
  const num = (v: string) => v === '' ? null : Number(v)
  async function save() {
    if (!cur?.name?.trim()) { toast('Give it a name'); return }
    const { id, ...rest } = cur as Item
    const status = rest.score != null && (rest.status === 'todo' || rest.status === 'done') ? 'graded' : rest.status
    const body = { ...rest, name: rest.name.trim(), status }
    if (id) await patchRow('grade_items', id, body).catch(() => {})
    else await addRow('grade_items', { ...body, sort: Date.now() % 1e6 }).catch(() => {})
    setF(null); onClose()
  }
  return (
    <Sheet open={!!item} onClose={() => { setF(null); onClose() }} title={item?.id ? 'Edit' : 'Add a graded item'}>
      {cur && <>
        <label class="field"><span>Name</span><input class="input" value={cur.name ?? ''} onInput={(e) => set({ name: (e.target as HTMLInputElement).value })} /></label>
        <div class="chips" style="margin-bottom:10px">{cats.map((c) => <button class={`chip small ${cur.category === c.cat ? 'on' : ''}`} onClick={() => set({ category: c.cat })}>{c.cat}</button>)}</div>
        <div class="row">
          <label class="field grow"><span>Score</span><input class="input" type="number" inputMode="decimal" value={cur.score ?? ''} onInput={(e) => set({ score: num((e.target as HTMLInputElement).value) })} /></label>
          <label class="field grow"><span>Out of</span><input class="input" type="number" inputMode="decimal" placeholder="blank = %" value={cur.possible ?? ''} onInput={(e) => set({ possible: num((e.target as HTMLInputElement).value) })} /></label>
        </div>
        <label class="field"><span>Due</span><input class="input" type="date" value={cur.due_on ?? ''} onInput={(e) => set({ due_on: (e.target as HTMLInputElement).value || null })} /></label>
        <div class="chips" style="margin-bottom:10px">{(Object.keys(ST) as Item['status'][]).map((s) => <button class={`chip small ${cur.status === s ? 'on' : ''}`} onClick={() => set({ status: s })}>{ST[s][0]}</button>)}</div>
        <label class="field"><span>Note</span><input class="input" value={cur.note ?? ''} onInput={(e) => set({ note: (e.target as HTMLInputElement).value || null })} /></label>
        <button class="btn primary block" onClick={save}>Save</button>
        {cur.id && <button class="btn ghost danger block" style="margin-top:8px" onClick={async () => { await dropRow('grade_items', cur.id!).catch(() => {}); setF(null); onClose() }}><Icon name="trash" size={16} />Remove</button>}
      </>}
    </Sheet>
  )
}

function WeightsSheet({ open, course, cats, onClose }: { open: boolean; course: CourseLike; cats: Cat[]; onClose: () => void }) {
  const [list, setList] = useState<Cat[] | null>(null)
  const cur = list ?? (cats.length ? cats : [{ cat: 'Homework', weight: null }, { cat: 'Quizzes', weight: null }, { cat: 'Tests', weight: null }, { cat: 'Final exam', weight: null }])
  const total = cur.reduce((a, c) => a + (c.weight ?? 0), 0)
  const upd = (i: number, p: Partial<Cat>) => setList(cur.map((c, j) => j === i ? { ...c, ...p } : c))
  async function save() {
    const grading = cur.filter((c) => c.cat.trim())
    await patchRow('courses', course.id, { data: { ...(course.data ?? {}), grading } }).catch(() => {})
    setList(null); onClose()
  }
  return (
    <Sheet open={open} onClose={() => { setList(null); onClose() }} title={`${course.code} weights`}>
      <p class="faint small" style="margin-bottom:10px">From the syllabus. Leave a weight blank if you don’t know it yet. A completion category counts incompletes instead of points.</p>
      {cur.map((c, i) => (
        <div class="row" style="gap:8px;margin-bottom:8px">
          <input class="input grow" value={c.cat} onInput={(e) => upd(i, { cat: (e.target as HTMLInputElement).value })} />
          <input class="input" style="width:76px" type="number" inputMode="decimal" placeholder="%" value={c.weight ?? ''} onInput={(e) => { const v = (e.target as HTMLInputElement).value; upd(i, { weight: v === '' ? null : Number(v) }) }} />
          <button class={`chip small ${c.rule === 'complete' ? 'on' : ''}`} title="Count incompletes" onClick={() => upd(i, c.rule === 'complete' ? { rule: undefined } : { rule: 'complete', pass: 70 })}>Done/not</button>
        </div>
      ))}
      {cur.some((c) => c.rule === 'complete') && cur.map((c, i) => c.rule === 'complete' ? (
        <div class="row small" style="gap:8px;margin-bottom:8px"><span class="grow">{c.cat}: counts as done at</span>
          <input class="input" style="width:64px" type="number" value={c.pass ?? 70} onInput={(e) => upd(i, { pass: Number((e.target as HTMLInputElement).value) })} /><span>%, max</span>
          <input class="input" style="width:56px" type="number" placeholder="∞" value={c.maxMissing ?? ''} onInput={(e) => { const v = (e.target as HTMLInputElement).value; upd(i, { maxMissing: v === '' ? undefined : Number(v) }) }} /><span>missed</span></div>
      ) : null)}
      <div class="row between small" style="margin:6px 0 12px"><button class="chip small" onClick={() => setList([...cur, { cat: '', weight: null }])}><Icon name="plus" size={13} />Category</button><span class={total === 100 ? 'faint' : ''} style={total && total !== 100 ? 'color:var(--gold)' : ''}>Total {fmt(total)}%</span></div>
      <button class="btn primary block" onClick={save}>Save</button>
    </Sheet>
  )
}
