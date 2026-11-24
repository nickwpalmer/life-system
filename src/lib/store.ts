import { useEffect, useState } from 'preact/hooks'
import type { Session } from '@supabase/supabase-js'
import type { Area, Metric } from './types'

/** Tiny global store: one object, subscribers re-render on change. */
type State = {
  session: Session | null
  ready: boolean
  locked: boolean
  areas: Area[]
  metrics: Metric[]
  toast: { id: number; text: string; undo?: () => void } | null
  dataVersion: number // bump to make views refetch
}

let state: State = {
  session: null, ready: false, locked: false, areas: [], metrics: [], toast: null, dataVersion: 0,
}
const subs = new Set<() => void>()

export const getState = () => state
export function setState(patch: Partial<State>) {
  state = { ...state, ...patch }
  subs.forEach((f) => f())
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

export const bump = () => setState({ dataVersion: state.dataVersion + 1 })

export const areaById = (id: string | null | undefined) => state.areas.find((a) => a.id === id)
export const metricById = (id: string) => state.metrics.find((m) => m.id === id)
