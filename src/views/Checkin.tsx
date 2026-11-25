import { useState } from 'preact/hooks'
import { saveCheckin, setDaily } from '../lib/db'
import { getState, toast, metricByKey } from '../lib/store'
import { checkinDay, today } from '../lib/dates'
import { dailySeries } from '../lib/metrics'
import type { Checkin, Task } from '../lib/types'
import { ScalePicker, ListInputs, burst } from '../ui/kit'
import { Flow, type Step } from '../ui/flow'
import { LogGroups } from './DailyLog'
import { openTask } from './Tasks'
import { useCompass } from './Compass'

const blank = (kind: 'morning' | 'night', day: string): Checkin => ({
  kind, day, mood: null, energy: null, stress: null, focus: null, sleep_quality: null,
  intention: null, top_three: [], gratitude: [], win: null, lesson: null, reflection: null, data: {},
})

/** Morning and night check-ins: one question at a time, leave whenever you want (what you answered is kept). */
export function CheckinView({ kind }: { kind: 'morning' | 'night' }) {
  const day = checkinDay(kind)
  const existing = getState().checkins.find((c) => c.kind === kind && c.day === day)
  const [c, setC] = useState<Checkin>(() => existing ? { ...blank(kind, day), ...existing } : blank(kind, day))
  const [dirty, setDirty] = useState(false)
  const compass = useCompass()
  const sleepM = metricByKey('sleep_hours')
  const fromHealth = sleepM ? dailySeries(sleepM, getState().logs, [day])[0] : null
  const [sleep, setSleep] = useState<string>(() => fromHealth == null ? '' : String(fromHealth))
  const set = (p: Partial<Checkin>) => { setC((cur) => ({ ...cur, ...p })); setDirty(true) }
  const setData = (k: string, v: unknown) => set({ data: { ...c.data, [k]: v } })

  // Ideas for the top three: what's due today, then high-priority tasks.
  const ideas = getState().tasks.filter((t: Task) => openTask(t) && t.status !== 'inbox' && (t.due_date && t.due_date <= today() || t.priority >= 2))
    .sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9')).slice(0, 5)

  async function persist() {
    const clean = { ...c, top_three: c.top_three.filter(Boolean), gratitude: c.gratitude.filter(Boolean) }
    await saveCheckin(clean)
    // Mood, energy and stress from a check-in also fill the daily log, so charts have one source.
    const put = (key: string, v: number | null) => { const m = metricByKey(key); if (m && v != null) setDaily(m, day, v) }
    if (kind === 'morning' && sleepM && sleep !== '') setDaily(sleepM, day, Number(sleep))
    if (kind === 'night') { put('mood', c.mood); put('energy', c.energy); put('focus', c.focus); put('anxiety', c.stress) }
  }
  async function finish(btn: Element | null) {
    try {
      await persist()
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
    { key: 'sleep', q: 'How long did you sleep?', hint: fromHealth != null ? 'Filled in from Apple Health. Change it if it’s off.' : undefined, auto: true,
      body: (next) => (
        <div class="presets big">{[5, 6, 6.5, 7, 7.5, 8, 9].map((h) => <button type="button" class={String(h) === sleep ? 'on' : ''} onClick={() => { setSleep(String(h)); setDirty(true); next() }}>{h}</button>)}
          <input class="input num-in" type="number" inputMode="decimal" step="0.25" placeholder="other" value={sleep} onInput={(e) => { setSleep((e.target as HTMLInputElement).value); setDirty(true) }} /></div>
      ) },
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
    { key: 'tomorrow', q: 'Most important thing tomorrow', body: (next) => <input class="input big" value={(c.data.tomorrow as string) ?? ''} onInput={(e) => setData('tomorrow', (e.target as HTMLInputElement).value || null)} onKeyDown={(e) => { if (e.key === 'Enter') next() }} /> },
  ]

  return <Flow title={kind === 'morning' ? 'Morning check-in' : 'Night check-in'} color={kind === 'morning' ? 'var(--orange)' : 'var(--violet)'}
    steps={kind === 'morning' ? morning : night} onExit={exit} onFinish={finish} finishLabel={existing ? 'Update check-in' : 'Finish'} />
}
