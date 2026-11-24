/**
 * Data layer. Reads: one RPC (app_bootstrap) loads everything into the store.
 * Writes: optimistic. The store changes first (instant UI), then the server; on error we roll back.
 * Tables (Supabase "life-system"): profiles, areas, goals, tasks, checkins, journal_entries, metrics,
 * logs, notes, people, reviews, calendar_events. RLS: owner_id = auth.uid() everywhere.
 */
import { supabase } from './supabase'
import { getState, setState, toast, emptyData, type Data } from './store'
import type { Checkin, Log, Metric, Task } from './types'
import { addDays, dayKey, fromKey } from './dates'
import { aggMode } from './metrics'

export type Table = 'tasks' | 'logs' | 'checkins' | 'journal_entries' | 'notes' | 'goals' | 'people' | 'reviews' | 'areas' | 'metrics'
const COLL: Record<Table, keyof Data> = {
  tasks: 'tasks', logs: 'logs', checkins: 'checkins', journal_entries: 'journal', notes: 'notes',
  goals: 'goals', people: 'people', reviews: 'reviews', areas: 'areas', metrics: 'metrics',
}
const isDemo = () => getState().demo
const uid = () => getState().session?.user.id
let inflight = 0
let lastLoad = 0

type Row = { id: string } & Record<string, unknown>
const list = (t: Table) => getState()[COLL[t]] as unknown as Row[]
const put = (t: Table, rows: Row[]) => setState({ [COLL[t]]: rows } as Partial<Data>)

async function send<T>(p: PromiseLike<{ error: { message: string } | null; data?: T }>) {
  inflight++
  try { const r = await p; if (r.error) throw new Error(r.error.message); return r.data as T }
  finally { inflight-- }
}

// ---------- reads ----------
export async function bootstrap(force = false) {
  if (isDemo()) return
  if (!force && (inflight > 0 || Date.now() - lastLoad < 30_000)) return
  lastLoad = Date.now()
  const since = addDays(new Date(), -120).toISOString()
  const { data, error } = await supabase.rpc('app_bootstrap', { since })
  if (error) { lastLoad = 0; throw new Error(error.message) }
  if (inflight > 0) return // a write is mid-flight; next refresh will catch up
  setState({ ...emptyData(), ...(data as Partial<Data>), loaded: true })
}

export function clearData() { setState({ ...emptyData(), loaded: false }) }

/** Refresh when the app comes back to the foreground, so Claude's writes show up. */
export function installRefresh() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && getState().session) { bootstrap().catch(() => {}); import('./rows').then((m) => m.reloadAll()) }
  })
  setInterval(() => { if (document.visibilityState === 'visible' && getState().session) bootstrap().catch(() => {}) }, 5 * 60_000)
}

// ---------- generic optimistic writes ----------
const now = () => new Date().toISOString()
export const newId = () => crypto.randomUUID()

export async function insert<T extends Record<string, unknown>>(t: Table, row: T): Promise<T & { id: string }> {
  const full = { id: newId(), created_at: now(), updated_at: now(), ...row } as T & { id: string }
  put(t, [...list(t), full as unknown as Row])
  if (isDemo()) return full
  try {
    const { created_at: _c, updated_at: _u, ...payload } = full as Record<string, unknown>
    await send(supabase.from(t).insert(payload))
  } catch (e) {
    put(t, list(t).filter((r) => r.id !== full.id)); toast(`Couldn’t save: ${(e as Error).message}`); throw e
  }
  return full
}

export async function update(t: Table, id: string, patch: Record<string, unknown>) {
  const prev = list(t).find((r) => r.id === id)
  put(t, list(t).map((r) => (r.id === id ? { ...r, ...patch, updated_at: now() } : r)))
  if (isDemo()) return
  try { await send(supabase.from(t).update(patch).eq('id', id)) }
  catch (e) { if (prev) put(t, list(t).map((r) => (r.id === id ? prev : r))); toast(`Couldn’t save: ${(e as Error).message}`); throw e }
}

export async function remove(t: Table, id: string) {
  const prev = list(t).find((r) => r.id === id)
  put(t, list(t).filter((r) => r.id !== id))
  if (isDemo()) return
  try { await send(supabase.from(t).delete().eq('id', id)) }
  catch (e) { if (prev) put(t, [...list(t), prev]); toast(`Couldn’t delete: ${(e as Error).message}`); throw e }
}

/** Re-insert a row that was just deleted (for Undo). */
export async function restore(t: Table, row: Row) {
  put(t, [...list(t), row])
  if (isDemo()) return
  const { created_at: _c, updated_at: _u, ...payload } = row
  try { await send(supabase.from(t).insert(payload)) } catch (e) { toast((e as Error).message) }
}

// ---------- tasks ----------
export const addTask = (t: Partial<Task> & { title: string }) =>
  insert('tasks', { status: 'open', priority: 0, tags: [], area_id: null, goal_id: null, notes: null, due_date: null, due_time: null, scheduled_for: null, estimate_min: null, completed_at: null, ...t })

export const setTaskDone = (id: string, done: boolean) =>
  update('tasks', id, { status: done ? 'done' : 'open', completed_at: done ? now() : null })

// ---------- check-ins ----------
export async function saveCheckin(c: Checkin) {
  const { id: _id, ...rest } = c
  const existing = getState().checkins.find((x) => x.kind === c.kind && x.day === c.day)
  const row = { ...(existing ?? {}), ...rest, id: existing?.id ?? newId() }
  setState({ checkins: [...getState().checkins.filter((x) => x !== existing), row] })
  if (isDemo()) return
  try { await send(supabase.from('checkins').upsert({ ...rest, owner_id: uid() }, { onConflict: 'owner_id,kind,day' })) }
  catch (e) { toast(`Couldn’t save: ${(e as Error).message}`); throw e }
}

// ---------- daily log ----------
/** A whole-day entry sits at local noon so it always lands on the right day. */
export const noonOf = (day: string) => { const d = fromKey(day); d.setHours(12, 0, 0, 0); return d.toISOString() }
const sameDay = (l: Log, day: string) => dayKey(new Date(l.occurred_at)) === day

export function dayEntries(metricId: string, day: string) {
  const logs = getState().logs.filter((l) => l.metric_id === metricId && sameDay(l, day))
  return { daily: logs.find((l) => l.source === 'daily') ?? null, timed: logs.filter((l) => l.source !== 'daily') }
}

const pending = new Map<string, number>()

/** Set the day's value for a tracker. For sum-type trackers, timed entries count toward it. */
export function setDaily(m: Metric, day: string, value: number | null, text?: string | null) {
  const { daily, timed } = dayEntries(m.id, day)
  const sum = aggMode(m) === 'sum'
  const timedSum = timed.reduce((a, l) => a + Number(l.value_num ?? 0), 0)
  let v = value == null ? null : sum ? Math.max(0, value - timedSum) : value
  if (v != null) v = Math.round(v * 100) / 100
  let logs = getState().logs
  let row: Log | null = daily
  if (value == null && text == null) {
    logs = logs.filter((l) => l !== daily); row = null
  } else if (daily) {
    row = { ...daily, value_num: v, value_text: text ?? daily.value_text }
    logs = logs.map((l) => (l === daily ? row! : l))
  } else {
    row = { id: newId(), metric_id: m.id, value_num: v, value_text: text ?? null, occurred_at: noonOf(day), note: null, source: 'daily' }
    logs = [row, ...logs]
  }
  setState({ logs })
  if (isDemo()) return
  const key = `${m.id}:${day}`
  if (!pending.has(key)) inflight++ // hold refreshes until flushed
  window.clearTimeout(pending.get(key))
  const id = row?.id ?? daily?.id
  pending.set(key, window.setTimeout(async () => {
    pending.delete(key)
    try {
      const cur = getState().logs.find((l) => l.id === id)
      if (!cur) { if (id) await send(supabase.from('logs').delete().eq('id', id)) }
      else await send(supabase.from('logs').upsert({ id: cur.id, metric_id: cur.metric_id, value_num: cur.value_num, value_text: cur.value_text, occurred_at: cur.occurred_at, note: cur.note, source: 'daily' }))
    } catch (e) { toast(`Couldn’t save ${m.name.toLowerCase()}: ${(e as Error).message}`) }
    finally { inflight-- }
  }, 600))
}

export const addTimedLog = (metric_id: string, value_num: number | null, value_text: string | null, note: string | null, occurred_at: string) =>
  insert('logs', { metric_id, value_num, value_text, note, occurred_at, source: 'app' })

// ---------- profile ----------
export async function saveProfile(p: { display_name?: string; settings?: Record<string, unknown> }) {
  const cur = getState().profile
  if (cur) setState({ profile: { ...cur, ...p, settings: { ...cur.settings, ...(p.settings ?? {}) } } })
  if (isDemo()) return
  const next = getState().profile
  await send(supabase.from('profiles').update({ display_name: next?.display_name, settings: next?.settings }).eq('id', uid()!))
}

export async function saveArea(a: { id?: string; name: string; color?: string | null; archived?: boolean }) {
  if (a.id) return update('areas', a.id, a)
  const key = a.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + Date.now().toString(36)
  return insert('areas', { ...a, key, icon: null, sort: getState().areas.length + 1, archived: false })
}

export async function saveMetric(m: Partial<Metric> & { name: string }) {
  if (m.id) return update('metrics', m.id, m)
  const key = m.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + Date.now().toString(36)
  return insert('metrics', { icon: null, target: null, target_period: null, unit: null, area_id: null, higher_is_better: true, active: true, show_today: true, ...m, key, sort: getState().metrics.length + 1 })
}
