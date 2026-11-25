/**
 * Fake data for previewing the app without signing in: open the site with ?demo.
 * Nothing here touches the database; writes only change this page's memory.
 */
import type { Data } from './store'
import type { Area, Metric, Task, Log, Checkin, CalEvent } from './types'
import { dayKey, addDays, lastNDays, today, inDays, weekStart } from './dates'

let n = 0
const id = () => `demo-${++n}`
const rnd = (seed: number) => { const x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x) }

export function demoData(): Data {
  const areaDefs: [string, string, string][] = [
    ['education', 'Education', '#a98bff'], ['mental', 'Mental health', '#ff8cc8'], ['finances', 'Finances', '#ffa463'], ['health', 'Body & health', '#79e2b4'],
    ['work', 'Work', '#ffd66b'], ['relationships', 'Relationships', '#ff8a7a'], ['growth', 'Growth & projects', '#8fc4ff'], ['home', 'Home & life', '#6fe0dc'],
  ]
  const areas: Area[] = areaDefs.map(([key, name, color], i) => ({ id: id(), key, name, color, icon: null, sort: i, archived: false }))
  const A = (k: string) => areas.find((a) => a.key === k)!.id
  const mDefs: [string, string, Metric['kind'], string | null, Metric['role'], string][] = [
    ['mood', 'Mood', 'scale', null, 'track', 'mental'], ['anxiety', 'Anxiety', 'scale', null, 'track', 'mental'], ['energy', 'Energy', 'scale', null, 'track', 'health'], ['focus', 'Focus', 'scale', null, 'track', 'mental'],
    ['sleep_hours', 'Sleep', 'duration', 'h', 'health', 'health'], ['sleep_score', 'Sleep score', 'number', null, 'health', 'health'], ['hrv', 'HRV', 'number', 'ms', 'health', 'health'],
    ['resting_hr', 'Resting HR', 'number', 'bpm', 'health', 'health'], ['steps', 'Steps', 'count', null, 'health', 'health'], ['exercise', 'Exercise', 'duration', 'min', 'habit', 'health'],
    ['water', 'Water', 'count', 'glass', 'habit', 'health'], ['meditation', 'Meditation', 'duration', 'min', 'habit', 'mental'], ['study', 'Study', 'duration', 'min', 'habit', 'education'],
    ['reading', 'Reading', 'duration', 'min', 'habit', 'growth'], ['caffeine', 'Caffeine', 'count', 'drink', 'vice', 'health'], ['alcohol', 'Alcohol', 'count', 'drink', 'vice', 'health'],
    ['nicotine', 'Nicotine', 'count', null, 'vice', 'health'], ['cannabis', 'Cannabis', 'count', null, 'vice', 'health'], ['screen_time', 'Screen time', 'duration', 'h', 'vice', 'mental'],
    ['spend', 'Spending', 'number', '$', 'track', 'finances'],
  ]
  const metrics: Metric[] = mDefs.map(([key, name, kind, unit, role, ar], i) => ({ id: id(), key, name, kind, unit, role, area_id: A(ar), target: null, target_period: null, higher_is_better: role !== 'vice', icon: null, sort: i, active: role !== 'vice', show_today: true }))
  const M = (k: string) => metrics.find((m) => m.key === k)!.id
  const logs: Log[] = []
  const days = lastNDays(45).slice(0, -1)
  days.forEach((d, i) => {
    const r = (k: number) => rnd(i * 31 + k)
    const sleep = 5.5 + r(1) * 3
    const add = (k: string, v: number | null) => { if (v != null) logs.push({ id: id(), metric_id: M(k), value_num: Math.round(v * 10) / 10, value_text: null, occurred_at: new Date(d + 'T12:00:00').toISOString(), note: null, source: 'daily' }) }
    add('sleep_hours', sleep); add('mood', Math.max(1, Math.min(10, Math.round(3 + sleep * 0.6 + r(2) * 2)))); add('energy', Math.round(4 + r(3) * 5))
    add('anxiety', Math.round(2 + r(4) * 6)); add('exercise', r(5) > 0.45 ? 30 + Math.round(r(6) * 4) * 15 : null); add('meditation', r(7) > 0.5 ? 10 : null)
    add('study', r(8) > 0.3 ? Math.round(r(9) * 6) * 30 : null); add('water', Math.round(3 + r(10) * 5)); add('caffeine', Math.round(r(11) * 3))
    add('spend', r(12) > 0.3 ? Math.round(r(13) * 60) : 0); add('screen_time', 2 + Math.round(r(14) * 8) / 2); add('steps', 3000 + Math.round(r(15) * 9000))
  })
  const T = (title: string, area: string, extra: Partial<Task> = {}): Task => ({ id: id(), title, area_id: A(area), goal_id: null, notes: null, status: 'open', priority: 0, due_date: null, due_time: null, scheduled_for: null, estimate_min: null, completed_at: null, created_at: new Date().toISOString(), tags: [], ...extra })
  const tasks: Task[] = [
    T('Problem set 6', 'education', { due_date: today(), priority: 3, tags: ['SEM-100'] }),
    T('Read chapter 9 for MAT-2010', 'education', { due_date: inDays(2), priority: 2, tags: ['MAT-2010'] }),
    T('Lab report draft', 'education', { due_date: inDays(-1), priority: 2, tags: ['BE-1200'] }),
    T('Honors reflection essay', 'education', { due_date: inDays(6), priority: 2, tags: ['HON-1000'] }),
    T('Ask about Dec shift swap', 'work', { due_date: inDays(1) }),
    T('Call about health insurance', 'finances', { priority: 1 }),
    T('Book dentist cleaning', 'health'),
    T('Gift for Alex', 'relationships', { due_date: inDays(9), priority: 2 }),
    T('Print hand parts for e-Nable', 'growth'),
    T('Order new desk lamp', 'home', { tags: ['someday'] }),
    T('look into summer research programs', 'education', { status: 'inbox', area_id: null }),
    T('cancel unused streaming sub', 'finances', { status: 'inbox', area_id: null }),
    T('Finish MAT quiz 8', 'education', { status: 'done', completed_at: new Date().toISOString() }),
  ]
  const checkins: Checkin[] = days.slice(-10).flatMap((d, i) => [
    { id: id(), kind: 'morning' as const, day: d, mood: 6 + (i % 3), energy: 6, stress: 4, focus: null, sleep_quality: 7, intention: 'Stay on top of classes', top_three: ['Problem set', 'Gym', 'Call home'], gratitude: ['Coffee'], win: null, lesson: null, reflection: null, data: {} },
    { id: id(), kind: 'night' as const, day: d, mood: 7, energy: 5, stress: 3, focus: 6, sleep_quality: null, intention: null, top_three: [], gratitude: [], win: i % 2 ? 'Finished the lab early' : 'Good talk with Sam', lesson: 'Start problem sets earlier', reflection: null, data: {} },
  ])
  const ev = (d: string, h: number, title: string, cal: string, dur = 1): CalEvent => { const s = new Date(d + 'T00:00:00'); s.setHours(h); return { id: id(), title, starts_at: s.toISOString(), ends_at: new Date(s.getTime() + dur * 3600e3).toISOString(), all_day: false, location: null, calendar_name: cal } }
  const events: CalEvent[] = []
  for (let i = -24; i < 30; i++) {
    const d = dayKey(addDays(new Date(), i)); const wd = addDays(new Date(), i).getDay()
    if (wd >= 1 && wd <= 5) { events.push(ev(d, 9, 'SEM 100 lecture', 'School', 1.25)); if (wd % 2) events.push(ev(d, 13, 'MATH 101', 'School')) }
    if (wd === 6) events.push(ev(d, 10, 'Shift', 'Work', 6))
    if (wd === 3) events.push(ev(d, 19, 'Dinner with Sam', 'Personal', 2))
    if (wd === 2 || wd === 4) events.push({ ...ev(d, 0, wd === 4 && i % 3 === 0 ? 'Quiz 4 [MATH_101]' : 'HW set [MATH_101]', 'Canvas'), all_day: true, starts_at: `${d}T00:00:00Z`, ends_at: null })
  }
  return {
    profile: { id: 'demo', display_name: 'Jordan', timezone: 'America/Detroit', settings: {} },
    areas, metrics, tasks, logs, checkins, events,
    journal: [{ id: id(), area_id: null, title: 'Sunday reset', body: 'Felt scattered this week. Too many small things in my head. Writing them all down helped.', mood: 6, tags: [], occurred_at: addDays(new Date(), -2).toISOString(), author: 'nick', photos: [] },
      { id: id(), area_id: null, title: 'Claude’s summary: Monday brain dump', body: 'Work is busy this week. The physics exam is on your mind, and you want to start the scholarship essays early. Filed 4 tasks and 1 record.', mood: null, tags: [], occurred_at: addDays(new Date(), -1).toISOString(), author: 'claude', photos: [] }],
    notes: [{ id: id(), area_id: A('education'), title: 'Class schedule', body: 'Mon/Wed/Fri 9:00 SEM 100\nTue/Thu 1:00 MATH 101', pinned: true, tags: [], updated_at: new Date().toISOString() },
      { id: id(), area_id: A('health'), title: 'Gym routine', body: 'Push / pull / legs, 45 min', pinned: false, tags: [], updated_at: new Date().toISOString() }],
    goals: [
      { id: id(), area_id: A('education'), title: 'Finish the semester with a 3.7+', why: 'Keeps the fellowship options open', status: 'active', target_date: inDays(24), suggested: false, next_step: 'Make a study plan for finals week', progress: 40, sort: 0, horizon: 'semester', created_at: '' },
      { id: id(), area_id: A('mental'), title: 'Build a steady sleep routine', why: 'I think better on 7+ hours', status: 'active', target_date: null, suggested: true, next_step: null, progress: 0, sort: 1, horizon: 'month', created_at: '' },
    ],
    people: [{ id: id(), name: 'Sam', relation: 'Partner', birthday: null, contact_every_days: null, last_contact: today(), notes: null },
      { id: id(), name: 'Alex Rivera', relation: 'Family', birthday: '12-05', contact_every_days: 14, last_contact: inDays(-20), notes: null }],
    reviews: [{ id: id(), week_start: dayKey(addDays(weekStart(), -7)), wins: 'Caught up on classes', lessons: 'Start earlier', focus: ['Finals plan', 'Sleep by 12', 'Call home'], rating: 7, data: {} }],
    synced_at: new Date(Date.now() - 40 * 60e3).toISOString(),
  }
}
