import { useState } from 'preact/hooks'
import { useRows, loadRows, registerDemo, addRow } from '../lib/rows'
import { supabase } from '../lib/supabase'
import { toast, getState } from '../lib/store'
import { bootstrap } from '../lib/db'
import { relTime } from '../lib/dates'
import { PageHead, Card } from '../ui/kit'

/**
 * Everything Claude changed in your data, newest first. Edits you make in the app aren't logged here.
 * Undo puts the row back the way it was (or removes a row Claude added) and leaves Claude a note,
 * so the next Claude that writes knows not to redo it. Notes you leave here land in the same inbox.
 */
type Op = 'insert' | 'update' | 'delete'
type Change = { id: number; at: string; table_name: string; row_id: string; op: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; note: string | null; reverted_at: string | null }
type Inbox = { id: string; kind: 'undo' | 'note'; change_id: number | null; body: string; status: 'open' | 'done'; reply: string | null; created_at: string; done_at: string | null }

const TABLE: Record<string, string> = {
  tasks: 'Task', logs: 'Log entry', checkins: 'Check-in', journal_entries: 'Journal entry', notes: 'Note', records: 'Record', goals: 'Goal', people: 'Person',
  reviews: 'Weekly review', areas: 'Area', metrics: 'Tracker', courses: 'Class', degree_reqs: 'Degree requirement', scholarships: 'Scholarship',
  key_dates: 'School date', substance_logs: 'Substance entry', edu_schools: 'School', edu_courses: 'Past course', calendar_events: 'Calendar event',
  grade_logs: 'Grade estimate', reports: 'Report', inventory_items: 'Inventory item', profiles: 'Settings',
}
const OP: Record<Op, [string, string]> = { insert: ['Added', 'var(--mint)'], update: ['Changed', 'var(--sky)'], delete: ['Removed', 'var(--coral)'] }
const opOf = (c: Change): [string, string] => OP[String(c.op).toLowerCase() as Op] ?? ['Changed', 'var(--sky)']
const label = (c: Change) => {
  const r = (c.after ?? c.before ?? {}) as Record<string, unknown>
  return String(r.title ?? r.name ?? r.code ?? r.substance ?? r.week_start ?? r.day ?? '').slice(0, 80) || TABLE[c.table_name] || c.table_name
}
const diff = (c: Change) => {
  if (String(c.op).toLowerCase() !== 'update' || !c.before || !c.after) return []
  const skip = new Set(['updated_at', 'synced_at'])
  return Object.keys(c.after).filter((k) => !skip.has(k) && JSON.stringify(c.after![k]) !== JSON.stringify(c.before![k]))
}
const ROW_TABLES = ['courses', 'degree_reqs', 'scholarships', 'key_dates', 'substance_logs', 'edu_schools', 'edu_courses', 'records', 'grade_logs', 'reports', 'inventory_items']

registerDemo('change_log', () => {
  const at = (h: number) => new Date(Date.now() - h * 3600e3).toISOString()
  return [
    { id: 3, at: at(2), table_name: 'tasks', row_id: 'x', op: 'insert', before: null, after: { title: 'Read chapter 4' }, note: 'Added homework from the syllabus', reverted_at: null },
    { id: 2, at: at(2), table_name: 'tasks', row_id: 'y', op: 'update', before: { due_date: '2026-11-20' }, after: { due_date: '2026-11-21' }, note: 'Added homework from the syllabus', reverted_at: null },
    { id: 1, at: at(30), table_name: 'degree_reqs', row_id: 'z', op: 'update', before: { status: 'planned' }, after: { status: 'done' }, note: 'Updated your degree plan from the audit', reverted_at: null },
  ] as never
})
registerDemo('claude_inbox', () => [])

export function Changes() {
  const rows = useRows<Change>('change_log')
  const inbox = useRows<Inbox>('claude_inbox') ?? []
  const [busy, setBusy] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [open, setOpen] = useState<Record<number, boolean>>({})

  async function undo(c: Change) {
    setBusy(c.id)
    let ok = true, why = ''
    if (!getState().demo) {
      const { error } = await supabase.rpc('revert_change', { p_id: c.id })
      if (error) { ok = false; why = error.message }
    }
    // Leave Claude a note either way: done = already undone here, open = Claude has to do it.
    const what = `${opOf(c)[0]} ${TABLE[c.table_name] ?? c.table_name}: ${label(c)}`
    await addRow('claude_inbox', {
      kind: 'undo', change_id: c.id, status: ok ? 'done' : 'open',
      body: ok ? `Nick undid this. Don’t redo it unless he asks. (${what})` : `Nick asked to undo this, but the app couldn’t (${why}). Please undo it. (${what})`,
      done_at: ok ? new Date().toISOString() : null,
    }).catch(() => {})
    if (!getState().demo) {
      await Promise.all([loadRows('change_log', true), bootstrap(true)])
      if (ROW_TABLES.includes(c.table_name)) loadRows(c.table_name as never, true)
    }
    toast(ok ? 'Undone. Claude will know not to redo it.' : 'Couldn’t undo here, so Claude will do it next time.')
    setBusy(null)
  }

  async function leaveNote() {
    const body = note.trim()
    if (!body) return
    setNote('')
    await addRow('claude_inbox', { kind: 'note', body, status: 'open', change_id: null, done_at: null }).catch(() => {})
    toast('Claude will read this before its next change')
  }

  const head = <PageHead title="Claude’s changes" sub="What Claude edited, and notes for Claude" back="#/more" icon="history" color="var(--lilac)" />
  if (rows === null) return <>{head}<div class="skeleton" /></>
  // One group per batch: same note, written within a few minutes of each other.
  const groups: { note: string; at: string; items: Change[] }[] = []
  for (const c of rows) {
    const g = groups[groups.length - 1]
    if (g && g.note === (c.note ?? '') && Math.abs(new Date(g.items[g.items.length - 1].at).getTime() - new Date(c.at).getTime()) < 10 * 60e3) g.items.push(c)
    else groups.push({ note: c.note ?? '', at: c.at, items: [c] })
  }
  const pending = inbox.filter((m) => m.status === 'open')
  return (
    <>
      {head}
      <Card title="Note for Claude">
        <p class="faint small" style="margin:-4px 0 10px">Claude reads these before its next change to your data.</p>
        <div class="row" style="gap:8px">
          <input class="input grow" placeholder="Leave a note" value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') leaveNote() }} />
          {note.trim() && <button class="btn sm primary" onClick={leaveNote}>Send</button>}
        </div>
        {pending.length > 0 && <div style="margin-top:10px">{pending.map((m) => <div class="chg"><span class="pill" style="--c:var(--gold)">Waiting</span><span class="grow small" style="min-width:0">{m.body}</span><span class="faint tiny">{relTime(m.created_at)}</span></div>)}</div>}
      </Card>
      {!rows.length && <div class="card soft"><p class="muted">Nothing yet. When Claude adds or edits something for you, it shows up here and you can undo it.</p></div>}
      {groups.slice(0, 40).map((g, gi) => {
        const shown = open[gi] ? g.items : g.items.slice(0, 6)
        return (
          <Card title={g.note || 'Changes'} action={<span class="faint small">{relTime(g.at)}</span>}>
            {shown.map((c) => {
              const d = diff(c)
              const [verb, color] = opOf(c)
              return (
                <div class={`chg ${c.reverted_at ? 'undone' : ''}`}>
                  <span class="pill" style={`--c:${color}`}>{verb}</span>
                  <span class="grow" style="min-width:0"><div class="ellipsis">{label(c)}</div><div class="faint tiny ellipsis">{TABLE[c.table_name] ?? c.table_name}{d.length ? ` · ${d.slice(0, 3).join(', ').replace(/_/g, ' ')}` : ''}{c.reverted_at ? ' · undone' : ''}</div></span>
                  {!c.reverted_at && <button class="btn sm ghost" disabled={busy !== null} onClick={() => undo(c)}>{busy === c.id ? '…' : 'Undo'}</button>}
                </div>
              )
            })}
            {g.items.length > 6 && <button class="faint small" style="margin-top:8px" onClick={() => setOpen({ ...open, [gi]: !open[gi] })}>{open[gi] ? 'Show less' : `Show ${g.items.length - 6} more`}</button>}
          </Card>
        )
      })}
    </>
  )
}
