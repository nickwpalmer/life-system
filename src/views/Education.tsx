import { useState } from 'preact/hooks'
import { useStore } from '../lib/store'
import { useRows, registerDemo, addRow, patchRow, dropRow } from '../lib/rows'
import { today, daysBetween, daysUntil, fmtDay, fromKey } from '../lib/dates'
import { Icon } from '../ui/icons'
import { Card, PageHead, Ring, Sheet } from '../ui/kit'
import { SchoolPanel, useKeyDates } from './School'
import { courseOf, kindOf, KINDS, openTask } from './Tasks'
import { GradeTracker, computeGrade, type Cat, type Item } from './GradeTracker'

/**
 * Education: your own little LMS. Classes this term, the degree plan, scholarships,
 * and every school you've been to, so you can see how far you've come.
 */
type Course = { id: string; code: string; name: string | null; term: string; credits: number | null; instructor: string | null; meets: string | null; color: string | null; starts_on: string | null; ends_on: string | null; status: 'current' | 'planned' | 'done' | 'dropped'; grade: string | null; sort: number; data?: { grading?: Cat[] } | null }
type Req = { id: string; program: string; grp: string; code: string | null; title: string; credits: number | null; status: 'needed' | 'planned' | 'in_progress' | 'done' | 'waived' | 'pending' | 'open'; term: string | null; grade: string | null; notes: string | null; sort: number }
type Scholarship = { id: string; name: string; sponsor: string | null; amount: number | null; amount_note: string | null; deadline: string | null; decision_on: string | null; url: string | null; requirements: string | null; notes: string | null; renewable: boolean | null; status: 'maybe' | 'to_apply' | 'applied' | 'awarded' | 'declined' | 'missed' }
type School = { id: string; name: string; kind: string; started: string | null; ended: string | null; credential: string | null; honors: string | null; gpa: number | null; credits: number | null; notes: string | null; sort: number }
type HistCourse = { id: string; school_id: string; term: string; term_order: number; code: string | null; title: string; credits: number | null; grade: string | null; note: string | null }

const COURSE_COLORS = ['#a98bff', '#ffa463', '#79e2b4', '#ff8cc8', '#8fc4ff', '#ffd66b']

// ---------- demo data (made up; the real rows live in your database) ----------
registerDemo('courses', () => [
  ['MATH 101', 'Calculus I', 4], ['ENGR 110', 'Intro to Engineering', 3], ['SEM 100', 'First-year Seminar', 1], ['WRIT 150', 'Writing Studio', 3],
].map(([code, name, cr], i) => ({ id: `c${i}`, code, name, term: 'Fall 2026', credits: cr, instructor: null, meets: i % 2 ? 'Tue/Thu' : 'Mon/Wed', color: null, starts_on: '2026-09-01', ends_on: '2026-12-18', status: 'current', grade: null, sort: i })) as never)
registerDemo('degree_reqs', () => ([
  ['Math', 'MATH 101', 'Calculus I', 4, 'in_progress'], ['Math', 'MATH 102', 'Calculus II', 4, 'planned'], ['Math', 'MATH 201', 'Calculus III', 4, 'needed'],
  ['Basic science', 'CHEM 101', 'General Chemistry I', 4, 'pending'], ['Basic science', 'PHYS 101', 'Physics I', 4, 'planned'],
  ['Major core', 'SEM 100', 'First-year Seminar', 1, 'in_progress'], ['Major core', 'ENGR 300', 'Transport', 3, 'needed'],
  ['Writing and gen ed', 'WRIT 101', 'College Writing', 3, 'done'], ['Transfer credit', null, 'Transfer electives', 40, 'done'],
  ['Open items', null, 'Choose a concentration', 0, 'open'],
] as const).map(([grp, code, title, credits, status], i) => ({ id: `r${i}`, program: 'BS Engineering', grp, code, title, credits, status, term: status === 'planned' ? 'Winter 2027' : null, grade: null, notes: null, sort: i })) as never)
registerDemo('scholarships', () => [
  { id: 's1', name: 'Transfer award', sponsor: 'University', amount: 2000, amount_note: null, deadline: null, decision_on: null, url: null, requirements: null, notes: null, renewable: true, status: 'awarded' },
  { id: 's2', name: 'Engineering society scholarship', sponsor: null, amount: 1500, amount_note: null, deadline: '2027-02-01', decision_on: null, url: null, requirements: 'Essay', notes: null, renewable: false, status: 'to_apply' },
] as never)
registerDemo('edu_schools', () => [
  { id: 'h1', name: 'High school', kind: 'high_school', started: '2014', ended: '2018', credential: 'Diploma', honors: null, gpa: 2.4, credits: 26, notes: null, sort: 0 },
  { id: 'h2', name: 'Community college', kind: 'community_college', started: '2018', ended: '2026', credential: 'Associate degree', honors: 'Cum laude', gpa: 3.5, credits: 70, notes: null, sort: 1 },
  { id: 'h3', name: 'University', kind: 'university', started: 'Fall 2026', ended: null, credential: 'BS in progress', honors: null, gpa: null, credits: null, notes: null, sort: 2 },
] as never)
registerDemo('edu_courses', () => {
  const g = ['C', 'B', 'D', 'C', 'B', 'A', 'B', 'A', 'A-', 'A', 'B+', 'A']
  return g.map((gr, i) => ({ id: `e${i}`, school_id: i < 6 ? 'h1' : 'h2', term: i < 6 ? `Year ${Math.floor(i / 2) + 1}` : `Term ${i - 5}`, term_order: i < 6 ? Math.floor(i / 2) : i, code: null, title: `Course ${i + 1}`, credits: i < 6 ? 0.5 : 3, grade: gr, note: null })) as never
})

// ---------- helpers ----------
const PTS: Record<string, number> = { 'A+': 4, A: 4, 'A-': 3.7, 'B+': 3.3, B: 3, 'B-': 2.7, 'C+': 2.3, C: 2, 'C-': 1.7, 'D+': 1.3, D: 1, 'D-': 0.7, F: 0, E: 0 }
export function gpa(rows: { grade: string | null; credits: number | null }[]) {
  let pts = 0, cr = 0
  for (const r of rows) { const p = PTS[(r.grade ?? '').toUpperCase()]; if (p == null) continue; const c = Number(r.credits ?? 0) || 0.5; pts += p * c; cr += c }
  return cr ? pts / cr : null
}
const termPct = (c: Course) => {
  if (!c.starts_on || !c.ends_on) return null
  const all = daysBetween(c.starts_on, c.ends_on), gone = daysBetween(c.starts_on, today())
  return Math.max(0, Math.min(1, gone / Math.max(1, all)))
}
const tint = (c: Course, i: number) => c.color ?? COURSE_COLORS[i % COURSE_COLORS.length]
const codeSlug = (code: string) => code.replace(/\s+/g, '-')
const norm = (x: string | null | undefined) => (x ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase()

type GradeLog = { id: string; course_id: string; estimate: number | null; letter: string | null; note: string | null; logged_at: string }
registerDemo('grade_logs', () => [
  { id: 'g1', course_id: 'c0', estimate: 84, letter: 'B', note: 'After test 1', logged_at: new Date(Date.now() - 20 * 864e5).toISOString() },
  { id: 'g2', course_id: 'c0', estimate: 88, letter: 'B+', note: 'Labs all in', logged_at: new Date(Date.now() - 4 * 864e5).toISOString() },
] as never)
const letterFor = (n: number) => n >= 93 ? 'A' : n >= 90 ? 'A-' : n >= 87 ? 'B+' : n >= 83 ? 'B' : n >= 80 ? 'B-' : n >= 77 ? 'C+' : n >= 73 ? 'C' : n >= 70 ? 'C-' : n >= 60 ? 'D' : 'F'

/**
 * How far through a class's known work you are: Canvas assignments whose date has passed, plus tasks you've
 * finished, out of everything known for the term. A rough read, not a grade.
 */
function useWork(code: string) {
  const events = useStore((s) => s.events)
  const tasks = useStore((s) => s.tasks)
  const now = new Date().toISOString()
  const canvas = events.filter((e) => e.calendar_name === 'Canvas' && !/^lesson\b/i.test(e.title) && norm(e.title.match(/\[([^\]]+)\]\s*$/)?.[1]) === norm(code))
  const mine = tasks.filter((t) => courseOf(t) === code)
  const doneT = mine.filter((t) => !openTask(t)).length
  const past = canvas.filter((e) => e.starts_at < now).length
  const total = canvas.length + mine.length
  return { total, done: past + doneT, open: mine.filter(openTask), canvasLeft: canvas.length - past }
}
function useGrades(courseId: string | undefined) {
  const rows = useRows<GradeLog>('grade_logs')
  return (rows ?? []).filter((g) => g.course_id === courseId).sort((a, b) => a.logged_at.localeCompare(b.logged_at))
}

/** Estimated grade, logged over time. Each save is a new entry, so you can see the trend through the term. */
function GradeCard({ course, color }: { course: Course; color: string }) {
  const log = useGrades(course.id)
  const [v, setV] = useState('')
  const [note, setNote] = useState('')
  const last = log[log.length - 1]
  async function add() {
    const n = Number(v); if (!v || Number.isNaN(n)) return
    setV(''); setNote('')
    await addRow('grade_logs', { course_id: course.id, estimate: n, letter: letterFor(n), note: note.trim() || null, logged_at: new Date().toISOString() }).catch(() => {})
  }
  const pts = log.filter((g) => g.estimate != null)
  const lo = Math.min(60, ...pts.map((g) => g.estimate!)), hi = 100
  return (
    <Card title="Estimated grade" icon="chart" accent={color}>
      {last ? <div class="row between" style="margin-bottom:10px"><span><b style={`font-size:28px;color:${color}`}>{last.letter ?? letterFor(last.estimate ?? 0)}</b> <span class="muted">{last.estimate != null ? `${Math.round(last.estimate)}%` : ''}</span></span><span class="faint small">as of {fmtDay(last.logged_at.slice(0, 10)).replace(/,.*/, '')}</span></div>
        : <p class="faint small" style="margin:-4px 0 10px">Log what you think your grade is now, from Canvas or a guess. Do it after each test or every couple of weeks and you’ll see the trend.</p>}
      {pts.length > 1 && <svg class="gline" viewBox="0 0 100 34" preserveAspectRatio="none">
        <polyline fill="none" stroke={color} stroke-width="2" vector-effect="non-scaling-stroke" points={pts.map((g, i) => `${(i / (pts.length - 1)) * 100},${32 - ((g.estimate! - lo) / (hi - lo)) * 30}`).join(' ')} />
      </svg>}
      <div class="row" style="gap:8px">
        <input class="input" style="width:90px" type="number" inputMode="decimal" placeholder="%" value={v} onInput={(e) => setV((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
        <input class="input grow" placeholder="Note (optional)" value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
        {v && <button class="btn sm primary" onClick={add}>Log</button>}
      </div>
      {log.length > 0 && <div style="margin-top:10px">{[...log].reverse().slice(0, 6).map((g) => (
        <div class="row between small fin-row"><span>{g.letter ?? ''} {g.estimate != null ? `${Math.round(g.estimate)}%` : ''}{g.note ? <span class="faint"> · {g.note}</span> : null}</span>
          <span class="row" style="gap:8px"><span class="faint">{fmtDay(g.logged_at.slice(0, 10)).replace(/,.*/, '')}</span><button class="faint tiny" aria-label="Remove" onClick={() => dropRow('grade_logs', g.id).catch(() => {})}><Icon name="x" size={12} /></button></span></div>
      ))}</div>}
    </Card>
  )
}

/** One class tile on the overview: ring is how far through the known work you are; the letter is your latest estimate. */
function ClassTile({ c, i }: { c: Course; i: number }) {
  const w = useWork(c.code)
  const g = useGrades(c.id)
  const items = (useRows<Item>('grade_items') ?? []).filter((x) => x.course_id === c.id)
  const tr = c.data?.grading ? computeGrade(c.data.grading, items).pct : null
  const last = g[g.length - 1] ?? (tr != null ? { letter: letterFor(tr), estimate: tr } : undefined)
  const t0 = today()
  const late = w.open.filter((t) => t.due_date && t.due_date < t0).length
  const pct = w.total ? w.done / w.total : termPct(c) ?? 0
  return (
    <a class="ctile" href={`#/school/c-${codeSlug(c.code)}`} style={`--c:${tint(c, i)}`}>
      <div class="row between"><b>{c.code}</b>{last ? <span class="ctile-grade">{last.letter ?? letterFor(last.estimate ?? 0)}</span> : <Ring value={pct} size={34} stroke={4} color={tint(c, i)} />}</div>
      <div class="ellipsis muted small">{c.name}</div>
      <div class="c-meta">{w.total ? `${w.done} of ${w.total} done` : `${Math.round(pct * 100)}% of term`}{w.open.length ? ` · ${w.open.length} open` : ''}{late ? <span style="color:var(--coral)"> · {late} late</span> : null}</div>
    </a>
  )
}

// ---------- overview ----------
function Overview() {
  const courses = useRows<Course>('courses')
  const reqs = useRows<Req>('degree_reqs')
  const cur = (courses ?? []).filter((c) => c.status === 'current')
  const pct = cur.length ? termPct(cur[0]) : null
  const left = cur[0]?.ends_on ? daysUntil(cur[0].ends_on) : null
  const first = reqs?.[0]?.program
  const main = (reqs ?? []).filter((r) => r.program === first)
  const done = main.filter((r) => r.status === 'done' || r.status === 'waived').reduce((a, r) => a + Number(r.credits ?? 0), 0)
  const prog = main.filter((r) => r.status === 'in_progress').reduce((a, r) => a + Number(r.credits ?? 0), 0)
  const open = main.filter((r) => r.status === 'open' || r.status === 'pending').length
  return (
    <>
      {cur.length > 0 && (
        <section class="card term" style="--accent:var(--lilac)">
          <div class="row between"><div><div class="faint tiny">{cur[0].term}</div><h2>{pct != null ? `${Math.round(pct * 100)}% through the term` : 'This term'}</h2></div>{left != null && left >= 0 && <span class="pill">{left} days left</span>}</div>
          {pct != null && <div class="progress" style="margin-top:12px"><i style={`width:${pct * 100}%`} /></div>}
        </section>
      )}
      <div class="ctiles">
        {cur.map((c, i) => <ClassTile c={c} i={i} />)}
      </div>
      <SchoolPanel />
      {reqs && <Journey reqs={main} />}
      {reqs && (
        <a class="card prompt" href="#/school/degree" style="--accent:var(--gold)">
          <span class="orb"><Icon name="degree" size={22} /></span>
          <span class="grow"><h3>{done} credits done{prog ? `, ${prog} in progress` : ''}</h3><p class="muted small">{first} plan{open ? ` · ${open} open item${open === 1 ? '' : 's'}` : ''}</p></span><Icon name="chev" />
        </a>
      )}
    </>
  )
}

/** The long view: credits behind you, this term, and what's left, from the degree plan and past schools. */
function Journey({ reqs }: { reqs: Req[] }) {
  const schools = useRows<School>('edu_schools')
  const hist = useRows<HistCourse>('edu_courses')
  const items = reqs.filter((r) => r.grp !== 'Open items')
  const sum = (f: (r: Req) => boolean) => items.filter(f).reduce((a, r) => a + Number(r.credits ?? 0), 0)
  const done = sum((r) => r.status === 'done' || r.status === 'waived'), now = sum((r) => r.status === 'in_progress'), later = sum((r) => r.status === 'planned' || r.status === 'pending'), need = sum((r) => r.status === 'needed')
  const total = done + now + later + need
  if (!total) return null
  const college = (schools ?? []).filter((s) => s.kind !== 'high_school')
  const past = (hist ?? []).filter((h) => college.some((s) => s.id === h.school_id))
  const g = gpa(past)
  const seg = (v: number, c: string) => <i style={`width:${(v / total) * 100}%;background:${c}`} />
  return (
    <section class="card">
      <div class="row between"><h2>{Math.round(((done + now) / total) * 100)}% of the way</h2><a class="faint small" href="#/school/history">History</a></div>
      <div class="stackbar" style="margin:12px 0 8px">{seg(done, 'var(--mint)')}{seg(now, 'var(--sky)')}{seg(later, 'var(--lilac)')}</div>
      <div class="legend"><span><i class="dot" style="background:var(--mint)" />{done} done</span><span><i class="dot" style="background:var(--sky)" />{now} this term</span><span><i class="dot" style="background:var(--lilac)" />{later} planned</span><span><i class="dot" style="background:var(--faint)" />{need} to go</span></div>
      {(past.length > 0 || g != null) && <p class="faint small" style="margin-top:8px">{past.length} college courses behind you{g != null ? `, ${g.toFixed(2)} GPA across them` : ''}.</p>}
    </section>
  )
}

// ---------- one class ----------
function ClassPage({ code }: { code: string }) {
  const courses = useRows<Course>('courses')
  const tasks = useStore((s) => s.tasks)
  const [kd] = useKeyDates()
  const i = (courses ?? []).findIndex((c) => c.code === code)
  const c = courses?.[i]
  const mine = tasks.filter((t) => courseOf(t) === code)
  const work = useWork(code)
  const openT = mine.filter(openTask).sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9'))
  const dates = (kd ?? []).filter((k) => k.course?.replace(/[-\s]/g, '') === code.replace(/\s/g, '') && k.day >= today())
  const color = c ? tint(c, i) : 'var(--lilac)'
  const t0 = today()
  return (
    <>
      <PageHead title={code} sub={c?.name ?? undefined} back="#/school" icon="school" color={color} />
      {c && (
        <div class="stats3">
          <div><b>{work.total ? `${work.done}/${work.total}` : '–'}</b><span>assignments behind you</span></div>
          <div><b>{termPct(c) != null ? Math.round(termPct(c)! * 100) : '–'}%</b><span>through the term</span></div>
          <div><b>{c.credits ?? '–'}</b><span>credits</span></div>
        </div>
      )}
      {c && (c.instructor || c.meets) && <p class="muted small" style="margin:0 4px 14px">{[c.instructor, c.meets].filter(Boolean).join(' · ')}</p>}
      {c && <GradeTracker course={c} color={color} />}
      {c && <GradeCard course={c} color={color} />}
      {dates.length > 0 && <Card title="Key dates" icon="flame" accent="var(--pink)">{dates.map((k) => <div class="row between" style="padding:7px 0;border-bottom:1px solid var(--line)"><span>{k.title}{k.kind === 'exam' && <span class="pill" style="--c:var(--pink);margin-left:6px">Exam</span>}</span><span class="faint small">{fmtDay(k.day)}</span></div>)}</Card>}
      {[...KINDS, { key: 'other', label: 'Other' }].map((k) => {
        const g = openT.filter((t) => kindOf(t) === k.key)
        return g.length ? <Card title={k.label} icon="tasks" accent={color}>{g.map((t) => <a class="row between" href={`#/tasks/education`} style="padding:8px 0;border-bottom:1px solid var(--line);color:inherit;text-decoration:none"><span>{t.title}</span>{t.due_date && <span class="small" style={t.due_date < t0 ? 'color:var(--coral)' : 'color:var(--faint)'}>{fmtDay(t.due_date)}</span>}</a>)}</Card> : null
      })}
      {!openT.length && <div class="card soft"><p class="muted">Nothing open for {code}. Add homework with “{code}” in the title and it shows up here.</p></div>}
    </>
  )
}

// ---------- degree plan ----------
const ST: Record<Req['status'], [string, string]> = {
  done: ['Done', 'var(--mint)'], waived: ['Waived', 'var(--mint)'], in_progress: ['In progress', 'var(--sky)'], planned: ['Planned', 'var(--lilac)'],
  needed: ['Still needed', 'var(--faint)'], pending: ['Not on audit yet', 'var(--gold)'], open: ['To sort out', 'var(--gold)'],
}
function Degree() {
  const reqs = useRows<Req>('degree_reqs')
  const [pick, setProg] = useState<string | null>(null)
  const [by, setBy] = useState<'group' | 'term'>('group')
  const [open, setOpen] = useState<Req | null>(null)
  const programs = [...new Set((reqs ?? []).map((r) => r.program))]
  const prog = pick ?? programs[0]
  const rows = (reqs ?? []).filter((r) => r.program === prog)
  const items = rows.filter((r) => r.grp !== 'Open items')
  const todo = rows.filter((r) => r.grp === 'Open items' && r.status !== 'done')
  const sum = (f: (r: Req) => boolean) => items.filter(f).reduce((a, r) => a + Number(r.credits ?? 0), 0)
  const done = sum((r) => r.status === 'done' || r.status === 'waived'), inprog = sum((r) => r.status === 'in_progress'), plan = sum((r) => r.status === 'planned' || r.status === 'pending'), need = sum((r) => r.status === 'needed')
  const total = done + inprog + plan + need || 1
  const keyOf = (r: Req) => by === 'group' ? r.grp : r.status === 'done' || r.status === 'waived' ? 'Done' : r.term ?? 'Not scheduled'
  const order = (k: string) => { const m = k.match(/(Winter|Summer|Spring|Fall) (\d{4})/); return k === 'Done' ? '0' : m ? `${m[2]}${{ Winter: 1, Spring: 2, Summer: 2, Fall: 3 }[m[1]]}` : '9' }
  const groups = new Map<string, Req[]>()
  for (const r of items) groups.set(keyOf(r), [...(groups.get(keyOf(r)) ?? []), r])
  const keys = [...groups.keys()]; if (by === 'term') keys.sort((a, b) => order(a).localeCompare(order(b)))
  const setStatus = (r: Req, status: Req['status']) => { patchRow('degree_reqs', r.id, { status }).catch(() => {}); setOpen({ ...r, status }) }
  if (!reqs) return <div class="skeleton" />
  return (
    <>
      {programs.length > 1 && <div class="chips" style="margin-bottom:12px">{programs.map((p) => <button class={`chip ${prog === p ? 'on' : ''}`} onClick={() => setProg(p)}>{p}</button>)}</div>}
      <section class="card">
        <div class="row between"><h2>{done} of {total} credits</h2><span class="faint small">{Math.round((done / total) * 100)}%</span></div>
        <div class="sbar" style="margin:12px 0 10px">
          {[[done, 'var(--mint)'], [inprog, 'var(--sky)'], [plan, 'var(--lilac)'], [need, 'var(--surface-3)']].map(([v, c]) => <i style={`width:${(Number(v) / total) * 100}%;background:${c}`} />)}
        </div>
        <div class="legend">{[['Done', done, 'var(--mint)'], ['In progress', inprog, 'var(--sky)'], ['Planned', plan, 'var(--lilac)'], ['Still needed', need, 'var(--faint)']].map(([l, v, c]) => <span><i class="dot" style={`background:${c}`} />{l} {v}</span>)}</div>
      </section>
      {todo.length > 0 && <Card title="To sort out" icon="bolt" accent="var(--gold)">{todo.map((r) => <button class="req" onClick={() => setOpen(r)}><span class="grow"><div>{r.title}</div>{r.notes && <div class="faint small">{r.notes}</div>}</span><Icon name="chev" size={16} /></button>)}</Card>}
      <div class="chips" style="margin:4px 0 12px"><button class={`chip ${by === 'group' ? 'on' : ''}`} onClick={() => setBy('group')}>By requirement</button><button class={`chip ${by === 'term' ? 'on' : ''}`} onClick={() => setBy('term')}>By term</button></div>
      {keys.map((k) => {
        const g = groups.get(k)!
        const cr = g.reduce((a, r) => a + Number(r.credits ?? 0), 0)
        return (
          <Card title={k} action={<span class="faint small">{cr} cr</span>}>
            {g.map((r) => (
              <button class="req" onClick={() => setOpen(r)}>
                <i class="dot" style={`background:${ST[r.status][1]}`} />
                <span class="grow"><div>{r.code ? <b>{r.code} </b> : null}<span class="muted">{r.title}</span></div>{by === 'group' && r.term && r.status !== 'done' && <div class="faint tiny">{r.term}</div>}</span>
                <span class="faint small">{r.credits ? `${r.credits}` : ''}</span>
              </button>
            ))}
          </Card>
        )
      })}
      <p class="faint tiny" style="margin:4px 6px 16px">Built from your degree audit and plan. Tap a row to change its status.</p>
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.code ?? 'Requirement'}>
        {open && <>
          <p style="margin-bottom:6px">{open.title}</p>
          <p class="faint small" style="margin-bottom:12px">{[open.grp, open.credits ? `${open.credits} credits` : null, open.term].filter(Boolean).join(' · ')}</p>
          {open.notes && <p class="muted small" style="margin-bottom:14px">{open.notes}</p>}
          <div class="chips">{(Object.keys(ST) as Req['status'][]).filter((s) => open.grp === 'Open items' ? s === 'open' || s === 'done' : s !== 'open').map((s) => <button class={`chip ${open.status === s ? 'on' : ''}`} style={`--c:${ST[s][1]}`} onClick={() => setStatus(open, s)}>{s === 'done' && open.grp === 'Open items' ? 'Sorted' : ST[s][0]}</button>)}</div>
        </>}
      </Sheet>
    </>
  )
}

// ---------- history ----------
function History() {
  const schools = useRows<School>('edu_schools')
  const rows = useRows<HistCourse>('edu_courses')
  const courses = useRows<Course>('courses')
  const [open, setOpen] = useState<string | null>(null)
  if (!schools || !rows) return <div class="skeleton" />
  const COL: Record<string, string> = { high_school: 'var(--sky)', community_college: 'var(--orange)', university: 'var(--lilac)', other: 'var(--mint)' }
  // One bar per term (per year in high school), colored by school.
  const terms: { key: string; label: string; school: School; gpa: number | null; rows: HistCourse[] }[] = []
  for (const s of schools) {
    const mine = rows.filter((r) => r.school_id === s.id)
    const ts = [...new Set(mine.sort((a, b) => a.term_order - b.term_order).map((r) => r.term))]
    for (const t of ts) { const rs = mine.filter((r) => r.term === t); terms.push({ key: `${s.id}:${t}`, label: t, school: s, gpa: gpa(rs), rows: rs }) }
    if (s.kind === 'university') {
      for (const t of [...new Set((courses ?? []).filter((c) => c.status === 'done' && c.grade).map((c) => c.term))]) {
        const rs = (courses ?? []).filter((c) => c.term === t && c.grade).map((c) => ({ id: c.id, school_id: s.id, term: t, term_order: 0, code: c.code, title: c.name ?? c.code, credits: c.credits, grade: c.grade, note: null }))
        terms.push({ key: `${s.id}:${t}`, label: t, school: s, gpa: gpa(rs), rows: rs })
      }
    }
  }
  const graded = terms.filter((t) => t.gpa != null)
  const recent = graded.slice(-3)
  const recentGpa = recent.length ? gpa(recent.flatMap((t) => t.rows)) : null
  return (
    <>
      <section class="card">
        <div class="card-h"><h2>Grades over time</h2></div>
        <div class="growth">
          {graded.map((t) => <button class={`gbar ${open === t.key ? 'on' : ''}`} style={`--c:${COL[t.school.kind]};--h:${Math.max(4, (t.gpa! / 4) * 100)}%`} title={`${t.label}: ${t.gpa!.toFixed(2)}`} onClick={() => setOpen(open === t.key ? null : t.key)}><i /></button>)}
        </div>
        <div class="legend" style="margin-top:10px">{schools.filter((s) => graded.some((t) => t.school.id === s.id)).map((s) => <span><i class="dot" style={`background:${COL[s.kind]}`} />{s.name}</span>)}</div>
        {recentGpa != null && <p class="small" style="margin-top:12px">Your last {recent.length} graded terms average <b>{recentGpa.toFixed(2)}</b>.</p>}
        {open && (() => { const t = terms.find((x) => x.key === open)!; return <div class="termbox"><div class="row between"><b>{t.label}</b><span class="faint small">{t.school.name} · {t.gpa?.toFixed(2)}</span></div>{t.rows.map((r) => <div class="row between small" style="padding:4px 0"><span class="ellipsis">{r.code ? `${r.code} ` : ''}{r.title}</span><span class="faint">{r.grade}</span></div>)}</div> })()}
      </section>
      {[...schools].reverse().map((s) => {
        const mine = terms.filter((t) => t.school.id === s.id)
        return (
          <Card title={s.name} accent={COL[s.kind]} action={<span class="faint small">{[s.started, s.ended ?? 'now'].filter(Boolean).join(' to ')}</span>}>
            {s.credential && <div>{s.credential}</div>}
            {s.honors && <div class="small" style="color:var(--gold);margin-top:2px">{s.honors}</div>}
            <div class="row wrap" style="gap:8px;margin-top:8px">{s.gpa != null && <span class="pill" style={`--c:${COL[s.kind]}`}>GPA {Number(s.gpa).toFixed(2)}</span>}{s.credits != null && <span class="pill quiet">{s.credits} credits</span>}{mine.length > 0 && <span class="pill quiet">{mine.length} terms</span>}</div>
            {s.notes && <p class="faint small" style="margin-top:8px">{s.notes}</p>}
          </Card>
        )
      })}
    </>
  )
}

// ---------- scholarships ----------
const SCH: Record<Scholarship['status'], [string, string]> = { maybe: ['Maybe', 'var(--faint)'], to_apply: ['To apply', 'var(--lilac)'], applied: ['Waiting to hear', 'var(--sky)'], awarded: ['Awarded', 'var(--mint)'], declined: ['Not this time', 'var(--faint)'], missed: ['Missed', 'var(--faint)'] }
const money = (n: number) => `$${Math.round(n).toLocaleString()}`
function Scholarships() {
  const rows = useRows<Scholarship>('scholarships')
  const [edit, setEdit] = useState<Partial<Scholarship> | null>(null)
  if (!rows) return <div class="skeleton" />
  const sum = (f: (r: Scholarship) => boolean) => rows.filter(f).reduce((a, r) => a + Number(r.amount ?? 0), 0)
  const potential = sum((r) => ['maybe', 'to_apply', 'applied'].includes(r.status)), won = sum((r) => r.status === 'awarded')
  const save = async () => {
    if (!edit?.name?.trim()) return
    const { id, ...rest } = edit
    const row = { ...rest, name: edit.name.trim(), amount: edit.amount ?? null, status: edit.status ?? 'to_apply' }
    try { if (id) await patchRow('scholarships', id, row); else await addRow('scholarships', row); setEdit(null) } catch { /* toast shown */ }
  }
  return (
    <>
      <div class="stats3">
        <div><b>{rows.filter((r) => r.status === 'to_apply').length}</b><span>to apply</span></div>
        <div><b>{rows.filter((r) => r.status === 'applied').length}</b><span>waiting</span></div>
        <div><b style="color:var(--mint)">{money(won)}</b><span>awarded</span></div>
      </div>
      {potential > 0 && <p class="muted small" style="margin:-4px 4px 12px">{money(potential)} more is possible from the ones still open.</p>}
      {(['to_apply', 'applied', 'maybe', 'awarded', 'declined', 'missed'] as const).map((st) => {
        const g = rows.filter((r) => r.status === st)
        return g.length ? <Card title={SCH[st][0]} accent={SCH[st][1]}>{g.map((r) => (
          <button class="req" onClick={() => setEdit(r)}>
            <span class="grow"><div>{r.name}</div><div class="faint small">{[r.sponsor, r.deadline ? `due ${fmtDay(r.deadline)}` : null, r.renewable ? 'renewable' : null].filter(Boolean).join(' · ')}</div></span>
            <span class="small">{r.amount ? money(r.amount) : r.amount_note ?? '–'}</span>
          </button>
        ))}</Card> : null
      })}
      <button class="btn block" onClick={() => setEdit({ status: 'to_apply' })}><Icon name="plus" size={18} />Add a scholarship</button>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Scholarship' : 'New scholarship'}>
        {edit && <>
          <label class="field"><span>Name</span><input class="input" value={edit.name ?? ''} onInput={(e) => setEdit({ ...edit, name: (e.target as HTMLInputElement).value })} /></label>
          <div class="row">
            <label class="field grow"><span>Amount ($)</span><input class="input" type="number" inputMode="decimal" value={edit.amount ?? ''} onInput={(e) => setEdit({ ...edit, amount: (e.target as HTMLInputElement).value ? Number((e.target as HTMLInputElement).value) : null })} /></label>
            <label class="field grow"><span>Deadline</span><input class="input" type="date" value={edit.deadline ?? ''} onInput={(e) => setEdit({ ...edit, deadline: (e.target as HTMLInputElement).value || null })} /></label>
          </div>
          <label class="field"><span>From</span><input class="input" value={edit.sponsor ?? ''} onInput={(e) => setEdit({ ...edit, sponsor: (e.target as HTMLInputElement).value || null })} /></label>
          <div class="field"><span>Status</span><div class="chips">{(Object.keys(SCH) as Scholarship['status'][]).map((s) => <button class={`chip ${(edit.status ?? 'to_apply') === s ? 'on' : ''}`} style={`--c:${SCH[s][1]}`} onClick={() => setEdit({ ...edit, status: s })}>{SCH[s][0]}</button>)}</div></div>
          <label class="field"><span>Notes</span><textarea class="input" rows={2} value={edit.notes ?? ''} onInput={(e) => setEdit({ ...edit, notes: (e.target as HTMLTextAreaElement).value || null })} /></label>
          <button class="btn primary block" onClick={save}>Save</button>
          {edit.id && <button class="btn ghost danger block" style="margin-top:8px" onClick={() => { if (confirm('Delete this scholarship?')) { dropRow('scholarships', edit.id!).catch(() => {}); setEdit(null) } }}>Delete</button>}
        </>}
      </Sheet>
    </>
  )
}

export function Education({ tab }: { tab?: string }) {
  const schools = useRows<School>('edu_schools')
  if (tab?.startsWith('c-')) return <ClassPage code={tab.slice(2).replace(/-/g, ' ')} />
  const t = tab ?? 'overview'
  const now = schools?.find((x) => !x.ended) ?? schools?.[schools.length - 1]
  const sub = now ? [now.name, now.credential].filter(Boolean).join(' · ') : 'Classes, degree, history'
  const tabs: [string, string][] = [['overview', 'This term'], ['degree', 'Degree plan'], ['money', 'Scholarships'], ['history', 'History']]
  return (
    <>
      <PageHead title="Education" sub={sub} icon="school" color="var(--lilac)" />
      <div class="chips scroll" style="margin-bottom:14px">{tabs.map(([k, l]) => <a class={`chip ${t === k ? 'on' : ''}`} href={`#/school${k === 'overview' ? '' : `/${k}`}`}>{l}</a>)}</div>
      {t === 'degree' ? <Degree /> : t === 'money' ? <Scholarships /> : t === 'history' ? <History /> : <Overview />}
    </>
  )
}
export { fromKey }
