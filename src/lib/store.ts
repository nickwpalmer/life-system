import { useEffect, useState } from 'preact/hooks'
import type { Session } from '@supabase/supabase-js'
import type { Area, Metric, Task, Log, Checkin, JournalEntry, Note, Goal, Person, Review, CalEvent, Profile } from './types'

/**
 * One in-memory store. Everything the app shows is loaded once (one request) and
 * kept here, so screens render instantly; writes update it first, then the server.
 */
export type Data = {
  profile: Profile | null
  areas: Area[]; metrics: Metric[]; tasks: Task[]; logs: Log[]; checkins: Checkin[]
  journal: JournalEntry[]; notes: Note[]; goals: Goal[]; people: Person[]; reviews: Review[]; events: CalEvent[]
  synced_at: string | null
}
type State = Data & {
  session: Session | null
  ready: boolean
  loaded: boolean
  locked: boolean
  demo: boolean
  toast: { id: number; text: string; undo?: () => void } | null
  /** Capture sheet: false, true, or the mode to open it in. */
  capture: boolean | 'task' | 'journal' | 'note' | 'mood'
  substance: boolean
}

export const emptyData = (): Data => ({
  profile: null, areas: [], metrics: [], tasks: [], logs: [], checkins: [], journal: [], notes: [],
  goals: [], people: [], reviews: [], events: [], synced_at: null,
})

let state: State = { ...emptyData(), session: null, ready: false, loaded: false, locked: false, demo: false, toast: null, capture: false, substance: false }
const subs = new Set<() => void>()
let queued = false

export const getState = () => state
export function setState(patch: Partial<State>) {
  state = { ...state, ...patch }
  // Batch bursts of updates into one render.
  if (!queued) { queued = true; queueMicrotask(() => { queued = false; subs.forEach((f) => f()) }) }
}

export function useStore<T>(pick: (s: State) => T): T {
  const [, force] = useState(0)
  useEffect(() => {
    const f = () => force((n) => n + 1)
    subs.add(f)
    return () => { subs.delete(f) }
  }, [])
  return pick(state)
}

let toastTimer: number | undefined
export function toast(text: string, undo?: () => void) {
  window.clearTimeout(toastTimer)
  setState({ toast: { id: Date.now(), text, undo } })
  toastTimer = window.setTimeout(() => setState({ toast: null }), undo ? 5000 : 2600)
}

export const areaById = (id: string | null | undefined) => state.areas.find((a) => a.id === id)
export const areaByKey = (k: string) => state.areas.find((a) => a.key === k)
export const metricById = (id: string) => state.metrics.find((m) => m.id === id)
export const metricByKey = (k: string) => state.metrics.find((m) => m.key === k)
