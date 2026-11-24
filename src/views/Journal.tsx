import { useEffect, useState } from 'preact/hooks'
import { useStore, toast, areaById, getState } from '../lib/store'
import { insert, update, remove, restore } from '../lib/db'
import { fmtDay, dayKey, fmtTime } from '../lib/dates'
import type { JournalEntry } from '../lib/types'
import { Icon } from '../ui/icons'
import { Sheet, ScalePicker, PageHead } from '../ui/kit'

const PROMPTS = [
  'What’s taking up the most space in your head right now?',
  'What would make tomorrow feel like a win?',
  'What are you avoiding, and why?',
  'What did you learn about yourself this week?',
  'Who do you want to be a year from now?',
  'What drained you today, and what filled you back up?',
  'What would you do this week if you weren’t afraid of doing it badly?',
  'Where did your time go today, and is that where you want it to go?',
]

export function JournalEditor({ open, entry, onClose }: { open: boolean; entry: JournalEntry | null; onClose: () => void }) {
  const areas = useStore((s) => s.areas.filter((a) => !a.archived))
  const [f, setF] = useState<Partial<JournalEntry>>({})
  const [prompt, setPrompt] = useState('')
  useEffect(() => {
    if (open) { setF(entry ? { ...entry } : { body: '', title: null, mood: null, area_id: null }); setPrompt(PROMPTS[Math.floor(Math.random() * PROMPTS.length)]) }
  }, [open])
  async function save() {
    const body = f.body?.trim()
    onClose()
    if (!body) return
    try {
      if (entry) await update('journal_entries', entry.id, { title: f.title || null, body, mood: f.mood ?? null, area_id: f.area_id ?? null })
      else await insert('journal_entries', { title: f.title || null, body, mood: f.mood ?? null, area_id: f.area_id ?? null, tags: [], occurred_at: new Date().toISOString() })
      toast('Saved')
    } catch { /* shown */ }
  }
  async function del() {
    const row = getState().journal.find((j) => j.id === entry!.id)
    onClose()
    await remove('journal_entries', entry!.id).catch(() => {})
    if (row) toast('Entry deleted', () => restore('journal_entries', row as never))
  }
  return (
    <Sheet open={open} onClose={save} wide>
      <input class="input title bare" placeholder="Title (optional)" value={f.title ?? ''} onInput={(e) => setF({ ...f, title: (e.target as HTMLInputElement).value || null })} />
      {!entry && !f.body && <button class="faint small" style="margin:4px 2px 10px;text-align:left" onClick={() => setPrompt(PROMPTS[(PROMPTS.indexOf(prompt) + 1) % PROMPTS.length])}>{prompt} <span style="color:var(--lilac)">another</span></button>}
      <textarea class="input tall" placeholder="Write freely…" value={f.body ?? ''} onInput={(e) => setF({ ...f, body: (e.target as HTMLTextAreaElement).value })} />
      <div class="field" style="margin-top:14px"><span>Mood (optional)</span><ScalePicker value={f.mood ?? null} onChange={(v) => setF({ ...f, mood: f.mood === v ? null : v })} /></div>
      <div class="chips" style="margin-bottom:16px">
        {areas.map((a) => <button class={`chip ${f.area_id === a.id ? 'on' : ''}`} style={`--c:${a.color}`} onClick={() => setF({ ...f, area_id: f.area_id === a.id ? null : a.id })}><i class="dot" style={`background:${a.color}`} />{a.name}</button>)}
      </div>
      <button class="btn primary block" onClick={save}>Save</button>
      {entry && <button class="btn ghost danger block" style="margin-top:8px" onClick={del}><Icon name="trash" size={18} /> Delete</button>}
    </Sheet>
  )
}

export function Journal() {
  const items = useStore((s) => [...s.journal].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)))
  const checkins = useStore((s) => s.checkins)
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<{ open: boolean; entry: JournalEntry | null }>({ open: false, entry: null })
  const shown = q ? items.filter((j) => `${j.title ?? ''} ${j.body}`.toLowerCase().includes(q.toLowerCase())) : items
  // Night reflections count as journaling too, so show them here.
  const reflections = checkins.filter((c) => c.kind === 'night' && (c.reflection || c.win)).sort((a, b) => b.day.localeCompare(a.day)).slice(0, 5)
  return (
    <>
      <PageHead title="Journal" icon="book" color="var(--mint)" action={<button class="icon-btn" aria-label="New entry" onClick={() => setEdit({ open: true, entry: null })}><Icon name="plus" /></button>} />
      <button class="card soft prompt" onClick={() => setEdit({ open: true, entry: null })}>
        <span class="orb"><Icon name="sparkle" size={22} /></span>
        <span class="grow"><h3>Write something</h3><p class="muted small">No rules. A line counts.</p></span>
      </button>
      <div class="grid-2">
        <section class="card">
          {items.length > 4 && <input class="input" style="margin-bottom:8px" placeholder="Search entries" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />}
          {shown.length === 0 ? <p class="empty">{q ? 'No entries match.' : 'Your entries will live here.'}</p> : shown.map((j) => {
            const a = areaById(j.area_id)
            return (
              <div class="entry" onClick={() => setEdit({ open: true, entry: j })}>
                {j.title && <div class="e-title">{j.title}</div>}
                <div class="e-body">{j.body}</div>
                <div class="e-meta">{fmtDay(dayKey(new Date(j.occurred_at)))} · {fmtTime(j.occurred_at)}{j.mood ? ` · mood ${j.mood}` : ''}{a ? ` · ${a.name}` : ''}</div>
              </div>
            )
          })}
        </section>
        {reflections.length > 0 && <section class="card" style="--accent:var(--violet)">
          <div class="card-h"><h2>From night check-ins</h2></div>
          {reflections.map((c) => <div class="entry" style="cursor:default">
            {c.win && <div class="e-title">Win: {c.win}</div>}
            {c.reflection && <div class="e-body">{c.reflection}</div>}
            {c.lesson && <div class="e-body">Lesson: {c.lesson}</div>}
            <div class="e-meta">{fmtDay(c.day)}</div>
          </div>)}
        </section>}
      </div>
      <JournalEditor open={edit.open} entry={edit.entry} onClose={() => setEdit({ open: false, entry: null })} />
    </>
  )
}
