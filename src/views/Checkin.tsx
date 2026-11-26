import { useEffect, useState } from 'preact/hooks'
import { saveCheckin, setDaily, insert, update, remove, restore, setTaskDone } from '../lib/db'
import { getState, setState, toast, metricByKey, useStore } from '../lib/store'
import { checkinDay, today, dayKey, lastNDays, inDays, fmtDay } from '../lib/dates'
import { dailySeries } from '../lib/metrics'
import { useRows } from '../lib/rows'
import { syncRing } from '../lib/sync'
import type { Checkin, Task, Log } from '../lib/types'
import { ScalePicker, ListInputs, burst, Spinner } from '../ui/kit'
import { Flow, type Step } from '../ui/flow'
import { LogGroups } from './DailyLog'
import { openTask } from './Tasks'
import { useCompass } from './Compass'

const blank = (kind: 'morning' | 'night', day: string): Checkin => ({
  kind, day, mood: null, energy: null, stress: null, focus: null, sleep_quality: null,
  intention: null, top_three: [], gratitude: [], win: null, lesson: null, reflection: null, data: {},
})

type RingV = Partial<Record<'sleep_hours' | 'sleep_score' | 'deep_h' | 'rem_h' | 'light_h' | 'sleep_efficiency' | 'recovery_index' | 'hrv' | 'resting_hr', number>>
type RingDay = { id: string; day: string; vals: RingV }
const hm = (h: number) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` }

/** The ring's (or your corrected) sleep log for a day, if there is one. */
const sleepLog = (day: string): Log | undefined => {
  const m = metricByKey('sleep_hours')
  return m ? getState().logs.find((l) => l.metric_id === m.id && (l.source === 'ring' || l.source === 'fixed') && dayKey(new Date(l.occurred_at)) === day) : undefined
}

/**
 * Last night's sleep from the ring: hours, stages and how it compares with your usual. If the ring hasn't
 * uploaded yet it asks for it on the spot. You can fix the hours, or type them in if there's no ring data.
 */
function SleepStep({ day, manual, setManual, next }: { day: string; manual: string; setManual: (v: string) => void; next: () => void }) {
  const rows = useRows<RingDay>('ring_days')
  const [phase, setPhase] = useState<'idle' | 'checking' | 'waiting'>('idle')
  const [fixing, setFixing] = useState(false)
  const r = rows?.find((x) => x.day === day && x.vals?.sleep_hours != null)
  const fixed = sleepLog(day)
  useEffect(() => {
    if (rows === null || r || phase !== 'idle') return
    setPhase('checking')
    syncRing().finally(() => setPhase('waiting'))
  }, [rows === null, !!r])
  const month = new Set(lastNDays(30))
  const past = (rows ?? []).filter((x) => x.day !== day && month.has(x.day) && x.vals?.sleep_hours != null)
  const avg = (k: keyof RingV) => { const v = past.map((x) => x.vals[k]).filter((n): n is number => n != null); return v.length >= 3 ? v.reduce((a, b) => a + b, 0) / v.length : null }

  if (rows === null || phase === 'checking') return <div class="sleep-card wait"><Spinner /><p class="muted">Checking your ring for last night…</p></div>
  if (!r || fixing) {
    const start = fixing ? String(Math.round(Number(fixed?.value_num ?? r?.vals.sleep_hours ?? 0) * 4) / 4) : manual
    return (
      <div>
        {!r && <p class="muted" style="margin:0 0 14px">Waiting on your sleep data. Open the Ultrahuman app so the ring uploads, or put in your hours.</p>}
        <div class="presets big">{[5, 6, 6.5, 7, 7.5, 8, 9].map((h) => <button type="button" class={String(h) === (fixing ? manual || start : manual) ? 'on' : ''} onClick={() => setManual(String(h))}>{h}</button>)}
          <input class="input num-in" type="number" inputMode="decimal" step="0.25" placeholder="other" value={manual || (fixing ? start : '')} onInput={(e) => setManual((e.target as HTMLInputElement).value)} /></div>
        <div class="row" style="gap:8px;margin-top:14px">
          {!r && <button class="btn ghost sm" onClick={() => { setPhase('checking'); syncRing().finally(() => setPhase('waiting')) }}>Check the ring again</button>}
          {fixing && <button class="btn ghost sm" onClick={() => { setManual(''); setFixing(false) }}>Cancel</button>}
          <button class="btn primary sm grow" disabled={!manual} onClick={next}>{fixing ? 'Use this' : 'Next'}</button>
        </div>
      </div>
    )
  }
  const v = r.vals
  const hours = fixed?.source === 'fixed' && fixed.value_num != null ? Number(fixed.value_num) : v.sleep_hours!
  const usual = avg('sleep_hours'), usualHrv = avg('hrv')
  const diff = usual != null ? Math.round((hours - usual) * 60) : null
  const notes = [
    diff != null && Math.abs(diff) >= 10 ? `${Math.abs(diff)} min ${diff > 0 ? 'more' : 'less'} than your usual ${hm(usual!)}` : usual != null ? 'About your usual amount' : null,
    v.deep_h != null && hours ? `${Math.round((v.deep_h / hours) * 100)}% deep sleep${v.deep_h / hours >= 0.15 ? ', a solid share' : ', on the low side'}` : null,
    v.hrv != null && usualHrv ? `HRV ${Math.round(v.hrv)}, ${v.hrv >= usualHrv ? 'above' : 'below'} your ${Math.round(usualHrv)} average` : null,
  ].filter(Boolean) as string[]
  const stage = (label: string, h: number | undefined, c: string) => h != null && <span class="stage" style={`--c:${c};flex:${h}`}><b>{hm(h)}</b><span>{label}</span></span>
  return (
    <div class="sleep-card">
      <div class="sleep-big">You slept <b>{hm(hours)}</b>{fixed?.source === 'fixed' && <span class="faint tiny"> (your fix)</span>}</div>
      <div class="stages">{stage('Deep', v.deep_h, 'var(--violet)')}{stage('REM', v.rem_h, 'var(--pink)')}{stage('Light', v.light_h, 'var(--sky)')}</div>
      <div class="sleep-stats">
        {v.sleep_score != null && <span><b>{Math.round(v.sleep_score)}</b><span>Sleep score</span></span>}
        {v.recovery_index != null && <span><b>{Math.round(v.recovery_index)}</b><span>Recovery</span></span>}
        {v.sleep_efficiency != null && <span><b>{Math.round(v.sleep_efficiency)}%</b><span>Efficiency</span></span>}
      </div>
      {notes.length > 0 && <ul class="sleep-notes">{notes.map((n) => <li>{n}</li>)}</ul>}
      <div class="row" style="gap:8px;margin-top:14px">
        <button class="btn ghost sm" onClick={() => { setManual(''); setFixing(true) }}>Fix the hours</button>
        <button class="btn primary sm grow" onClick={next}>Looks right</button>
      </div>
    </div>
  )
}

/** The check-in as a journal entry, written from the answers (no AI). */
function journalText(c: Checkin, sleepH: number | null) {
  const nums = (pairs: [string, number | null][]) => pairs.filter(([, v]) => v != null).map(([l, v]) => `${l} ${v}`).join(' · ')
  const lines: string[] = []
  if (c.kind === 'morning') {
    const s = [sleepH != null ? `Slept ${hm(sleepH)}` : '', nums([['Sleep quality', c.sleep_quality]])].filter(Boolean).join(', ')
    if (s) lines.push(s + '.')
    const n = nums([['Mood', c.mood], ['Energy', c.energy], ['Stress', c.stress]]); if (n) lines.push(n)
    if (c.intention) lines.push('', `Intention: ${c.intention}`)
    const top = c.top_three.filter(Boolean); if (top.length) lines.push('', 'Top three:', ...top.map((t) => `• ${t}`))
  } else {
    const n = nums([['Mood', c.mood], ['Energy', c.energy], ['Focus', c.focus], ['Stress', c.stress]]); if (n) lines.push(n)
    if (c.win) lines.push('', `Win: ${c.win}`)
    if (c.lesson) lines.push(`Lesson: ${c.lesson}`)
  }
  const g = c.gratitude.filter(Boolean); if (g.length) lines.push('', `Grateful for: ${g.join(', ')}`)
  if (c.kind === 'night' && c.reflection) lines.push('', c.reflection)
  if (c.kind === 'night' && c.data.tomorrow) lines.push('', `Tomorrow: ${c.data.tomorrow}`)
  return lines.join('\n').trim()
}

/** Tasks whose date has passed. */
const passedDate = (t: Task) => { const d = [t.due_date, t.scheduled_for].filter((x): x is string => !!x && x < today()).sort()[0]; return d ?? null }
export const passedTasks = (tasks: Task[]) => tasks.filter((t) => openTask(t) && t.status !== 'inbox' && !t.recurrence && passedDate(t)).sort((a, b) => passedDate(a)!.localeCompare(passedDate(b)!))
/** Prep for something that already happened, like "Review for Quiz 9": dropping it is the likely answer. */
const isStalePrep = (t: Task) => /^(review|study|prep|practice)\b.*\b(quiz|test|exam|midterm|final)\b/i.test(t.title)

/** One decision per passed task: done, a new date, or drop. Drop only marks it dropped (it stays in Done). */
function PassedStep({ ids }: { ids: string[] }) {
  const tasks = useStore((s) => s.tasks)
  const [moving, setMoving] = useState<string | null>(null)
  const [handled, setHandled] = useState<Record<string, string>>({})
  const rows = ids.map((id) => tasks.find((t) => t.id === id)).filter((t): t is Task => !!t)
  const mark = (t: Task, what: string) => setHandled((h) => ({ ...h, [t.id]: what }))
  async function done(t: Task) { mark(t, 'Done'); await setTaskDone(t.id, true).catch(() => {}) }
  async function drop(t: Task) {
    mark(t, 'Dropped')
    await update('tasks', t.id, { status: 'dropped' }).catch(() => {})
    toast('Dropped', () => { update('tasks', t.id, { status: t.status }).catch(() => {}); setHandled((h) => { const n = { ...h }; delete n[t.id]; return n }) })
  }
  async function move(t: Task, day: string) {
    if (!day) return
    setMoving(null); mark(t, fmtDay(day))
    const patch: Partial<Task> = {}
    if (t.due_date && t.due_date < today()) patch.due_date = day
    if (t.scheduled_for && t.scheduled_for < today()) patch.scheduled_for = day
    await update('tasks', t.id, patch).catch(() => {})
  }
  return (
    <div class="passed">
      {rows.map((t) => {
        const h = handled[t.id] ?? (openTask(t) ? null : t.status === 'done' ? 'Done' : 'Dropped')
        const btns = [<button class="chip" onClick={() => done(t)}>Done</button>, <button class="chip" onClick={() => setMoving(moving === t.id ? null : t.id)}>New date</button>, <button class="chip" onClick={() => drop(t)}>Drop</button>]
        return (
          <div class={`passed-row ${h ? 'handled' : ''}`}>
            <div class="row between" style="gap:10px;align-items:flex-start">
              <div style="min-width:0"><div class="passed-t">{t.title}</div><div class="faint tiny">Was {fmtDay(passedDate(t) ?? today())}</div></div>
              {h && <span class="pill" style="--c:var(--mint)">{h}</span>}
            </div>
            {!h && <div class="chips" style="margin-top:8px">{isStalePrep(t) ? [btns[2], btns[0], btns[1]] : btns}</div>}
            {!h && moving === t.id && <div class="chips" style="margin-top:8px">
              <button class="chip" onClick={() => move(t, inDays(1))}>Tomorrow</button>
              <button class="chip" onClick={() => move(t, inDays(7))}>Next week</button>
              <input class="input" type="date" style="width:auto;height:34px;padding:4px 10px" min={inDays(1)} onChange={(e) => move(t, (e.target as HTMLInputElement).value)} />
            </div>}
          </div>
        )
      })}
    </div>
  )
}

/** Morning and night check-ins: one question at a time, leave whenever you want (what you answered is kept). */
export function CheckinView({ kind }: { kind: 'morning' | 'night' }) {
  const day = checkinDay(kind)
  const existing = getState().checkins.find((c) => c.kind === kind && c.day === day)
  const [c, setC] = useState<Checkin>(() => existing ? { ...blank(kind, day), ...existing } : blank(kind, day))
  const [dirty, setDirty] = useState(false)
  const compass = useCompass()
  const sleepM = metricByKey('sleep_hours')
  const [sleep, setSleep] = useState<string>('')
  const set = (p: Partial<Checkin>) => { setC((cur) => ({ ...cur, ...p })); setDirty(true) }
  const setData = (k: string, v: unknown) => set({ data: { ...c.data, [k]: v } })

  // Ideas for the top three: what's due today, then high-priority tasks.
  const ideas = getState().tasks.filter((t: Task) => openTask(t) && t.status !== 'inbox' && (t.due_date && t.due_date <= today() || t.priority >= 2))
    .sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9')).slice(0, 5)

  async function persist(withJournal = false) {
    const clean = { ...c, top_three: c.top_three.filter(Boolean), gratitude: c.gratitude.filter(Boolean) }
    // Sleep: fix the ring's log for the night (the ring sync leaves a fixed one alone), or log it by hand.
    if (kind === 'morning' && sleepM && sleep !== '' && !isNaN(Number(sleep))) {
      const ring = sleepLog(day)
      if (ring) await update('logs', ring.id, { value_num: Number(sleep), source: 'fixed' })
      else setDaily(sleepM, day, Number(sleep))
    }
    if (withJournal) {
      const sleepH = sleepM ? dailySeries(sleepM, getState().logs, [day])[0] ?? null : null
      const body = journalText(clean, sleepH)
      const jid = clean.data.journal_id as string | undefined
      const mine = jid && getState().journal.find((j) => j.id === jid)
      if (body) {
        if (mine) await update('journal_entries', jid!, { body })
        else { const j = await insert('journal_entries', { body, title: kind === 'morning' ? 'Morning check-in' : 'Night check-in', mood: clean.mood, area_id: null, tags: ['check-in'], photos: [], author: 'nick', occurred_at: new Date().toISOString() }); clean.data = { ...clean.data, journal_id: j.id } }
      }
    }
    await saveCheckin(clean)
    // Mood, energy and stress from a check-in also fill the daily log, so charts have one source.
    const put = (key: string, v: number | null) => { const m = metricByKey(key); if (m && v != null) setDaily(m, day, v) }
    if (kind === 'night') { put('mood', c.mood); put('energy', c.energy); put('focus', c.focus); put('anxiety', c.stress) }
  }
  /** Undo a check-in: removes it and the journal entry it wrote. The numbers it logged stay in the daily log. */
  async function clear() {
    const row = getState().checkins.find((x) => x.kind === kind && x.day === day)
    if (!row?.id || !confirm(`Clear ${kind === 'morning' ? 'this morning’s' : 'tonight’s'} check-in?`)) return
    const j = getState().journal.find((x) => x.id === row.data?.journal_id)
    await remove('checkins', row.id).catch(() => {})
    if (j) await remove('journal_entries', j.id).catch(() => {})
    setState({})
    toast('Check-in cleared', () => { restore('checkins', row as never); if (j) restore('journal_entries', j as never) })
    location.hash = '#/today'
  }
  async function finish(btn: Element | null) {
    try {
      await persist(true)
      burst(btn, 26)
      toast(kind === 'morning' ? 'Have a good one.' : 'Rest well.')
      setTimeout(() => { location.hash = '#/today' }, 600)
    } catch { /* toast shown */ }
  }
  async function exit() {
    if (dirty) { try { await persist(); toast('Saved what you answered') } catch { /* shown */ } }
    location.hash = '#/today'
  }

  const scale = (key: keyof Checkin, q: string, lo = 'Low', hi = 'High', tone: 'warm' | 'cool' | 'rev' = 'warm'): Step => ({
    key: String(key), q, auto: true,
    body: (next) => <ScalePicker value={c[key] as number | null} onChange={(v) => { set({ [key]: v } as Partial<Checkin>); next() }} low={lo} high={hi} tone={tone} />,
  })
  const text = (key: 'intention' | 'win' | 'lesson', q: string, ph: string, hint?: string): Step => ({
    key, q, hint,
    body: (next) => <input class="input big" autoFocus placeholder={ph} value={c[key] ?? ''} onInput={(e) => set({ [key]: (e.target as HTMLInputElement).value || null })} onKeyDown={(e) => { if (e.key === 'Enter') next() }} />,
  })

  const morning: Step[] = [
    { key: 'sleep', q: 'Last night', auto: true,
      body: (next) => <SleepStep day={day} manual={sleep} setManual={(v) => { setSleep(v); setDirty(true) }} next={next} /> },
    scale('sleep_quality', 'How did you sleep?', 'Rough', 'Great', 'cool'),
    scale('mood', 'How are you feeling?'),
    scale('energy', 'Energy?', 'Drained', 'Charged', 'cool'),
    scale('stress', 'Stress or anxiety?', 'Calm', 'Maxed', 'rev'),
    text('intention', 'One intention for today', 'Today I want to…', compass.mission ? `Pointing at: ${compass.mission}` : undefined),
    { key: 'top', q: 'Your top three', hint: 'What would make today a win?',
      body: () => <>
        <ListInputs values={c.top_three} onChange={(v) => set({ top_three: v })} placeholder="Priority" />
        {ideas.length > 0 && <div class="chips" style="margin-top:6px">{ideas.filter((t) => !c.top_three.includes(t.title)).slice(0, 4).map((t) => <button type="button" class="chip" style="height:30px;font-size:13px;max-width:100%" onClick={() => { const v = [...c.top_three]; const i = [0, 1, 2].find((n) => !v[n]); if (i != null) { v[i] = t.title; set({ top_three: v }) } }}><span class="ellipsis">+ {t.title}</span></button>)}</div>}
      </> },
    { key: 'grateful', q: 'One thing you’re grateful for', body: () => <ListInputs values={c.gratitude} onChange={(v) => set({ gratitude: v })} placeholder="Thing" count={1} /> },
  ]
  const [passedIds] = useState(() => passedTasks(getState().tasks).map((t) => t.id))
  const night: Step[] = [
    scale('mood', 'How was today, overall?'),
    scale('energy', 'Energy by the end?', 'Drained', 'Charged', 'cool'),
    scale('focus', 'How focused were you?', 'Scattered', 'Locked in', 'cool'),
    scale('stress', 'Stress or anxiety today?', 'Calm', 'Maxed', 'rev'),
    text('win', 'A win from today', 'Big or small'),
    text('lesson', 'What did today teach you?', 'A lesson or something to change'),
    { key: 'habits', q: 'Habits today', hint: 'Saves as you tap.', body: () => <LogGroups day={day} only={['habits']} compact /> },
    { key: 'grateful', q: 'Grateful for', body: () => <ListInputs values={c.gratitude} onChange={(v) => set({ gratitude: v })} placeholder="Thing" count={3} /> },
    { key: 'mind', q: 'Anything on your mind?', hint: 'Optional. Write as much or as little as you want.',
      body: () => <textarea class="input" style="min-height:120px" value={c.reflection ?? ''} onInput={(e) => set({ reflection: (e.target as HTMLTextAreaElement).value || null })} /> },
    ...(passedIds.length ? [{ key: 'passed', q: passedIds.length === 1 ? 'This one’s date passed' : `These ${passedIds.length} passed`, hint: 'Done, a new date, or drop? One tap each, or skip.', body: () => <PassedStep ids={passedIds} /> }] : []),
    { key: 'tomorrow', q: 'Most important thing tomorrow', body: (next) => <input class="input big" value={(c.data.tomorrow as string) ?? ''} onInput={(e) => setData('tomorrow', (e.target as HTMLInputElement).value || null)} onKeyDown={(e) => { if (e.key === 'Enter') next() }} /> },
  ]

  return <Flow title={kind === 'morning' ? 'Morning check-in' : 'Night check-in'} color={kind === 'morning' ? 'var(--orange)' : 'var(--violet)'}
    steps={kind === 'morning' ? morning : night} onExit={exit} onFinish={finish} finishLabel={existing ? 'Update check-in' : 'Finish'}
    aside={existing ? <button class="btn ghost sm" onClick={clear}>Clear</button> : undefined} />
}
