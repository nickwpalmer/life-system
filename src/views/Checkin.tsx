import { useState } from 'preact/hooks'
import { saveCheckin, setDaily } from '../lib/db'
import { getState, toast, metricByKey } from '../lib/store'
import { checkinDay, fmtDay, today } from '../lib/dates'
import { dailySeries } from '../lib/metrics'
import type { Checkin, Task } from '../lib/types'
import { ScalePicker, ListInputs, burst, PageHead, Card } from '../ui/kit'
import { LogGroups } from './DailyLog'
import { openTask } from './Tasks'
import { useCompass } from './Compass'

const blank = (kind: 'morning' | 'night', day: string): Checkin => ({
  kind, day, mood: null, energy: null, stress: null, focus: null, sleep_quality: null,
  intention: null, top_three: [], gratitude: [], win: null, lesson: null, reflection: null, data: {},
})

export function CheckinView({ kind }: { kind: 'morning' | 'night' }) {
  const day = checkinDay(kind)
  const existing = getState().checkins.find((c) => c.kind === kind && c.day === day)
  const [c, setC] = useState<Checkin>(() => existing ? { ...blank(kind, day), ...existing } : blank(kind, day))
  const [busy, setBusy] = useState(false)
  const compass = useCompass()
  const sleepM = metricByKey('sleep_hours')
  const [sleep, setSleep] = useState<string>(() => { const v = sleepM ? dailySeries(sleepM, getState().logs, [day])[0] : null; return v == null ? '' : String(v) })
  const set = (p: Partial<Checkin>) => setC({ ...c, ...p })
  const setData = (k: string, v: unknown) => setC({ ...c, data: { ...c.data, [k]: v } })

  // Ideas for the top three: what's due today, then high-priority tasks.
  const ideas = getState().tasks.filter((t: Task) => openTask(t) && t.status !== 'inbox' && (t.due_date && t.due_date <= today() || t.priority >= 2))
    .sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9')).slice(0, 5)

  async function save(e: Event) {
    setBusy(true)
    const btn = e.currentTarget as HTMLElement
    try {
      const clean = { ...c, top_three: c.top_three.filter(Boolean), gratitude: c.gratitude.filter(Boolean) }
      await saveCheckin(clean)
      // Mood, energy and anxiety from a check-in also fill the daily log, so charts have one source.
      const put = (key: string, v: number | null) => { const m = metricByKey(key); if (m && v != null) setDaily(m, day, v) }
      if (kind === 'morning' && sleepM && sleep !== '') setDaily(sleepM, day, Number(sleep))
      if (kind === 'night') { put('mood', c.mood); put('energy', c.energy); put('anxiety', c.stress) }
      burst(btn, 22)
      toast(kind === 'morning' ? 'Have a good one.' : 'Rest well.')
      setTimeout(() => { location.hash = '#/today' }, 500)
    } catch { /* toast shown */ }
    setBusy(false)
  }

  const scale = (label: string, k: keyof Checkin, lo = 'Low', hi = 'High', tone: 'warm' | 'cool' | 'rev' = 'warm') => (
    <div class="ci-section"><span class="ci-label">{label}</span><ScalePicker value={c[k] as number | null} onChange={(v) => set({ [k]: v } as Partial<Checkin>)} low={lo} high={hi} tone={tone} /></div>
  )
  const text = (label: string, k: 'intention' | 'win' | 'lesson', ph: string) => (
    <div class="ci-section"><span class="ci-label">{label}</span><input class="input" placeholder={ph} value={c[k] ?? ''} onInput={(e) => set({ [k]: (e.target as HTMLInputElement).value || null })} /></div>
  )

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <PageHead title={kind === 'morning' ? 'Morning' : 'Night'} back="#/today" icon={kind === 'morning' ? 'sun' : 'moon'} color={kind === 'morning' ? 'var(--orange)' : 'var(--violet)'} sub={fmtDay(day)} />
      <div class="grid-2">
        <div>
          <Card>
            {kind === 'morning' ? (
              <>
                <div class="ci-section"><span class="ci-label">Hours slept</span>
                  <div class="presets">{[5, 6, 6.5, 7, 7.5, 8, 9].map((h) => <button type="button" class={String(h) === sleep ? 'on' : ''} style={String(h) === sleep ? 'background:var(--grad);color:#1d1330' : ''} onClick={() => setSleep(String(h))}>{h}</button>)}
                    <input class="input num-in" type="number" inputMode="decimal" step="0.25" placeholder="other" value={sleep} onInput={(e) => setSleep((e.target as HTMLInputElement).value)} /></div>
                </div>
                {scale('How did you sleep?', 'sleep_quality', 'Rough', 'Great', 'cool')}
                {scale('Mood right now', 'mood')}
                {scale('Energy', 'energy', 'Drained', 'Charged', 'cool')}
                {text('One intention for today', 'intention', 'Today I want to…')}
                {compass.mission && <p class="faint tiny" style="margin:-6px 0 12px">Pointing at: {compass.mission}</p>}
                <div class="ci-section"><span class="ci-label">Top three</span>
                  <ListInputs values={c.top_three} onChange={(v) => set({ top_three: v })} placeholder="Priority" />
                  {ideas.length > 0 && <div class="chips" style="margin-top:4px">{ideas.filter((t) => !c.top_three.includes(t.title)).slice(0, 4).map((t) => <button type="button" class="chip" style="height:30px;font-size:13px" onClick={() => { const v = [...c.top_three]; const i = [0, 1, 2].find((n) => !v[n]); if (i != null) { v[i] = t.title; set({ top_three: v }) } }}>+ {t.title.length > 34 ? t.title.slice(0, 32) + '…' : t.title}</button>)}</div>}
                </div>
                <div class="ci-section"><span class="ci-label">Grateful for</span><ListInputs values={c.gratitude} onChange={(v) => set({ gratitude: v })} placeholder="Thing" count={1} /></div>
              </>
            ) : (
              <>
                {scale('Overall mood today', 'mood')}
                {scale('Energy', 'energy', 'Drained', 'Charged', 'cool')}
                {scale('Anxiety or stress', 'stress', 'Calm', 'Maxed', 'rev')}
                {text('A win from today', 'win', 'Big or small')}
                {text('What did today teach you?', 'lesson', 'A lesson or something to change')}
                <div class="ci-section"><span class="ci-label">Grateful for</span><ListInputs values={c.gratitude} onChange={(v) => set({ gratitude: v })} placeholder="Thing" count={3} /></div>
                <div class="ci-section"><span class="ci-label">Anything on your mind?</span>
                  <textarea class="input" placeholder="Free space. Write as much or as little as you want." value={c.reflection ?? ''} onInput={(e) => set({ reflection: (e.target as HTMLTextAreaElement).value || null })} />
                </div>
                <div class="ci-section"><span class="ci-label">Most important thing tomorrow</span>
                  <input class="input" value={(c.data.tomorrow as string) ?? ''} onInput={(e) => setData('tomorrow', (e.target as HTMLInputElement).value || null)} />
                </div>
              </>
            )}
            <button class="btn primary block" type="button" disabled={busy} onClick={save}>{existing ? 'Update check-in' : 'Save check-in'}</button>
          </Card>
        </div>
        {kind === 'night' && (
          <div>
            <Card title="Log the day" icon="sliders" accent="var(--pink)">
              <p class="muted small" style="margin-bottom:6px">Saves as you tap. Mood, energy and anxiety come from the left.</p>
              <LogGroups day={day} only={['habits', 'vices', 'body', 'money', 'other']} compact />
            </Card>
          </div>
        )}
      </div>
    </form>
  )
}
