import { useEffect, useState } from 'preact/hooks'
import { useStore, toast } from '../lib/store'
import { listNotes, saveNote, deleteNote } from '../lib/db'
import type { Note } from '../lib/types'
import { Icon } from '../ui/icons'
import { Sheet, Spinner, BackHeader, Switch } from '../ui/kit'

/** Quick reference: things you look up often (codes, routines, sizes, how-tos). */
export function Notes() {
  const version = useStore((s) => s.dataVersion)
  const areas = useStore((s) => s.areas.filter((a) => !a.archived))
  const [items, setItems] = useState<Note[] | null>(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [f, setF] = useState<Partial<Note>>({})
  useEffect(() => { listNotes().then(setItems).catch(() => setItems([])) }, [version])

  const edit = (n: Note | null) => { setF(n ? { ...n } : { title: '', body: '', pinned: false }); setOpen(true) }
  async function save() {
    if (!f.title?.trim()) { setOpen(false); return }
    try { await saveNote({ ...f, title: f.title.trim() } as Note); setOpen(false) } catch (e) { toast((e as Error).message) }
  }
  const shown = (items ?? []).filter((n) => !q || `${n.title} ${n.body ?? ''}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      <BackHeader title="Reference" action={<button class="icon-btn" aria-label="New note" onClick={() => edit(null)}><Icon name="plus" /></button>} />
      <input class="input" style="margin-bottom:14px;border-radius:999px" placeholder="Search" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      {items == null ? <Spinner /> : shown.length === 0 ? <p class="empty">Keep things you look up often here: routines, numbers, how-tos.</p> : (
        <div class="notes-grid">
          {shown.map((n) => (
            <div class="note" onClick={() => edit(n)}>
              <h3 class="row" style="gap:6px">{n.pinned && <span style="color:var(--peach)"><Icon name="pin" size={14} /></span>}{n.title}</h3>
              {n.body && <p>{n.body}</p>}
            </div>
          ))}
        </div>
      )}
      <Sheet open={open} onClose={save}>
        <input class="input" style="font-size:20px;font-weight:650;background:transparent;border:0;padding:4px 2px;margin-bottom:8px" placeholder="Title" value={f.title ?? ''} onInput={(e) => setF({ ...f, title: (e.target as HTMLInputElement).value })} />
        <textarea class="input tall" placeholder="Details" value={f.body ?? ''} onInput={(e) => setF({ ...f, body: (e.target as HTMLTextAreaElement).value })} />
        <div class="row between" style="margin:14px 2px"><span>Pin to top</span><Switch label="Pin" on={!!f.pinned} onChange={(v) => setF({ ...f, pinned: v })} /></div>
        <div class="chips" style="margin-bottom:16px">
          {areas.map((a) => <button class={`chip ${f.area_id === a.id ? 'on' : ''}`} onClick={() => setF({ ...f, area_id: f.area_id === a.id ? null : a.id })}><i class="dot" style={`background:${a.color}`} />{a.name}</button>)}
        </div>
        <button class="btn primary block" onClick={save}>Save</button>
        {f.id && <button class="btn ghost danger block" style="margin-top:8px" onClick={async () => { if (confirm('Delete this note?')) { await deleteNote(f.id!); setOpen(false) } }}><Icon name="trash" size={18} /> Delete</button>}
      </Sheet>
    </>
  )
}
