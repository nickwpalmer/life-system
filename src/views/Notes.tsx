import { useEffect, useState } from 'preact/hooks'
import { useStore, toast, areaById, getState } from '../lib/store'
import { insert, update, remove, restore } from '../lib/db'
import type { Note } from '../lib/types'
import { Icon } from '../ui/icons'
import { Sheet, PageHead, Switch } from '../ui/kit'

const isIdea = (n: Partial<Note>) => !!n.tags?.includes('idea')

function Editor({ note, onClose }: { note: Note | 'new' | 'idea' | null; onClose: () => void }) {
  const areas = useStore((s) => s.areas.filter((a) => !a.archived))
  const [f, setF] = useState<Partial<Note>>({})
  useEffect(() => { if (note) setF(note === 'new' || note === 'idea' ? { title: '', body: '', pinned: false, area_id: null, tags: note === 'idea' ? ['idea'] : [] } : { ...note }) }, [note])
  async function save() {
    onClose()
    if (!f.title?.trim() && !f.body?.trim()) return
    const row = { title: f.title?.trim() || (f.body ?? '').split('\n')[0].slice(0, 80), body: f.body || null, pinned: !!f.pinned, area_id: f.area_id ?? null, tags: f.tags ?? [] }
    try { if (note && typeof note === 'object') await update('notes', note.id, row); else await insert('notes', row) } catch { /* shown */ }
  }
  async function del() {
    if (!note || typeof note !== 'object') return
    const row = getState().notes.find((n) => n.id === note.id)
    onClose(); await remove('notes', note.id).catch(() => {})
    if (row) toast('Note deleted', () => restore('notes', row as never))
  }
  return (
    <Sheet open={!!note} onClose={save} wide>
      <input class="input title bare" placeholder="Title" value={f.title ?? ''} onInput={(e) => setF({ ...f, title: (e.target as HTMLInputElement).value })} />
      <textarea class="input tall" style="margin-top:8px" placeholder="Anything you want to find fast: sizes, codes you’re allowed to keep, routines, lists, how-tos…" value={f.body ?? ''} onInput={(e) => setF({ ...f, body: (e.target as HTMLTextAreaElement).value })} />
      <div class="chips" style="margin:14px 0">{areas.map((a) => <button class={`chip ${f.area_id === a.id ? 'on' : ''}`} style={`--c:${a.color}`} onClick={() => setF({ ...f, area_id: f.area_id === a.id ? null : a.id })}><i class="dot" style={`background:${a.color}`} />{a.name}</button>)}</div>
      <div class="row between" style="margin:0 2px 12px"><span>It’s an idea</span><Switch label="Idea" on={isIdea(f)} onChange={(v) => setF({ ...f, tags: v ? [...(f.tags ?? []).filter((t) => t !== 'idea'), 'idea'] : (f.tags ?? []).filter((t) => t !== 'idea') })} /></div>
      <div class="row between" style="margin:0 2px 16px"><span>Pin to top</span><Switch label="Pin" on={!!f.pinned} onChange={(v) => setF({ ...f, pinned: v })} /></div>
      <button class="btn primary block" onClick={save}>Save</button>
      {note && typeof note === 'object' && <button class="btn ghost danger block" style="margin-top:8px" onClick={del}><Icon name="trash" size={18} /> Delete</button>}
    </Sheet>
  )
}

export function Notes() {
  const notes = useStore((s) => s.notes)
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Note | 'new' | 'idea' | null>(null)
  const [kind, setKind] = useState<'all' | 'notes' | 'ideas'>(location.hash.includes('ideas') ? 'ideas' : 'all')
  const ideas = notes.filter(isIdea).length
  const list = [...notes].filter((n) => kind === 'all' || (kind === 'ideas') === isIdea(n))
    .filter((n) => !q || `${n.title} ${n.body ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at))
  return (
    <>
      <PageHead title="Notes" sub="Lists, how-tos, ideas, anything to keep" back="#/more" icon="note" color="var(--peach)" action={<button class="icon-btn" aria-label="New note" onClick={() => setEdit(kind === 'ideas' ? 'idea' : 'new')}><Icon name="plus" /></button>} />
      <input class="input" style="margin-bottom:12px;border-radius:999px" placeholder="Search" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <div class="chips" style="margin-bottom:14px">
        {([['all', 'All'], ['notes', 'Notes'], ['ideas', `Ideas${ideas ? ` · ${ideas}` : ''}`]] as const).map(([k, l]) => <button class={`chip ${kind === k ? 'on' : ''}`} style="--c:var(--peach)" onClick={() => setKind(k)}>{l}</button>)}
      </div>
      {list.length === 0 ? <div class="card"><p class="empty">{q ? 'Nothing matches.' : kind === 'ideas' ? 'Ideas you jot down land here.' : 'Add your first note: class schedule, gym routine, packing list…'}</p></div> : (
        <div class="notes-grid">
          {list.map((n) => { const a = areaById(n.area_id); return (
            <div class="note" style={a ? `--c:${a.color}` : ''} onClick={() => setEdit(n)}>
              <h3>{isIdea(n) && <span style="color:var(--gold)"><Icon name="sparkle" size={13} /> </span>}{n.pinned && <span style="color:var(--orange)"><Icon name="pin" size={13} /> </span>}{n.title}</h3>
              {n.body && <p>{n.body}</p>}
            </div>
          ) })}
        </div>
      )}
      <Editor note={edit} onClose={() => setEdit(null)} />
    </>
  )
}
