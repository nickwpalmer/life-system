import { useEffect, useState } from 'preact/hooks'
import { supabase } from './supabase'
import { getState, toast } from './store'

/**
 * Tables that aren't in the one-shot bootstrap load on the screens that need them.
 * One shared cache per table, so every screen sees the same rows and writes update everywhere at once.
 */
export type RowTable = 'substance_logs' | 'courses' | 'degree_reqs' | 'scholarships' | 'change_log' | 'key_dates' | 'edu_schools' | 'edu_courses' | 'records' | 'claude_inbox' | 'grade_logs' | 'reports' | 'inventory_items'
type Row = { id: string | number } & Record<string, unknown>
const cache = new Map<RowTable, Row[]>()
const loading = new Map<RowTable, Promise<void>>()
const subs = new Map<RowTable, Set<() => void>>()
const demoRows = new Map<RowTable, () => Row[]>()
const ORDER: Record<RowTable, [string, boolean]> = {
  substance_logs: ['occurred_at', false], courses: ['sort', true], degree_reqs: ['sort', true],
  scholarships: ['deadline', true], change_log: ['at', false], key_dates: ['day', true],
  edu_schools: ['sort', true], edu_courses: ['term_order', true], records: ['name', true],
  claude_inbox: ['created_at', false], grade_logs: ['logged_at', true], reports: ['created_at', false], inventory_items: ['name', true],
}

export function registerDemo(t: RowTable, f: () => Row[]) { demoRows.set(t, f) }
const notify = (t: RowTable) => subs.get(t)?.forEach((f) => f())
const set = (t: RowTable, rows: Row[]) => { cache.set(t, rows); notify(t) }
export const peekRows = <T,>(t: RowTable) => cache.get(t) as T[] | undefined

export function loadRows(t: RowTable, force = false) {
  if (cache.has(t) && !force) return Promise.resolve()
  if (loading.has(t)) return loading.get(t)!
  const p = (async () => {
    if (getState().demo) { set(t, demoRows.get(t)?.() ?? []); return }
    const [col, asc] = ORDER[t]
    let q = supabase.from(t).select('*').order(col, { ascending: asc, nullsFirst: false })
    if (t === 'change_log') q = q.limit(200)
    if (t === 'claude_inbox') q = q.limit(100)
    if (t === 'substance_logs') q = q.limit(2000)
    const { data, error } = await q
    if (error) { toast(`Couldn’t load: ${error.message}`); set(t, []); return }
    set(t, (data ?? []) as Row[])
  })().finally(() => loading.delete(t))
  loading.set(t, p)
  return p
}

export function useRows<T>(t: RowTable): T[] | null {
  const [, force] = useState(0)
  useEffect(() => {
    const f = () => force((n) => n + 1)
    if (!subs.has(t)) subs.set(t, new Set())
    subs.get(t)!.add(f)
    loadRows(t)
    return () => { subs.get(t)!.delete(f) }
  }, [t])
  return (cache.get(t) as T[] | undefined) ?? null
}

export async function addRow<T extends Record<string, unknown>>(t: RowTable, row: T) {
  const full = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row } as Row
  set(t, [full, ...(cache.get(t) ?? [])])
  if (getState().demo) return full
  const { created_at: _c, ...payload } = full
  const { error } = await supabase.from(t).insert(payload)
  if (error) { set(t, (cache.get(t) ?? []).filter((r) => r.id !== full.id)); toast(`Couldn’t save: ${error.message}`); throw error }
  return full
}

export async function patchRow(t: RowTable, id: string | number, patch: Record<string, unknown>) {
  const prev = cache.get(t)?.find((r) => r.id === id)
  set(t, (cache.get(t) ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)))
  if (getState().demo) return
  const { error } = await supabase.from(t).update(patch).eq('id', id)
  if (error) { if (prev) set(t, (cache.get(t) ?? []).map((r) => (r.id === id ? prev : r))); toast(`Couldn’t save: ${error.message}`); throw error }
}

export async function dropRow(t: RowTable, id: string | number) {
  const prev = cache.get(t) ?? []
  set(t, prev.filter((r) => r.id !== id))
  if (getState().demo) return
  const { error } = await supabase.from(t).delete().eq('id', id)
  if (error) { set(t, prev); toast(`Couldn’t delete: ${error.message}`); throw error }
}

/** Reloads every table a screen has opened, so the app matches the database. */
export function reloadAll() { return Promise.all([...cache.keys()].map((t) => loadRows(t, true))) }
