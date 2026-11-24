import { useState } from 'preact/hooks'
import { useRows, addRow, patchRow, dropRow, registerDemo } from '../lib/rows'
import { today, fmtDay } from '../lib/dates'
import { toast } from '../lib/store'
import { Icon } from '../ui/icons'
import { Card, Sheet } from '../ui/kit'
import { computeGrade, scenarios, pathTable, parsePlan, togglePlan, letterOf, fmt, DEFAULT_CUTS, type Cat, type Item, type Cut } from '../lib/grades'

export { computeGrade, type Cat, type Item }

/**
 * Grade tracker for one class: every graded thing, the syllabus weights, the grade so far, three what-ifs
 * (nothing else turned in, keep up only, full catch-up) with editable guesses, a path to an A, and a catch-up plan.
 * Weights, letter cutoffs and the plan live on the course (courses.data); items live in grade_items. Math: lib/grades.
 */
type CourseData = { grading?: Cat[]; cutoffs?: Cut[]; plan?: string }
type CourseLike = { id: string; code: string; data?: CourseData | null }

const soon = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10)
registerDemo('grade_items', () => [
  { id: 'gi1', course_id: 'c0', category: 'Homework', name: 'HW 1', score: 18, possible: 20, guess: null, due_on: '2026-09-10', status: 'graded', note: null, sort: 1 },
  { id: 'gi2', course_id: 'c0', category: 'Homework', name: 'HW 2', score: 4, possible: 20, guess: null, due_on: '2026-09-17', status: 'missing', note: 'Redo for credit', sort: 2 },
  { id: 'gi3', course_id: 'c0', category: 'Tests', name: 'Test 1', score: 81, possible: 100, guess: null, due_on: '2026-10-01', status: 'graded', note: null, sort: 3 },
  { id: 'gi7', course_id: 'c0', category: 'Tests', name: 'Test 2', score: null, possible: 100, guess: 85, due_on: '2026-11-05', status: 'done', note: null, sort: 4 },
  { id: 'gi8', course_id: 'c0', category: 'Tests', name: 'Test 3', score: null, possible: 100, guess: 90, due_on: '2026-12-10', status: 'todo', note: null, sort: 5 },
  { id: 'gi4', course_id: 'c0', category: 'Quizzes', name: 'Quiz 4', score: 9, possible: 10, guess: null, due_on: '2026-10-20', status: 'graded', note: null, sort: 6 },
  { id: 'gi5', course_id: 'c0', category: 'Homework', name: 'HW 9', score: null, possible: 15, guess: null, due_on: soon(2), status: 'todo', note: null, sort: 7 },
  { id: 'gi6', course_id: 'c0', category: 'Final exam', name: 'Final exam', score: null, possible: 100, guess: 90, due_on: '2026-12-18', status: 'todo', note: null, sort: 8 },
] as never)
const DEMO: CourseData = {
  grading: [{ cat: 'Final exam', weight: 30 }, { cat: 'Tests', weight: 45 }, { cat: 'Quizzes', weight: 15, drop: 1 }, { cat: 'Homework', weight: 10, rule: 'complete', pass: 70, maxMissing: 8 }],
  plan: '## Now\n- [ ] HW 9\n## Get old points back\n- [ ] Ask about redoing HW 2\n- [ ] Redo HW 2\n## Home stretch\n- [ ] Test 3 review\n- [ ] Final review',
}

function label(i: Item, c: Cat | undefined): [string, string] {
  if (i.status === 'excused') return ['Doesn’t count', 'var(--faint)']
  if (i.status === 'missing') return c?.rule === 'complete' && i.score ? ['Incomplete', 'var(--coral)'] : ['Missing', 'var(--coral)']
  if (i.score != null) {
    const p = i.possible ? (i.score / i.possible) * 100 : i.score
    return c?.rule === 'complete' && p < (c.pass ?? 70) ? ['Incomplete', 'var(--coral)'] : ['Done', 'var(--mint)']
  }
  if (i.status === 'done' || i.status === 'graded') return c?.completion || c?.rule === 'complete' ? ['Done', 'var(--mint)'] : ['Not graded yet', 'var(--sky)']
  return i.due_on && i.due_on < today() ? ['Past due', 'var(--gold)'] : ['Open', 'var(--faint)']
}
const outOf = (i: Item) => i.possible ? `/${fmt(i.possible)}` : '%'
const pts = (i: Item) => i.score != null ? ` · ${fmt(i.score)}${outOf(i)}` : i.guess != null ? ` · guess ${fmt(i.guess)}${outOf(i)}` : i.possible ? ` · ${fmt(i.possible)} pts` : ''
const short = (n: string) => n.replace(/\s*\(.*\)/, '')
const MODES = [['none', 'Nothing else turned in', 'Nothing'], ['keep', 'Keep up, no catch-up', 'Keep up'], ['all', 'Full catch-up', 'Catch-up']] as const

export function GradeTracker({ course, color }: { course: CourseLike; color: string }) {
  const rows = useRows<Item>('grade_items')
  const items = (rows ?? []).filter((i) => i.course_id === course.id)
  const data: CourseData = course.data ?? (course.id === 'c0' ? DEMO : {})
  const cats: Cat[] = data.grading ?? []
  const cuts = data.cutoffs ?? DEFAULT_CUTS
  const [edit, setEdit] = useState<Partial<Item> | null>(null)
  const [weights, setWeights] = useState(false)
  const [planEdit, setPlanEdit] = useState(false)
  const [open, setOpen] = useState<'' | 'all' | 'est' | 'path'>('')
  if (!cats.length && !items.length) return (
    <Card title="Grade tracker" icon="target" accent={color}>
      <p class="faint small" style="margin-bottom:10px">Add the syllabus weights and your scores and this works out your grade and what you need on the final.</p>
      <button class="btn ghost sm" onClick={() => setWeights(true)}><Icon name="sliders" size={15} />Set up weights</button>
      <WeightsSheet open={weights} course={course} data={data} onClose={() => setWeights(false)} />
    </Card>
  )
  const catOf = (i: Item) => cats.find((c) => c.cat === i.category)
  const g = computeGrade(cats, items)
  const sc = scenarios(cats, items)
  const path = pathTable(cats, items, cuts)
  const hw = g.rows.find((r) => r.c.rule === 'complete' && r.left != null)
  const t0 = today()
  const upcoming = items.filter((i) => i.status === 'todo' && i.due_on && i.due_on >= t0).sort((a, b) => a.due_on!.localeCompare(b.due_on!))
  const unsure = items.filter((i) => i.status === 'todo' && i.score == null && i.due_on && i.due_on < t0)
  const letter = g.pct == null ? null : letterOf(g.pct, cuts)
  const capCat = cats.find((c) => c.cap)
  const quick = (i: Item, status: Item['status']) => patchRow('grade_items', i.id, { status }).catch(() => {})
  const savePlan = (plan: string) => patchRow('courses', course.id, { data: { ...data, plan } }).catch(() => {})
  const toggle = (id: typeof open) => setOpen(open === id ? '' : id)
  const row = (i: Item) => {
    const [t, c] = label(i, catOf(i))
    return (
      <div class="gi-row">
        <button class="grow gi-main" onClick={() => setEdit(i)}>
          <div class="ellipsis">{i.name}</div>
          <div class="faint tiny ellipsis">{i.due_on ? fmtDay(i.due_on).replace(/,.*/, '') : i.category}{pts(i)}{i.note ? ` · ${i.note}` : ''}</div>
        </button>
        {i.status === 'todo' ? <button class="chip small" onClick={() => quick(i, 'done')}><Icon name="check" size={13} />Done</button> : <span class="pill" style={`--c:${c}`}>{t}</span>}
      </div>
    )
  }
  // Guesses you can change: one box per exam, one shared box for a category with several ungraded items.
  const guessed = items.filter((i) => i.guess != null && i.score == null && i.status !== 'excused')
  const groups = [...new Set(guessed.map((i) => i.category))].flatMap((cat) => {
    const list = guessed.filter((i) => i.category === cat)
    return list.length > 2 ? [{ key: cat, name: `${cat} not graded yet (${list.length})`, list }] : list.map((i) => ({ key: i.id, name: i.name, list: [i] }))
  })
  const setGuess = (list: Item[], v: string) => { const n = v === '' ? null : Number(v); if (n != null && !Number.isFinite(n)) return; list.forEach((i) => patchRow('grade_items', i.id, { guess: n }).catch(() => {})) }
  const plan = parsePlan(data.plan ?? '')
  const nextStep = plan.find((p) => p.kind === 'step' && !p.done)
  const pendPct = path?.pending ? ((path.pending.guess ?? 0) / (path.pending.possible ?? 100)) * 100 : null

  return (
    <Card title="Grade tracker" icon="target" accent={color} action={<button class="faint small" onClick={() => setWeights(true)}>Weights</button>}>
      <div class="row between" style="margin-bottom:6px">
        <span><b style={`font-size:28px;color:${color}`}>{letter ?? '–'}</b> <span class="muted">{g.pct != null ? `${fmt(g.pct)}% so far` : 'add scores and weights to see your grade'}</span></span>
        <span class="faint small">{g.weighted ? `from ${g.weighted}% of the grade` : ''}</span>
      </div>
      <div class="gcats">{g.rows.map((r) => (
        <div class="gcat"><span class="ellipsis">{r.c.cat}</span>
          <b>{r.c.rule === 'complete' ? `${r.inc} incomplete` : r.pct != null ? `${fmt(r.pct)}%` : '–'}</b>
          <span class="faint tiny">{r.c.weight != null ? `${r.c.weight}%` : 'weight?'}{r.c.drop ? ` · drops ${r.c.drop}` : ''}{r.c.rule === 'complete' && r.left != null ? (r.left >= 0 ? ` · ${r.left} to spare` : ' · over the limit') : ''}{r.maybe ? ` · ${r.maybe} unsure` : ''}</span></div>
      ))}</div>
      {hw && hw.maybe > 0 && hw.left != null && hw.left - hw.maybe < 0 && <div class="gwarn">{hw.c.cat}: {hw.inc} incomplete, {hw.maybe} past due and not marked. If {hw.maybe === 1 ? 'that one is' : 'those are'} incomplete too, you’re at {hw.inc + hw.maybe} of {hw.inc + hw.left} allowed and lose the whole {hw.c.weight}%. Mark {hw.maybe === 1 ? 'it' : 'them'} below.</div>}
      {hw && hw.left != null && hw.left < 0 && <div class="gwarn">{hw.c.cat}: {hw.inc} incomplete is over the limit of {hw.inc + hw.left}, so the whole {hw.c.weight}% is gone unless some get redone.</div>}
      {g.unweighted.length > 0 && <p class="faint tiny" style="margin-top:6px">{g.unweighted.join(', ')} {g.unweighted.length === 1 ? 'has' : 'have'} no weight yet, so {g.unweighted.length === 1 ? 'it isn’t' : 'they aren’t'} in the grade. Tap Weights to add them from the syllabus.</p>}

      {sc && <>
        <div class="due-day faint tiny">Where you’ll end up</div>
        <div class="gcats" style="grid-template-columns:repeat(3,1fr)">
          {MODES.map(([k, t]) => (
            <button class="gcat" style="text-align:left;border:0;font:inherit" onClick={() => toggle('est')}><span>{t}</span><b>{fmt(sc[k].pct!)}%</b><span class="faint tiny">{letterOf(sc[k].pct!, cuts)}</span></button>
          ))}
        </div>
        {open === 'est' ? <div class="gneeds">
          <table class="gtable"><thead><tr><th></th>{MODES.map((m) => <th>{m[2]}</th>)}</tr></thead>
            <tbody>{cats.map((c, j) => c.weight ? <tr><td>{c.cat} <span class="faint">{c.weight}%</span></td>{MODES.map(([k]) => { const p = sc[k].rows[j]?.pct; return <td>{p != null ? fmt(p) : '–'}</td> })}</tr> : null)}</tbody></table>
          {groups.length > 0 && <><div class="faint tiny" style="margin:10px 0 4px">Your guesses for what’s not graded yet</div>
            {groups.map((gr) => { const i = gr.list[0]; const avg = gr.list.reduce((a, x) => a + (x.guess ?? 0), 0) / gr.list.length; return (
              <div class="row small" style="gap:8px;margin-bottom:6px"><span class="grow ellipsis">{gr.name}</span>
                <input class="input" style="width:72px;padding:4px 8px" type="number" inputMode="decimal" value={fmt(avg)} onChange={(e) => setGuess(gr.list, (e.target as HTMLInputElement).value)} />
                <span class="faint tiny" style="width:34px">{outOf(i)}</span></div>) })}</>}
          <div class="faint tiny" style="margin-top:6px">Exams use your guesses in all three. Keep up means everything due from today on gets done and nothing old is redone.</div>
        </div> : <div class="faint tiny" style="margin-top:4px">Tap one for the breakdown and to change your guesses.</div>}
      </>}

      {path && <>
        <div class="due-day faint tiny row between"><span>Path to {path.top.map((t) => t[0]).join(' or ')}</span>{path.pending && <button class="faint tiny" onClick={() => toggle('path')}>{open === 'path' ? 'Less' : 'All'}</button>}</div>
        <div class="gneeds">
          <div class="faint tiny" style="margin-bottom:6px">What you’d need on {path.ahead.map((a) => short(a.name)).join(' and ')}{path.ahead.length > 1 ? ', same score on each' : ''}, with full catch-up</div>
          <table class="gtable"><thead><tr>{path.pending && <th>If {short(path.pending.name)} is</th>}{path.top.map(([l]) => <th>For {l}</th>)}</tr></thead>
            <tbody>{path.rows.filter((r) => open === 'path' || pendPct == null || Math.abs((r.p ?? 0) - pendPct) <= 5).map((r) => (
              <tr class={pendPct != null && Math.abs((r.p ?? 0) - pendPct) < 2.5 ? 'on' : ''}>{path.pending && <td>{r.p}</td>}{r.needs.map((n) => <td>{n.need == null ? '–' : n.need > 100 ? 'out of reach' : n.need <= 0 ? 'locked in' : fmt(n.need)}</td>)}</tr>
            ))}</tbody></table>
          {capCat?.cap && <div class="faint tiny" style="margin-top:6px">Under {capCat.cap.below}% on the {capCat.cat.toLowerCase()} caps the class at {capCat.cap.letter}.</div>}
        </div>
      </>}

      {plan.length > 0 && <>
        <div class="due-day faint tiny row between"><span class="ellipsis">Plan{nextStep && nextStep.kind === 'step' ? `: next is ${nextStep.text}` : ''}</span><button class="faint tiny" onClick={() => setPlanEdit(true)}>Edit</button></div>
        <div class="tchecks" style="margin-top:0">{plan.map((p) => p.kind === 'head' ? <div class="faint tiny" style="margin-top:8px">{p.text}</div> : (
          <button class={`tcheck ${p.done ? 'on' : ''}`} onClick={() => savePlan(togglePlan(data.plan ?? '', p.at))}><span class="tbox"><Icon name="check" size={12} stroke={3} /></span><span class="grow">{p.text}</span></button>
        ))}</div>
      </>}

      {upcoming.length > 0 && <><div class="due-day faint tiny">Coming up</div>{upcoming.slice(0, open === 'all' ? 99 : 5).map(row)}</>}
      {unsure.length > 0 && <><div class="due-day faint tiny">Past due, not marked yet</div>{unsure.map(row)}</>}
      {open === 'all' && cats.map((c, j) => {
        const list = items.filter((i) => i.category === c.cat && !upcoming.includes(i) && !unsure.includes(i))
        if (!list.length) return null
        const r = g.rows[j]
        const got = list.reduce((a, i) => a + (i.score ?? 0), 0), of = list.filter((i) => i.score != null && i.possible).reduce((a, i) => a + i.possible!, 0)
        return <><div class="due-day faint tiny row between"><span>{c.cat}</span><span>{of ? `${fmt(got)}/${fmt(of)} pts · ` : ''}{c.rule === 'complete' ? `${r.inc} incomplete` : r.pct != null ? `${fmt(r.pct)}%` : ''}</span></div>{list.map(row)}</>
      })}
      {open === 'all' && items.filter((i) => !catOf(i)).map(row)}
      <div class="row" style="gap:8px;margin-top:10px">
        <button class="btn ghost sm grow" onClick={() => toggle('all')}>{open === 'all' ? 'Show less' : `All ${items.length}`}</button>
        <button class="btn ghost sm grow" onClick={() => setEdit({ course_id: course.id, category: cats[0]?.cat ?? 'Homework', name: '', status: 'todo', score: null, possible: null, guess: null, due_on: null, note: null })}><Icon name="plus" size={15} />Add</button>
        {!plan.length && <button class="btn ghost sm grow" onClick={() => setPlanEdit(true)}><Icon name="list" size={15} />Plan</button>}
      </div>
      <ItemSheet item={edit} cats={cats} onClose={() => setEdit(null)} />
      <WeightsSheet open={weights} course={course} data={data} onClose={() => setWeights(false)} />
      <PlanSheet open={planEdit} text={data.plan ?? ''} onSave={(t) => { savePlan(t); setPlanEdit(false) }} onClose={() => setPlanEdit(false)} />
    </Card>
  )
}

const ST: [Item['status'], string][] = [['todo', 'Open'], ['done', 'Turned in'], ['graded', 'Graded'], ['missing', 'Missing'], ['excused', 'Doesn’t count']]

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
          <label class="field grow"><span>Guess</span><input class="input" type="number" inputMode="decimal" placeholder="until graded" value={cur.guess ?? ''} onInput={(e) => set({ guess: num((e.target as HTMLInputElement).value) })} /></label>
        </div>
        <label class="field"><span>Due</span><input class="input" type="date" value={cur.due_on ?? ''} onInput={(e) => set({ due_on: (e.target as HTMLInputElement).value || null })} /></label>
        <div class="chips" style="margin-bottom:10px">{ST.map(([s, t]) => <button class={`chip small ${cur.status === s ? 'on' : ''}`} onClick={() => set({ status: s })}>{t}</button>)}</div>
        <label class="field"><span>Note</span><input class="input" value={cur.note ?? ''} onInput={(e) => set({ note: (e.target as HTMLInputElement).value || null })} /></label>
        <button class="btn primary block" onClick={save}>Save</button>
        {cur.id && <button class="btn ghost danger block" style="margin-top:8px" onClick={async () => { await dropRow('grade_items', cur.id!).catch(() => {}); setF(null); onClose() }}><Icon name="trash" size={16} />Remove</button>}
      </>}
    </Sheet>
  )
}

function PlanSheet({ open, text, onSave, onClose }: { open: boolean; text: string; onSave: (t: string) => void; onClose: () => void }) {
  const [t, setT] = useState<string | null>(null)
  const cur = t ?? (text || '## Now\n- [ ] \n## Get old points back\n- [ ] \n## Home stretch\n- [ ] ')
  return (
    <Sheet open={open} onClose={() => { setT(null); onClose() }} title="Plan">
      <p class="faint small" style="margin-bottom:8px">Work it top down. One step a line as “- [ ] step”, and “## Name” starts a section.</p>
      <textarea class="input" style="min-height:220px;font-size:14px" value={cur} onInput={(e) => setT((e.target as HTMLTextAreaElement).value)} />
      <button class="btn primary block" style="margin-top:10px" onClick={() => { onSave(cur); setT(null) }}>Save</button>
    </Sheet>
  )
}

function WeightsSheet({ open, course, data, onClose }: { open: boolean; course: CourseLike; data: CourseData; onClose: () => void }) {
  const cats = data.grading ?? []
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
      <p class="faint small" style="margin-bottom:10px">From the syllabus. Leave a weight blank if you don’t know it yet. Done/not counts incompletes instead of points. Full credit means turning it in earns all its points.</p>
      {cur.map((c, i) => (
        <div style="margin-bottom:10px">
          <div class="row" style="gap:8px">
            <input class="input grow" value={c.cat} onInput={(e) => upd(i, { cat: (e.target as HTMLInputElement).value })} />
            <input class="input" style="width:76px" type="number" inputMode="decimal" placeholder="%" value={c.weight ?? ''} onInput={(e) => { const v = (e.target as HTMLInputElement).value; upd(i, { weight: v === '' ? null : Number(v) }) }} />
          </div>
          <div class="row small" style="gap:6px;margin-top:5px;flex-wrap:wrap">
            <button class={`chip small ${c.rule === 'complete' ? 'on' : ''}`} onClick={() => upd(i, c.rule === 'complete' ? { rule: undefined } : { rule: 'complete', pass: 70 })}>Done/not</button>
            <button class={`chip small ${c.completion ? 'on' : ''}`} onClick={() => upd(i, { completion: !c.completion || undefined })}>Full credit</button>
            <span class="faint">Drop lowest</span><input class="input" style="width:52px;padding:4px 8px" type="number" value={c.drop ?? ''} onInput={(e) => { const v = (e.target as HTMLInputElement).value; upd(i, { drop: v === '' ? undefined : Number(v) }) }} />
          </div>
          {c.rule === 'complete' && <div class="row small" style="gap:8px;margin-top:5px"><span class="grow faint">Counts as done at</span>
            <input class="input" style="width:60px;padding:4px 8px" type="number" value={c.pass ?? 70} onInput={(e) => upd(i, { pass: Number((e.target as HTMLInputElement).value) })} /><span>%, max</span>
            <input class="input" style="width:52px;padding:4px 8px" type="number" placeholder="∞" value={c.maxMissing ?? ''} onInput={(e) => { const v = (e.target as HTMLInputElement).value; upd(i, { maxMissing: v === '' ? undefined : Number(v) }) }} /><span>missed</span></div>}
        </div>
      ))}
      <div class="row between small" style="margin:6px 0 12px"><button class="chip small" onClick={() => setList([...cur, { cat: '', weight: null }])}><Icon name="plus" size={13} />Category</button><span style={total && total !== 100 ? 'color:var(--gold)' : ''} class={total === 100 ? 'faint' : ''}>Total {fmt(total)}%</span></div>
      <button class="btn primary block" onClick={save}>Save</button>
    </Sheet>
  )
}
