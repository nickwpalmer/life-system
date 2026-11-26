import { useEffect, useState } from 'preact/hooks'
import { useRows, registerDemo, addRow, patchRow, dropRow } from '../lib/rows'
import { getState, toast } from '../lib/store'
import { today } from '../lib/dates'
import { Icon } from '../ui/icons'
import { Sheet, PageHead, Ring, haptic } from '../ui/kit'

/** Books: what you're reading, where you are in it, and what's next. Covers come from Open Library. */
export type Book = {
  id: string; title: string; author: string | null; status: 'reading' | 'to_read' | 'done' | 'paused'
  pages: number | null; current_page: number | null; cover_url: string | null; started_on: string | null; finished_on: string | null; notes: string | null; sort: number
}
const STATUS: [Book['status'], string][] = [['reading', 'Reading'], ['to_read', 'Up next'], ['paused', 'Paused'], ['done', 'Finished']]

registerDemo('books', () => [
  { id: 'b1', title: 'Frankenstein', author: 'Mary Shelley', status: 'reading', pages: 280, current_page: 112, cover_url: null, started_on: null, finished_on: null, notes: null, sort: 1 },
  { id: 'b2', title: 'Walden', author: 'Henry David Thoreau', status: 'reading', pages: 352, current_page: 40, cover_url: null, started_on: null, finished_on: null, notes: null, sort: 2 },
  { id: 'b3', title: 'The Odyssey', author: 'Homer', status: 'to_read', pages: null, current_page: null, cover_url: null, started_on: null, finished_on: null, notes: null, sort: 3 },
  { id: 'b4', title: 'Pride and Prejudice', author: 'Jane Austen', status: 'to_read', pages: null, current_page: null, cover_url: null, started_on: null, finished_on: null, notes: null, sort: 4 },
] as never)

const pct = (b: Book) => b.status === 'done' ? 1 : b.pages && b.current_page ? Math.min(1, b.current_page / b.pages) : 0
const tried = new Set<string>()

/** Find a cover (and page count) on Open Library once, then keep it on the book. */
async function findCover(b: Book) {
  if (b.cover_url || tried.has(b.id) || getState().demo) return
  tried.add(b.id)
  try {
    const q = new URLSearchParams({ title: b.title, limit: '1', fields: 'cover_i,number_of_pages_median' })
    if (b.author) q.set('author', b.author)
    const r = await fetch(`https://openlibrary.org/search.json?${q}`)
    const d = (await r.json())?.docs?.[0]
    const patch: Record<string, unknown> = {}
    if (d?.cover_i) patch.cover_url = `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`
    if (!b.pages && d?.number_of_pages_median) patch.pages = d.number_of_pages_median
    if (Object.keys(patch).length) await patchRow('books', b.id, patch)
  } catch { /* no cover is fine */ }
}

function Cover({ b, size = 'md' }: { b: Book; size?: 'md' | 'lg' }) {
  const [bad, setBad] = useState(false)
  useEffect(() => { findCover(b) }, [b.id])
  const hue = [...b.title].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return (
    <span class={`cover ${size}`} style={`--h:${hue}`}>
      {b.cover_url && !bad ? <img src={b.cover_url} alt="" loading="lazy" onError={() => setBad(true)} /> : <span class="cover-t">{b.title}</span>}
    </span>
  )
}

function BookSheet({ book, onClose }: { book: Book | Partial<Book> | null; onClose: () => void }) {
  const [f, setF] = useState<Partial<Book>>({})
  useEffect(() => { if (book) setF({ ...book }) }, [book])
  const isNew = !!book && !('id' in book && book.id)
  const set = (k: keyof Book, v: unknown) => setF({ ...f, [k]: v })
  const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v))))
  async function save() {
    const title = f.title?.trim()
    if (!title) { onClose(); return }
    const status = f.status ?? 'to_read'
    const row = {
      title, author: f.author?.trim() || null, status, pages: f.pages ?? null, current_page: status === 'done' ? (f.pages ?? f.current_page ?? null) : f.current_page ?? null, notes: f.notes?.trim() || null,
      started_on: f.started_on ?? (status === 'reading' ? today() : null), finished_on: status === 'done' ? (f.finished_on ?? today()) : null,
    }
    onClose()
    try {
      if (isNew) await addRow('books', { ...row, cover_url: null, sort: Date.now() % 1e6 })
      else await patchRow('books', (book as Book).id, row)
      if (status === 'done' && (book as Book)?.status !== 'done') toast(`Finished ${title}. Nice.`)
    } catch { /* shown */ }
  }
  async function del() { const b = book as Book; onClose(); await dropRow('books', b.id).catch(() => {}); toast('Book removed') }
  const nudge = (d: number) => { haptic(); set('current_page', Math.max(0, Math.min(f.pages ?? 1e5, (f.current_page ?? 0) + d))) }
  return (
    <Sheet open={!!book} onClose={save} title={isNew ? 'Add a book' : undefined}>
      {!isNew && f.title && <div class="row" style="gap:14px;margin-bottom:14px"><Cover b={f as Book} size="lg" /><span class="grow"><h2 style="margin:0">{f.title}</h2><p class="muted small">{f.author}</p></span></div>}
      {isNew && <>
        <label class="field"><span>Title</span><input class="input" autoFocus value={f.title ?? ''} onInput={(e) => set('title', (e.target as HTMLInputElement).value)} /></label>
        <label class="field"><span>Author</span><input class="input" value={f.author ?? ''} onInput={(e) => set('author', (e.target as HTMLInputElement).value)} /></label>
      </>}
      <div class="field"><span>Status</span><div class="chips">{STATUS.map(([k, l]) => <button class={`chip ${(f.status ?? 'to_read') === k ? 'on' : ''}`} style="--c:var(--sky)" onClick={() => set('status', k)}>{l}</button>)}</div></div>
      {(f.status === 'reading' || f.status === 'paused') && <div class="field"><span>Page you’re on</span>
        <div class="row" style="gap:8px">
          <button class="btn sm" onClick={() => nudge(-10)}>−10</button>
          <input class="input grow" inputMode="numeric" style="text-align:center;font-size:20px;font-weight:650" value={f.current_page ?? ''} onInput={(e) => set('current_page', num((e.target as HTMLInputElement).value))} />
          <button class="btn sm" onClick={() => nudge(10)}>+10</button>
          <button class="btn sm" onClick={() => nudge(25)}>+25</button>
        </div></div>}
      <label class="field"><span>Total pages</span><input class="input" inputMode="numeric" placeholder="Filled in from Open Library when it can" value={f.pages ?? ''} onInput={(e) => set('pages', num((e.target as HTMLInputElement).value))} /></label>
      <label class="field"><span>Notes</span><textarea class="input" rows={2} value={f.notes ?? ''} onInput={(e) => set('notes', (e.target as HTMLTextAreaElement).value)} /></label>
      <button class="btn primary block" onClick={save}>Save</button>
      {!isNew && <button class="btn ghost danger block" style="margin-top:8px" onClick={del}><Icon name="trash" size={18} /> Remove</button>}
    </Sheet>
  )
}

export function Reading() {
  const books = useRows<Book>('books')
  const [edit, setEdit] = useState<Book | Partial<Book> | null>(null)
  const by = (s: Book['status']) => (books ?? []).filter((b) => b.status === s)
  const reading = by('reading')
  return (
    <>
      <PageHead title="Reading" sub={reading.length ? `${reading.length} going` : 'What you’re reading'} back="#/more" icon="books" color="var(--sky)"
        action={<button class="btn primary sm" onClick={() => setEdit({ status: 'to_read' })}><Icon name="plus" size={16} />Add</button>} />
      {books === null ? <div class="skeleton" /> : <>
        {reading.length > 0 && <div class="book-now">{reading.map((b) => (
          <button class="book-card" onClick={() => setEdit(b)}>
            <Cover b={b} size="lg" />
            <span class="grow" style="min-width:0">
              <b class="ellipsis2">{b.title}</b>
              <span class="faint small ellipsis">{b.author}</span>
              <span class="row" style="gap:10px;margin-top:10px">
                <Ring value={pct(b)} size={46} stroke={5}><span class="tiny">{Math.round(pct(b) * 100)}%</span></Ring>
                <span class="small muted">{b.current_page ? `Page ${b.current_page}${b.pages ? ` of ${b.pages}` : ''}` : 'Tap to set your page'}</span>
              </span>
            </span>
          </button>
        ))}</div>}
        {STATUS.filter(([k]) => k !== 'reading').map(([k, l]) => by(k).length > 0 && (
          <section class="card">
            <div class="card-h"><h2>{l}</h2><span class="faint small">{by(k).length}</span></div>
            <div class="shelf">{by(k).map((b) => (
              <button class="shelf-b" onClick={() => setEdit(b)}><Cover b={b} /><span class="tiny ellipsis2">{b.title}</span></button>
            ))}</div>
          </section>
        ))}
        {!books.length && <div class="card soft"><p class="muted">Add what you’re reading and what’s next. Covers show up on their own.</p></div>}
      </>}
      <BookSheet book={edit} onClose={() => setEdit(null)} />
    </>
  )
}
