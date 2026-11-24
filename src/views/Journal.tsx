import { useEffect, useState } from 'preact/hooks'
import { useStore, toast, areaById } from '../lib/store'
import { listJournal, saveJournal, deleteJournal } from '../lib/db'
import { fmtDay, dayKey, fmtTime } from '../lib/dates'
import type { JournalEntry } from '../lib/types'
import { Icon } from '../ui/icons'
import { Sheet, ScalePicker, Spinner } from '../ui/kit'

const PROMPTS = [
  'What’s taking up the most space in your head right now?',
  'What would make tomorrow feel like a win?',
  'What are you avoiding, and why?',
  'What did you learn about yourself this week?',
  'Who do you want to be a year from now?',
  'What drained you today, and what filled you back up?',
]

function Editor({ open, entry, onClose }: { open: boolean; entry: JournalEntry | null; onClose: () => void }) {
  const areas = useStore((s) => s.areas.filter((a) => !a.archived))
  const [f, setF] = useState<Partial<JournalEntry>>({})
  const [prompt, setPrompt] = useState('')
  useEffect(() => {
    if (open) { setF(entry ? { ...entry } : { body: '', title: null, mood: null }); setPrompt(PROMPTS[Math.floor(Math.random() * PROMPTS.length)]) }
  }, [open])
  async function save() {
    if (!f.body?.trim()) { onClose(); return }
    try { await saveJournal({ ...f, body: f.body.trim() } as JournalEntry); toast('Saved'); onClose() } catch (e) { toast((e as Error).message) }
  }
  return (
    <Sheet open={open} onClose={save}>
      <input class="input" style="font-size:20px;font-weight:650;background:transparent;border:0;padding:4px 2px" placeholder="Title (optional)" value={f.title ?? ''} onInput={(e) => setF({ ...f, title: (e.target as HTMLInputElement).value || null })} />
      {!entry && !f.body && <p class="faint small" style="margin:4px 2px 10px">{prompt}</p>}
      <textarea class="input tall" placeholder="Write freely…" value={f.body ?? ''} onInput={(e) => setF({ ...f, body: (e.target as HTMLTextAreaElement).value })} />
      <div class="field" style="margin-top:14px"><span>Mood (optional)</span><ScalePicker value={f.mood ?? null} onChange={(v) => setF({ ...f, mood: f.mood === v ? null : v })} /></div>
      <div class="chips" style="margin-bottom:16px">
        {areas.map((a) => <button class={`chip ${f.area_id === a.id ? 'on' : ''}`} onClick={() => setF({ ...f, area_id: f.area_id === a.id ? null : a.id })}><i class="dot" style={`background:${a.color}`} />{a.name}</button>)}
      </div>
      <button class="btn primary block" onClick={save}>Save</button>
      {entry && <button class="btn ghost danger block" style="margin-top:8px" onClick={async () => { if (confirm('Delete this entry?')) { await deleteJournal(entry.id); onClose() } }}><Icon name="trash" size={18} /> Delete</button>}
    </Sheet>
  )
}

export function Journal() {
  const version = useStore((s) => s.dataVersion)
  const [items, setItems] = useState<JournalEntry[] | null>(null)
  const [edit, setEdit] = useState<{ open: boolean; entry: JournalEntry | null }>({ open: false, entry: null })
  useEffect(() => { listJournal().then(setItems).catch(() => setItems([])) }, [version])

  return (
    <>
      <div class="page-title"><h1>Journal</h1><button class="icon-btn" aria-label="New entry" onClick={() => setEdit({ open: true, entry: null })}><Icon name="plus" /></button></div>
      <button class="card soft prompt" onClick={() => setEdit({ open: true, entry: null })}>
        <span class="orb"><Icon name="sparkle" size={22} /></span>
        <span class="grow"><h3>Write something</h3><p class="muted small">No rules. A line counts.</p></span>
      </button>
      <section class="card">
        {items == null ? <Spinner /> : items.length === 0 ? <p class="empty">Your entries will live here.</p> : items.map((j) => {
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
      <Editor open={edit.open} entry={edit.entry} onClose={() => setEdit({ open: false, entry: null })} />
    </>
  )
}
