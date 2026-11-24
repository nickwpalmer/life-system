import { useEffect, useState } from 'preact/hooks'
import { useStore, toast, areaById, getState } from '../lib/store'
import { insert, update, remove, restore, addTask } from '../lib/db'
import { fmtShort, daysUntil, today } from '../lib/dates'
import type { Goal } from '../lib/types'
import { Icon } from '../ui/icons'
import { Sheet, PageHead, Ring, Card, burst } from '../ui/kit'

export function goalProgress(g: Goal) {
  const ts = getState().tasks.filter((t) => t.goal_id === g.id && t.status !== 'dropped')
  if (ts.length) return { p: ts.filter((t) => t.status === 'done').length / ts.length, label: `${ts.filter((t) => t.status === 'done').length}/${ts.length} steps` }
  return { p: (g.progress ?? 0) / 100, label: g.progress ? `${g.progress}%` : 'Not started' }
}

const HORIZONS = [['week', 'This week'], ['month', 'This month'], ['semester', 'This semester'], ['year', 'This year'], ['life', 'Long term']]

function Editor({ goal, onClose }: { goal: Goal | 'new' | null; onClose: () => void }) {
  const areas = useStore((s) => s.areas.filter((a) => !a.archived))
  const [f, setF] = useState<Partial<Goal>>({})
  useEffect(() => { if (goal) setF(goal === 'new' ? { title: '', why: '', next_step: '', area_id: null, horizon: 'semester', target_date: null, progress: 0 } : { ...goal }) }, [goal])
  if (!goal) return <Sheet open={false} onClose={onClose}>{null}</Sheet>
  async function save() {
    if (!f.title?.trim()) { onClose(); return }
    const row = { title: f.title.trim(), why: f.why || null, next_step: f.next_step || null, area_id: f.area_id ?? null, horizon: f.horizon ?? null, target_date: f.target_date || null, progress: f.progress ?? 0 }
    onClose()
    try { if (goal !== 'new') await update('goals', (goal as Goal).id, row); else await insert('goals', { ...row, status: 'active', suggested: false, sort: getState().goals.length }) } catch { /* shown */ }
  }
  async function del() {
    const g = goal as Goal
    const row = getState().goals.find((x) => x.id === g.id)
    onClose(); await remove('goals', g.id).catch(() => {})
    if (row) toast('Goal deleted', () => restore('goals', row as never))
  }
  const tasks = goal !== 'new' ? getState().tasks.filter((t) => t.goal_id === (goal as Goal).id) : []
  return (
    <Sheet open onClose={save} title={goal === 'new' ? 'New goal' : 'Goal'}>
      <input class="input title" placeholder="What do you want to achieve?" value={f.title ?? ''} onInput={(e) => setF({ ...f, title: (e.target as HTMLInputElement).value })} />
      <label class="field" style="margin-top:12px"><span>Why it matters to you</span><textarea class="input" style="min-height:64px" placeholder="The reason you’ll read on a hard day" value={f.why ?? ''} onInput={(e) => setF({ ...f, why: (e.target as HTMLTextAreaElement).value })} /></label>
      <label class="field"><span>Next step (the very next thing you can do)</span><input class="input" placeholder="Small and concrete" value={f.next_step ?? ''} onInput={(e) => setF({ ...f, next_step: (e.target as HTMLInputElement).value })} /></label>
      <div class="field"><span>Area</span><div class="chips">{areas.map((a) => <button class={`chip ${f.area_id === a.id ? 'on' : ''}`} style={`--c:${a.color}`} onClick={() => setF({ ...f, area_id: f.area_id === a.id ? null : a.id })}><i class="dot" style={`background:${a.color}`} />{a.name}</button>)}</div></div>
      <div class="field"><span>Horizon</span><div class="chips">{HORIZONS.map(([k, l]) => <button class={`chip ${f.horizon === k ? 'on' : ''}`} onClick={() => setF({ ...f, horizon: k })}>{l}</button>)}</div></div>
      <label class="field"><span>Target date (optional)</span><input class="input" type="date" value={f.target_date ?? ''} onInput={(e) => setF({ ...f, target_date: (e.target as HTMLInputElement).value || null })} /></label>
      {!tasks.length && <div class="field"><span>Progress</span><div class="chips">{[0, 25, 50, 75, 100].map((p) => <button class={`chip ${f.progress === p ? 'on' : ''}`} onClick={() => setF({ ...f, progress: p })}>{p}%</button>)}</div><p class="faint tiny" style="margin:6px 4px 0">Or link tasks to this goal and progress fills in by itself.</p></div>}
      <button class="btn primary block" onClick={save}>Save</button>
      {goal !== 'new' && <>
        <div class="row" style="margin-top:8px">
          <button class="btn grow" onClick={() => { update('goals', (goal as Goal).id, { status: 'done', progress: 100 }); onClose(); toast('Goal complete. Well done.') }}><Icon name="check" size={18} />Mark achieved</button>
          <button class="btn grow" onClick={() => { update('goals', (goal as Goal).id, { status: (goal as Goal).status === 'paused' ? 'active' : 'paused' }); onClose() }}>{(goal as Goal).status === 'paused' ? 'Resume' : 'Pause'}</button>
        </div>
        <button class="btn ghost danger block" style="margin-top:8px" onClick={del}><Icon name="trash" size={18} /> Delete</button>
      </>}
    </Sheet>
  )
}

function GoalRow({ g, onOpen }: { g: Goal; onOpen: () => void }) {
  useStore((s) => s.tasks)
  const a = areaById(g.area_id)
  const { p, label } = goalProgress(g)
  const [step, setStep] = useState(false)
  return (
    <div class="goal">
      <div class="row top" onClick={onOpen} style="cursor:pointer">
        <Ring value={p} size={46}>{Math.round(p * 100)}</Ring>
        <div class="grow">
          <div class="g-title">{g.title}</div>
          <div class="t-meta faint small row wrap" style="gap:4px 10px;margin-top:3px">
            {a && <span class="pill" style={`--c:${a.color}`}>{a.name}</span>}<span>{label}</span>
            {g.target_date && <span class={daysUntil(g.target_date) < 14 ? 'soon' : ''}>by {fmtShort(g.target_date)}</span>}
            {g.status === 'paused' && <span>paused</span>}
          </div>
          {g.why && <div class="g-why">“{g.why}”</div>}
        </div>
      </div>
      {g.next_step ? (
        <div class="g-next">
          <Icon name="arrow" size={15} /><span class="grow">{g.next_step}</span>
          {!step ? <button class="btn sm" onClick={() => { setStep(true); addTask({ title: g.next_step!, goal_id: g.id, area_id: g.area_id, due_date: today() }).then(() => toast('Added to today’s tasks')).catch(() => {}) }}>Do it today</button> : <span class="faint small">Added for today</span>}
        </div>
      ) : <button class="link small" style="margin-top:8px" onClick={onOpen}>+ Add a next step</button>}
    </div>
  )
}
export function Goals() {
  const goals = useStore((s) => [...s.goals].sort((a, b) => a.sort - b.sort))
  const [edit, setEdit] = useState<Goal | 'new' | null>(null)
  const active = goals.filter((g) => g.status === 'active' && !g.suggested)
  const paused = goals.filter((g) => g.status === 'paused')
  const suggested = goals.filter((g) => g.status === 'active' && g.suggested)
  const done = goals.filter((g) => g.status === 'done')
  return (
    <>
      <PageHead title="Goals" sub="A few that matter, each with a next step." icon="target" color="var(--gold)" action={<button class="icon-btn" aria-label="New goal" onClick={() => setEdit('new')}><Icon name="plus" /></button>} />
      {suggested.length > 0 && (
        <Card title="Ideas from what you’ve told me" icon="sparkle" accent="var(--lilac)" class="soft">
          <p class="muted small" style="margin-bottom:6px">My guesses, not yours yet. Keep the ones that fit and reword them however you like.</p>
          {suggested.map((g) => (
            <div class="goal">
              <div class="g-title">{g.title}</div>
              {g.why && <div class="g-why">{g.why}</div>}
              <div class="row" style="margin-top:10px">
                <button class="btn sm primary" onClick={(e) => { burst(e.currentTarget); update('goals', g.id, { suggested: false }); toast('Added to your goals') }}>Keep</button>
                <button class="btn sm" onClick={() => setEdit(g)}>Edit</button>
                <button class="btn sm ghost" onClick={() => update('goals', g.id, { status: 'dropped' })}>Not for me</button>
              </div>
            </div>
          ))}
        </Card>
      )}
      <div class="grid-2">
        <div>
          <Card title="Active" icon="target" accent="var(--gold)" action={<span class="faint small">{active.length}</span>}>
            {active.length ? active.map((g) => <GoalRow g={g} onOpen={() => setEdit(g)} />) : <p class="empty">Add one goal you care about this semester. Three is plenty.</p>}
          </Card>
          {active.length > 4 && <p class="faint small" style="margin:-4px 6px 14px">Research on goals says fewer is better. Consider pausing a couple.</p>}
        </div>
        <div>
          {paused.length > 0 && <Card title="Paused">{paused.map((g) => <GoalRow g={g} onOpen={() => setEdit(g)} />)}</Card>}
          {done.length > 0 && <Card title="Achieved" icon="check" accent="var(--mint)">{done.map((g) => <div class="row" style="padding:7px 0"><Icon name="check" size={16} /><span class="grow">{g.title}</span></div>)}</Card>}
          <Card title="How to use this" icon="compass">
            <p class="muted small" style="line-height:1.55">Write why each goal matters, then keep one small next step on it. Link tasks to a goal and its ring fills as you finish them. The weekly review walks through each goal so nothing quietly stalls.</p>
          </Card>
        </div>
      </div>
      <Editor goal={edit} onClose={() => setEdit(null)} />
    </>
  )
}
