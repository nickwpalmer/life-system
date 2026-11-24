import { useEffect, useState } from 'preact/hooks'
import { getCheckin, saveCheckin, addLog } from '../lib/db'
import { getState, toast } from '../lib/store'
import { checkinDay, fmtDay } from '../lib/dates'
import type { Checkin } from '../lib/types'
import { ScalePicker, ListInputs, Spinner, burst, BackHeader } from '../ui/kit'

const blank = (kind: 'morning' | 'night', day: string): Checkin => ({
  kind, day, mood: null, energy: null, stress: null, focus: null, sleep_quality: null,
  intention: null, top_three: [], gratitude: [], win: null, lesson: null, reflection: null, data: {},
})

export function CheckinView({ kind }: { kind: 'morning' | 'night' }) {
  const day = checkinDay(kind)
  const [c, setC] = useState<Checkin | null>(null)
  const [existing, setExisting] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getCheckin(kind, day).then((r) => { setExisting(!!r); setC(r ?? blank(kind, day)) }).catch(() => setC(blank(kind, day)))
  }, [kind])

  if (!c) return <Spinner />
  const set = (p: Partial<Checkin>) => setC({ ...c, ...p })
  const setData = (k: string, v: unknown) => setC({ ...c, data: { ...c.data, [k]: v } })

  async function save(e: Event) {
    setBusy(true)
    const btn = e.currentTarget as HTMLElement
    try {
      const clean = { ...c!, top_three: c!.top_three.filter(Boolean), gratitude: c!.gratitude.filter(Boolean) }
      await saveCheckin(clean)
      // Morning sleep hours also feed the Sleep metric so charts have one source.
      const hrs = Number(c!.data.sleep_hours)
      const sleep = getState().metrics.find((m) => m.key === 'sleep_hours')
      if (kind === 'morning' && !existing && hrs > 0 && sleep) await addLog(sleep.id, hrs, null, 'from morning check-in')
      burst(btn, 22)
      toast(kind === 'morning' ? 'Have a good one.' : 'Rest well.')
      setTimeout(() => { location.hash = '#/today' }, 500)
    } catch (err) { toast((err as Error).message) }
    setBusy(false)
  }

  const num = (k: string) => (c.data[k] as number | undefined) ?? ''

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <BackHeader title={kind === 'morning' ? 'Morning' : 'Night'} href="#/today" action={<span class="faint small">{fmtDay(day)}</span>} />
      <div class="card">
        {kind === 'morning' ? (
          <>
            <div class="ci-section"><span class="ci-label">How did you sleep?</span>
              <ScalePicker value={c.sleep_quality} onChange={(v) => set({ sleep_quality: v })} low="Rough" high="Great" />
            </div>
            <div class="ci-section"><span class="ci-label">Hours slept</span>
              <input class="input" type="number" inputMode="decimal" step="0.25" placeholder="e.g. 7.5" value={num('sleep_hours')} onInput={(e) => setData('sleep_hours', (e.target as HTMLInputElement).value ? Number((e.target as HTMLInputElement).value) : null)} />
            </div>
            <div class="ci-section"><span class="ci-label">Mood right now</span><ScalePicker value={c.mood} onChange={(v) => set({ mood: v })} /></div>
            <div class="ci-section"><span class="ci-label">Energy</span><ScalePicker value={c.energy} onChange={(v) => set({ energy: v })} low="Drained" high="Charged" /></div>
            <div class="ci-section"><span class="ci-label">Stress</span><ScalePicker value={c.stress} onChange={(v) => set({ stress: v })} low="Calm" high="Maxed" /></div>
            <div class="ci-section"><span class="ci-label">One intention for today</span>
              <input class="input" placeholder="Today I want to…" value={c.intention ?? ''} onInput={(e) => set({ intention: (e.target as HTMLInputElement).value || null })} />
            </div>
            <div class="ci-section"><span class="ci-label">Top three</span>
              <ListInputs values={c.top_three} onChange={(v) => set({ top_three: v })} placeholder="Priority" />
            </div>
            <div class="ci-section"><span class="ci-label">Grateful for</span>
              <ListInputs values={c.gratitude} onChange={(v) => set({ gratitude: v })} placeholder="Thing" count={1} />
            </div>
          </>
        ) : (
          <>
            <div class="ci-section"><span class="ci-label">Overall mood today</span><ScalePicker value={c.mood} onChange={(v) => set({ mood: v })} /></div>
            <div class="ci-section"><span class="ci-label">Energy</span><ScalePicker value={c.energy} onChange={(v) => set({ energy: v })} low="Drained" high="Charged" /></div>
            <div class="ci-section"><span class="ci-label">Stress</span><ScalePicker value={c.stress} onChange={(v) => set({ stress: v })} low="Calm" high="Maxed" /></div>
            <div class="ci-section"><span class="ci-label">Focus</span><ScalePicker value={c.focus} onChange={(v) => set({ focus: v })} low="Scattered" high="Locked in" /></div>
            <div class="ci-section"><span class="ci-label">A win from today</span>
              <input class="input" placeholder="Big or small" value={c.win ?? ''} onInput={(e) => set({ win: (e.target as HTMLInputElement).value || null })} />
            </div>
            <div class="ci-section"><span class="ci-label">What did today teach you?</span>
              <input class="input" placeholder="A lesson or something to change" value={c.lesson ?? ''} onInput={(e) => set({ lesson: (e.target as HTMLInputElement).value || null })} />
            </div>
            <div class="ci-section"><span class="ci-label">Grateful for</span>
              <ListInputs values={c.gratitude} onChange={(v) => set({ gratitude: v })} placeholder="Thing" count={3} />
            </div>
            <div class="ci-section"><span class="ci-label">Anything on your mind?</span>
              <textarea class="input" placeholder="Free space. Write as much or as little as you want." value={c.reflection ?? ''} onInput={(e) => set({ reflection: (e.target as HTMLTextAreaElement).value || null })} />
            </div>
            <div class="ci-section"><span class="ci-label">Most important thing tomorrow</span>
              <input class="input" value={(c.data.tomorrow as string) ?? ''} onInput={(e) => setData('tomorrow', (e.target as HTMLInputElement).value || null)} />
            </div>
          </>
        )}
        <button class="btn primary block" type="button" disabled={busy} onClick={save}>{existing ? 'Update check-in' : 'Save check-in'}</button>
      </div>
    </form>
  )
}
