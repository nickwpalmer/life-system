import { useState } from 'preact/hooks'
import { useRows, loadRows, registerDemo, peekRows } from '../lib/rows'
import { supabase } from '../lib/supabase'
import { toast, getState } from '../lib/store'
import { bootstrap } from '../lib/db'
import { relTime } from '../lib/dates'
import { Icon } from '../ui/icons'
import { PageHead, Card } from '../ui/kit'

/**
 * Everything Claude changed in your data, newest first. Edits you make in the app aren't logged here.
 * Undo puts the row back the way it was, or removes a row Claude added.
 */
type Change = { id: number; at: string; table_name: string; row_id: string; op: 'INSERT' | 'UPDATE' | 'DELETE'; before: Record<string, unknown> | null; after: Record<string, unknown> | null; note: string | null; reverted_at: string | null }

const TABLE: Record<string, string> = {
  tasks: 'Task', logs: 'Log entry', checkins: 'Check-in', journal_entries: 'Journal entry', notes: 'Note', goals: 'Goal', people: 'Person',
  reviews: 'Weekly review', areas: 'Area', metrics: 'Tracker', courses: 'Class', degree_reqs: 'Degree requirement', scholarships: 'Scholarship',
  key_dates: 'School date', substance_logs: 'Substance entry', edu_schools: 'School', edu_courses: 'Past course', calendar_events: 'Calendar event',
}
const OP: Record<Change['op'], [string, string]> = { INSERT: ['Added', 'var(--mint)'], UPDATE: ['Changed', 'var(--sky)'], DELETE: ['Removed', 'var(--coral)'] }
const label = (c: Change) => {
  const r = (c.after ?? c.before ?? {}) as Record<string, unknown>
  return String(r.title ?? r.name ?? r.code ?? r.substance ?? r.week_start ?? r.day ?? '').slice(0, 80) || TABLE[c.table_name] || c.table_name
}
const diff = (c: Change) => {
  if (c.op !== 'UPDATE' || !c.before || !c.after) return []
  const skip = new Set(['updated_at', 'synced_at'])
  return Object.keys(c.after).filter((k) => !skip.has(k) && JSON.stringify(c.after![k]) !== JSON.stringify(c.before![k]))
}

registerDemo('change_log', () => {
  const at = (h: number) => new Date(Date.now() - h * 3600e3).toISOString()
  return [
    { id: 3, at: at(2), table_name: 'tasks', row_id: 'x', op: 'INSERT', before: null, after: { title: 'Read chapter 4' }, note: 'Added homework from the syllabus', reverted_at: null },
    { id: 2, at: at(2), table_name: 'tasks', row_id: 'y', op: 'UPDATE', before: { due_date: '2026-11-20' }, after: { due_date: '2026-11-21' }, note: 'Added homework from the syllabus', reverted_at: null },
    { id: 1, at: at(30), table_name: 'degree_reqs', row_id: 'z', op: 'UPDATE', before: { status: 'planned' }, after: { status: 'done' }, note: 'Updated your degree plan from the audit', reverted_at: null },
  ] as never
})

export function Changes() {
  const rows = useRows<Change>('change_log')
  const [busy, setBusy] = useState<number | null>(null)
  async function undo(ids: number[]) {
    setBusy(ids[0])
    if (getState().demo) { toast('Undone (demo)'); setBusy(null); return }
    // Newest first, so a row changed twice ends up where it started.
    for (const id of ids) {
      const { error } = await supabase.rpc('revert_change', { p_id: id })
      if (error) { toast(`Couldn’t undo: ${error.message}`); break }
    }
    await Promise.all([loadRows('change_log', true), bootstrap(true)])
    for (const t of new Set((peekRows<Change>('change_log') ?? []).filter((c) => ids.includes(c.id)).map((c) => c.table_name))) {
      if (['courses', 'degree_reqs', 'scholarships', 'key_dates', 'substance_logs', 'edu_schools', 'edu_courses'].includes(t)) loadRows(t as never, true)
    }
    toast('Undone'); setBusy(null)
  }
  if (rows === null) return <><PageHead title="Claude’s changes" back="#/more" icon="undo" color="var(--lilac)" /><div class="skeleton" /></>
  // One group per batch: same note, written within a few minutes of each other.
  const groups: { note: string; at: string; items: Change[] }[] = []
  for (const c of rows) {
    const g = groups[groups.length - 1]
    if (g && g.note === (c.note ?? '') && Math.abs(new Date(g.items[g.items.length - 1].at).getTime() - new Date(c.at).getTime()) < 10 * 60e3) g.items.push(c)
    else groups.push({ note: c.note ?? '', at: c.at, items: [c] })
  }
  return (
    <>
      <PageHead title="Claude’s changes" sub="Every edit Claude makes to your data" back="#/more" icon="undo" color="var(--lilac)" />
      {!rows.length && <div class="card soft"><p class="muted">Nothing yet. When Claude adds or edits something for you, it shows up here and you can undo it.</p></div>}
      {groups.map((g) => {
        const live = g.items.filter((c) => !c.reverted_at)
        return (
          <Card title={g.note || 'Changes'} action={<span class="faint small">{relTime(g.at)}</span>}>
            {g.items.slice(0, 12).map((c) => {
              const d = diff(c)
              return (
                <div class={`chg ${c.reverted_at ? 'undone' : ''}`}>
                  <span class="pill" style={`--c:${OP[c.op][1]}`}>{OP[c.op][0]}</span>
                  <span class="grow"><div class="ellipsis">{label(c)}</div><div class="faint tiny">{TABLE[c.table_name] ?? c.table_name}{d.length ? ` · ${d.slice(0, 3).join(', ').replace(/_/g, ' ')}` : ''}{c.reverted_at ? ' · undone' : ''}</div></span>
                  {!c.reverted_at && <button class="faint" aria-label="Undo this one" disabled={busy !== null} onClick={() => undo([c.id])}><Icon name="undo" size={16} /></button>}
                </div>
              )
            })}
            {g.items.length > 12 && <p class="faint small" style="margin-top:8px">and {g.items.length - 12} more</p>}
            {live.length > 1 && <button class="btn sm" style="margin-top:12px" disabled={busy !== null} onClick={() => { if (confirm(`Undo all ${live.length} of these?`)) undo(live.map((c) => c.id)) }}><Icon name="undo" size={15} />Undo all {live.length}</button>}
          </Card>
        )
      })}
    </>
  )
}
