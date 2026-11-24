/**
 * Data layer. Every read/write goes through here so the schema lives in one place.
 * Tables (Supabase "life-system"): profiles, areas, goals, tasks, checkins, journal_entries,
 * metrics, logs, notes, people, calendar_events. RLS: owner_id = auth.uid() everywhere.
 */
import { supabase } from './supabase'
import { getState, setState, bump } from './store'
import type { Area, Metric, Log, Task, Checkin, JournalEntry, Note, CalEvent } from './types'
import { addDays, startOfDay } from './dates'

const uid = () => getState().session?.user.id

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

// ---------- base data ----------
export async function loadBase() {
  const [areas, metrics] = await Promise.all([
    supabase.from('areas').select('*').order('sort'),
    supabase.from('metrics').select('*').order('sort'),
  ])
  setState({ areas: check(areas) as Area[], metrics: check(metrics) as Metric[] })
}

export async function saveArea(a: Partial<Area> & { name: string }) {
  if (a.id) check(await supabase.from('areas').update(a).eq('id', a.id))
  else {
    const key = a.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + Date.now().toString(36)
    check(await supabase.from('areas').insert({ ...a, key, sort: getState().areas.length + 1 }))
  }
  await loadBase()
}

export async function saveMetric(m: Partial<Metric> & { name: string }) {
  if (m.id) check(await supabase.from('metrics').update(m).eq('id', m.id))
  else {
    const key = m.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + Date.now().toString(36)
    check(await supabase.from('metrics').insert({ ...m, key, sort: getState().metrics.length + 1 }))
  }
  await loadBase()
}

// ---------- logs ----------
export async function addLog(metric_id: string, value_num: number | null, value_text: string | null = null, note: string | null = null, occurred_at?: string) {
  const row = check(await supabase.from('logs')
    .insert({ metric_id, value_num, value_text, note, occurred_at: occurred_at ?? new Date().toISOString(), source: 'app' })
    .select().single()) as Log
  bump()
  return row
}

export async function deleteLog(id: string) {
  check(await supabase.from('logs').delete().eq('id', id))
  bump()
}

export async function logsSince(days: number, metricIds?: string[]) {
  let q = supabase.from('logs').select('*')
    .gte('occurred_at', startOfDay(addDays(new Date(), -(days - 1))).toISOString())
    .order('occurred_at', { ascending: false }).limit(5000)
  if (metricIds?.length) q = q.in('metric_id', metricIds)
  return check(await q) as Log[]
}

// ---------- tasks ----------
export async function listTasks(includeDone = false) {
  let q = supabase.from('tasks').select('*').order('due_date', { ascending: true, nullsFirst: false })
    .order('priority', { ascending: false }).order('created_at', { ascending: false })
  if (!includeDone) q = q.not('status', 'in', '(done,dropped)')
  return check(await q) as Task[]
}

export async function recentlyDone(days = 7) {
  return check(await supabase.from('tasks').select('*').eq('status', 'done')
    .gte('completed_at', addDays(new Date(), -days).toISOString())
    .order('completed_at', { ascending: false }).limit(100)) as Task[]
}

export async function saveTask(t: Partial<Task> & { title: string }) {
  const { id, created_at: _c, completed_at: _d, ...rest } = t
  if (id) check(await supabase.from('tasks').update(rest).eq('id', id))
  else check(await supabase.from('tasks').insert(rest))
  bump()
}

export async function setTaskDone(id: string, done: boolean) {
  check(await supabase.from('tasks').update({
    status: done ? 'done' : 'open', completed_at: done ? new Date().toISOString() : null,
  }).eq('id', id))
  bump()
}

export async function deleteTask(id: string) {
  check(await supabase.from('tasks').delete().eq('id', id))
  bump()
}

// ---------- check-ins ----------
export async function getCheckin(kind: 'morning' | 'night', day: string) {
  return check(await supabase.from('checkins').select('*').eq('kind', kind).eq('day', day).maybeSingle()) as Checkin | null
}

export async function checkinsSince(days: number) {
  return check(await supabase.from('checkins').select('*')
    .gte('day', addDays(new Date(), -days).toISOString().slice(0, 10)).order('day')) as Checkin[]
}

export async function saveCheckin(c: Checkin) {
  const { id: _id, ...rest } = c
  check(await supabase.from('checkins').upsert({ ...rest, owner_id: uid() }, { onConflict: 'owner_id,kind,day' }))
  bump()
}

// ---------- journal ----------
export async function listJournal(limit = 60) {
  return check(await supabase.from('journal_entries').select('*').order('occurred_at', { ascending: false }).limit(limit)) as JournalEntry[]
}
export async function saveJournal(j: Partial<JournalEntry> & { body: string }) {
  const { id, ...rest } = j
  if (id) check(await supabase.from('journal_entries').update(rest).eq('id', id))
  else check(await supabase.from('journal_entries').insert(rest))
  bump()
}
export async function deleteJournal(id: string) {
  check(await supabase.from('journal_entries').delete().eq('id', id)); bump()
}

// ---------- notes ----------
export async function listNotes() {
  return check(await supabase.from('notes').select('*').order('pinned', { ascending: false }).order('updated_at', { ascending: false })) as Note[]
}
export async function saveNote(n: Partial<Note> & { title: string }) {
  const { id, updated_at: _u, ...rest } = n
  if (id) check(await supabase.from('notes').update(rest).eq('id', id))
  else check(await supabase.from('notes').insert(rest))
  bump()
}
export async function deleteNote(id: string) {
  check(await supabase.from('notes').delete().eq('id', id)); bump()
}

// ---------- calendar (filled by Claude's sync for now) ----------
export async function eventsBetween(from: Date, to: Date) {
  return check(await supabase.from('calendar_events').select('*')
    .gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString()).order('starts_at')) as CalEvent[]
}

// ---------- profile ----------
export async function getProfile() {
  return check(await supabase.from('profiles').select('*').maybeSingle()) as { display_name: string | null; settings: Record<string, unknown> } | null
}
export async function saveProfile(p: { display_name?: string; settings?: Record<string, unknown> }) {
  check(await supabase.from('profiles').update(p).eq('id', uid()!))
}
