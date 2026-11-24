/**
 * Grade math for the class grade tracker. Pure functions, no UI.
 *
 * A course's weights live in courses.data.grading (Cat[]); every graded thing is a grade_items row.
 * Three ways to count an item:
 *  - now:  only real scores (plus finished completion work, which earns full credit)
 *  - none: "if nothing else gets turned in": open work scores 0, exams you'll still sit use your guess
 *  - keep: "keep up, skip catch-up": work due from today on earns full credit, past-due open work scores 0
 *  - all:  "with full catch-up": open and missing work earns full credit, exams use your guess
 */
export type Cat = {
  cat: string; weight: number | null
  rule?: 'complete'; pass?: number; maxMissing?: number // done/not: more than maxMissing below pass wipes the category
  drop?: number // lowest N don't count
  completion?: boolean // turned in = full credit (lessons, class activities)
  cap?: { below: number; letter: string } // e.g. under 50% on the final caps the course at D+
}
export type Status = 'todo' | 'done' | 'graded' | 'missing' | 'excused'
export type Item = {
  id: string; course_id: string; category: string; name: string; score: number | null; possible: number | null
  guess?: number | null; due_on: string | null; status: Status; note: string | null; sort: number
}
export type Mode = 'now' | 'none' | 'keep' | 'all'
export type Cut = [string, number]

export const DEFAULT_CUTS: Cut[] = [['A', 93], ['A-', 90], ['B+', 87], ['B', 83], ['B-', 80], ['C+', 77], ['C', 73], ['C-', 70], ['D+', 67], ['D', 63], ['D-', 60]]
export const letterOf = (pct: number, cuts: Cut[] = DEFAULT_CUTS) => cuts.find(([, t]) => pct >= t - 1e-9)?.[0] ?? 'F'
export const fmt = (n: number) => `${Math.round(n * 10) / 10}`.replace(/\.0$/, '')
const t0 = () => new Date().toISOString().slice(0, 10)
const ahead = (i: Item) => i.status === 'todo' && (!i.due_on || i.due_on >= t0())

/** Points an item counts for in a mode, or null when it doesn't count (yet). */
export function value(i: Item, c: Cat | undefined, mode: Mode): { got: number; of: number } | null {
  if (i.status === 'excused') return null
  const of = i.possible ?? 100
  const g = i.guess ?? null
  if (mode === 'all' && i.status === 'missing') return { got: of, of }
  if (i.score != null) return { got: i.score, of }
  if (i.status === 'done' && c?.completion) return { got: of, of }
  if (mode === 'now') return i.status === 'missing' ? { got: 0, of } : null
  if (g != null && (i.status === 'todo' || i.status === 'done')) return { got: g, of }
  if (i.status === 'done') return null // turned in, grade unknown, no guess
  return mode === 'all' || (mode === 'keep' && ahead(i)) ? { got: of, of } : { got: 0, of }
}

/** Is this an incomplete under a done/not rule, in this mode? */
function incomplete(i: Item, c: Cat, mode: Mode) {
  if (i.status === 'excused') return false
  if (mode === 'all') return false
  const pass = c.pass ?? 70
  if (i.status === 'missing') return true
  if (i.score != null) return (i.possible ? (i.score / i.possible) * 100 : i.score) < pass
  if (mode === 'keep') return i.status === 'todo' && !ahead(i)
  return mode === 'none' && i.status === 'todo'
}

export function catStanding(c: Cat, items: Item[], mode: Mode = 'now') {
  const mine = items.filter((i) => i.category === c.cat && i.status !== 'excused')
  if (c.rule === 'complete') {
    const inc = mine.filter((i) => incomplete(i, c, mode)).length
    const known = mode !== 'now' || mine.some((i) => i.status !== 'todo' || i.score != null)
    const max = c.maxMissing ?? Infinity
    const maybe = mode === 'now' ? mine.filter((i) => i.status === 'todo' && i.score == null && i.due_on && i.due_on < t0()).length : 0
    return { pct: known && mine.length ? (inc <= max ? 100 : 0) : null, inc, maybe, left: max === Infinity ? null : max - inc, n: mine.length }
  }
  let vals = mine.map((i) => value(i, c, mode)).filter((v): v is { got: number; of: number } => !!v && v.of > 0)
  if (c.drop && vals.length > c.drop) vals = [...vals].sort((a, b) => b.got / b.of - a.got / a.of).slice(0, vals.length - c.drop)
  const of = vals.reduce((a, v) => a + v.of, 0)
  return { pct: of ? (vals.reduce((a, v) => a + v.got, 0) / of) * 100 : null, inc: 0, maybe: 0, left: null, n: mine.length }
}

export function computeGrade(cats: Cat[], items: Item[], mode: Mode = 'now') {
  let s = 0, w = 0, scored = 0
  const rows = cats.map((c) => {
    const st = catStanding(c, items, mode)
    if (c.weight && st.pct != null) { s += c.weight * st.pct; w += c.weight; if (c.rule !== 'complete') scored += c.weight }
    return { c, ...st }
  })
  // A done/not category alone says little about the grade, so wait for real scores.
  return { pct: w && scored ? s / w : null, rows, weighted: scored ? w : 0, unweighted: cats.filter((c) => c.weight == null).map((c) => c.cat) }
}

const EXAM = /test|exam|final|midterm/i
/** The what-ifs, each over the whole course with exams at your guesses. Null until every mode has a grade. */
export function scenarios(cats: Cat[], items: Item[]) {
  const a = computeGrade(cats, items, 'none'), k = computeGrade(cats, items, 'keep'), b = computeGrade(cats, items, 'all')
  return a.pct == null || k.pct == null || b.pct == null ? null : { none: a, keep: k, all: b }
}

/**
 * Path to a letter: a taken-but-ungraded exam (like Test 2) at a range of scores, and for each, the score you'd
 * need on every exam still ahead (same score on each) for the top letters. Assumes full catch-up elsewhere.
 */
export function pathTable(cats: Cat[], items: Item[], cuts: Cut[], targets = 2) {
  const examCat = (i: Item) => EXAM.test(i.category) && cats.some((c) => c.cat === i.category && c.weight)
  const ahead = items.filter((i) => examCat(i) && i.status === 'todo' && i.score == null)
  if (!ahead.length) return null
  const pending = items.find((i) => examCat(i) && i.status === 'done' && i.score == null) ?? null
  const grade = (x: number, p: number | null) => computeGrade(cats, items.map((i) =>
    ahead.includes(i) ? { ...i, guess: (x / 100) * (i.possible ?? 100) } : pending && i.id === pending.id && p != null ? { ...i, guess: (p / 100) * (i.possible ?? 100) } : i), 'all').pct ?? 0
  const top = cuts.slice(0, targets)
  const need = (p: number | null) => {
    const lo = grade(0, p), hi = grade(100, p) // linear in x
    return top.map(([l, t]) => ({ l, need: hi === lo ? null : ((t - lo) / (hi - lo)) * 100 }))
  }
  const ps = pending ? [70, 75, 80, 85, 90, 95, 100] : [null]
  return { pending, ahead, top, rows: ps.map((p) => ({ p, needs: need(p) })) }
}

/** Checklist text: "## Heading" lines and "- [ ] step" lines. */
export type PlanLine = { kind: 'head'; text: string } | { kind: 'step'; text: string; done: boolean; at: number }
export function parsePlan(src: string): PlanLine[] {
  return src.split('\n').map((l, at): PlanLine | null => {
    const h = /^##\s+(.+)$/.exec(l); if (h) return { kind: 'head', text: h[1].trim() }
    const s = /^- \[( |x)\] (.+)$/i.exec(l); if (s) return { kind: 'step', text: s[2].trim(), done: s[1].toLowerCase() === 'x', at }
    return null
  }).filter((x): x is PlanLine => !!x)
}
export function togglePlan(src: string, at: number) {
  return src.split('\n').map((l, i) => i !== at ? l : l.replace(/^- \[( |x)\]/i, (m) => m.toLowerCase() === '- [x]' ? '- [ ]' : '- [x]')).join('\n')
}
