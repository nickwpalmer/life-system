import { useEffect, useRef, useState } from 'preact/hooks'
import { useStore, toast, areaById, getState } from '../lib/store'
import { insert, update, remove, restore } from '../lib/db'
import { fmtDay, dayKey, fmtTime } from '../lib/dates'
import type { JournalEntry } from '../lib/types'
import { Icon } from '../ui/icons'
import { Sheet, ScalePicker, PageHead } from '../ui/kit'
import { uploadPhotos, deletePhoto, usePhotoUrls } from '../lib/photos'

/** Claude's summaries are titled "Claude's summary: ..."; the badge says that, so the title drops it. */
const isClaude = (j: JournalEntry) => j.author === 'claude'
const cleanTitle = (j: JournalEntry) => (j.title ?? '').replace(/^Claude[’']s summary:?\s*/i, '').trim() || null

function Photos({ paths, onRemove, small }: { paths: string[]; onRemove?: (p: string) => void; small?: boolean }) {
  const urls = usePhotoUrls(paths)
  if (!paths.length) return null
  return (
    <div class={`photos ${small ? 'small' : ''}`}>
      {paths.map((p) => (
        <div class="ph">
          {urls[p] ? <a href={urls[p]} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}><img src={urls[p]} alt="" loading="lazy" /></a> : <span class="ph-wait" />}
          {onRemove && <button class="ph-x" aria-label="Remove photo" onClick={() => onRemove(p)}><Icon name="x" size={14} /></button>}
        </div>
      ))}
    </div>
  )
}

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

const DRAFT = 'journal-draft'

export function JournalEditor({ open, entry, onClose }: { open: boolean; entry: JournalEntry | null; onClose: () => void }) {
  const areas = useStore((s) => s.areas.filter((a) => !a.archived))
  const [f, setF] = useState<Partial<JournalEntry>>({})
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [dropped, setDropped] = useState<string[]>([])
  const [hadDraft, setHadDraft] = useState(false)
  const pick = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!open) return
    let draft: Partial<JournalEntry> | null = null
    if (!entry) { try { draft = JSON.parse(localStorage.getItem(DRAFT) ?? 'null') } catch { /* none */ } }
    setF(entry ? { ...entry, photos: entry.photos ?? [] } : draft ?? { body: '', title: null, mood: null, area_id: null, photos: [] })
    setHadDraft(!!draft); setDropped([]); setPrompt(PROMPTS[Math.floor(Math.random() * PROMPTS.length)])
  }, [open])
  async function addPhotos(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    const paths = await uploadPhotos(files)
    setBusy(false)
    setF((cur) => ({ ...cur, photos: [...(cur.photos ?? []), ...paths] }))
  }
  /** Closing without Save: a new entry is kept as a draft for next time; edits to an old one are dropped. */
  function dismiss() {
    onClose()
    if (entry) return
    const has = (f.body?.trim() || f.title || (f.photos ?? []).length)
    try {
      if (has) { localStorage.setItem(DRAFT, JSON.stringify({ title: f.title ?? null, body: f.body ?? '', mood: f.mood ?? null, area_id: f.area_id ?? null, photos: f.photos ?? [] })); toast('Kept as a draft') }
      else localStorage.removeItem(DRAFT)
    } catch { /* storage off */ }
  }
  function discard() {
    try { localStorage.removeItem(DRAFT) } catch { /* */ }
    ;(f.photos ?? []).forEach(deletePhoto)
    setF({ body: '', title: null, mood: null, area_id: null, photos: [] }); setHadDraft(false)
  }
  async function save() {
    const body = f.body?.trim() ?? ''
    const photos = f.photos ?? []
    onClose()
    if (!entry) try { localStorage.removeItem(DRAFT) } catch { /* */ }
    if (!body && !photos.length) { [...photos, ...dropped].forEach(deletePhoto); return }
    try {
      if (entry) await update('journal_entries', entry.id, { title: f.title || null, body, mood: f.mood ?? null, area_id: f.area_id ?? null, photos })
      else await insert('journal_entries', { title: f.title || null, body, mood: f.mood ?? null, area_id: f.area_id ?? null, tags: [], photos, author: 'nick', occurred_at: new Date().toISOString() })
      dropped.forEach(deletePhoto)
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
    <Sheet open={open} onClose={dismiss} wide title={entry ? 'Edit entry' : 'New entry'}>
      {!entry && hadDraft && <div class="row between small" style="margin:-4px 0 8px"><span class="faint">Picked up your draft</span><button class="faint small" onClick={discard}>Start fresh</button></div>}
      <input class="input title bare" placeholder="Title (optional)" value={f.title ?? ''} onInput={(e) => setF({ ...f, title: (e.target as HTMLInputElement).value || null })} />
      {!entry && !f.body && <button class="faint small" style="margin:4px 2px 10px;text-align:left" onClick={() => setPrompt(PROMPTS[(PROMPTS.indexOf(prompt) + 1) % PROMPTS.length])}>{prompt} <span style="color:var(--lilac)">another</span></button>}
      {entry && isClaude(entry) && <p class="by-claude-note small">Claude wrote this summary from your brain dump. Edit anything that’s off.</p>}
      <textarea class="input tall" placeholder="Write freely…" value={f.body ?? ''} onInput={(e) => setF({ ...f, body: (e.target as HTMLTextAreaElement).value })} />
      <Photos paths={f.photos ?? []} onRemove={(p) => { setF({ ...f, photos: (f.photos ?? []).filter((x) => x !== p) }); setDropped([...dropped, p]) }} />
      <input ref={pick} type="file" accept="image/*" multiple hidden onChange={(e) => { const el = e.target as HTMLInputElement; addPhotos(el.files); el.value = '' }} />
      <button class="btn ghost small" style="margin-top:8px" disabled={busy} onClick={() => pick.current?.click()}><Icon name="plus" size={16} /> {busy ? 'Adding photo…' : 'Add photo'}</button>
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
  const [who, setWho] = useState<'all' | 'nick' | 'claude'>('all')
  const [edit, setEdit] = useState<{ open: boolean; entry: JournalEntry | null }>({ open: false, entry: null })
  const both = items.some(isClaude) && items.some((j) => !isClaude(j))
  const shown = items
    .filter((j) => who === 'all' || (who === 'claude') === isClaude(j))
    .filter((j) => !q || `${j.title ?? ''} ${j.body}`.toLowerCase().includes(q.toLowerCase()))
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
          {both && <div class="chips" style="margin-bottom:6px">
            {([['all', 'All'], ['nick', 'Mine'], ['claude', 'Claude’s summaries']] as const).map(([k, l]) => <button class={`chip ${who === k ? 'on' : ''}`} onClick={() => setWho(k)}>{l}</button>)}
          </div>}
          {items.length > 4 && <input class="input" style="margin-bottom:8px" placeholder="Search entries" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />}
          {shown.length === 0 ? <p class="empty">{q || who !== 'all' ? 'No entries match.' : 'Your entries will live here.'}</p> : shown.map((j) => {
            const a = areaById(j.area_id)
            const c = isClaude(j)
            const t = c ? cleanTitle(j) : j.title
            return (
              <div class={`entry ${c ? 'by-claude' : 'by-me'}`} onClick={() => setEdit({ open: true, entry: j })}>
                {c && <span class="e-badge"><Icon name="sparkle" size={12} /> Claude’s summary</span>}
                {t && <div class="e-title">{t}</div>}
                <div class="e-body">{j.body}</div>
                <Photos paths={j.photos ?? []} small />
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
