import { useEffect, useRef, useState } from 'preact/hooks'
import { useStore, toast, areaById, getState } from '../lib/store'
import { insert, update, remove, restore } from '../lib/db'
import type { Note } from '../lib/types'
import { Icon } from '../ui/icons'
import { Sheet, PageHead, Switch, haptic } from '../ui/kit'
import { parseCited, joinCited, splitCites, describe, type Src } from '../lib/cite'

const isIdea = (n: Partial<Note>) => !!n.tags?.includes('idea')
const isKnow = (n: Partial<Note>) => !!n.tags?.includes('knowledge')
const KIND_ICON: Record<Src['kind'], string> = { web: 'link', email: 'inbox', record: 'layers', person: 'users', note: 'note', said: 'edit', other: 'book' }
const KIND_NAME: Record<Src['kind'], string> = { web: 'Web page', email: 'Email', record: 'Documents', person: 'Person', note: 'Note', said: 'Said', other: 'Source' }

function srcHref(s: Src): string | undefined {
  if (s.url) return s.url
  if (s.kind === 'record') return '#/records'
  if (s.kind === 'person') return '#/people'
  return undefined
}

function SourceRow({ s }: { s: Src }) {
  const href = srcHref(s)
  const inner = <>
    <span class="src-n">{s.n}</span>
    <span class="src-ico"><Icon name={KIND_ICON[s.kind]} size={15} /></span>
    <span class="src-t"><b>{s.label}</b>{s.extra && <small> {s.extra}</small>}<small class="src-k">{KIND_NAME[s.kind]}</small></span>
  </>
  return href ? <a class="src" href={href} target={s.url ? '_blank' : undefined} rel="noopener">{inner}</a> : <div class="src">{inner}</div>
}

/** Draws a note body: bullets, short headings, and [n] as tappable pills. */
function CitedBody({ text, sources }: { text: string; sources: Src[] }) {
  const [open, setOpen] = useState<{ line: number; n: number } | null>(null)
  const byN = new Map(sources.map((s) => [s.n, s]))
  const lines = text.split('\n')
  return (
    <div class="cited">
      {lines.map((raw, i) => {
        if (!raw.trim()) return <div class="cited-gap" />
        const bullet = /^\s*[-•]\s+/.test(raw)
        const line = raw.replace(/^\s*[-•]\s+/, '')
        const nextLine = lines[i + 1] ?? ''
        const head = !bullet && line.length < 70 && !/\[\d+\]/.test(line) && /^\s*[-•]\s+/.test(nextLine)
        const pop = open?.line === i ? byN.get(open.n) : undefined
        return (
          <div class={bullet ? 'cited-li' : head ? 'cited-h' : 'cited-p'}>
            {splitCites(line).map((p) => typeof p === 'string' ? p : (
              <button class={`cite ${open?.line === i && open.n === p ? 'on' : ''}`} aria-label={`Source ${p}`}
                onClick={(e) => { e.stopPropagation(); setOpen(open?.line === i && open.n === p ? null : { line: i, n: p }) }}>{p}</button>
            ))}
            {pop && <div class="cite-pop"><SourceRow s={pop} /></div>}
          </div>
        )
      })}
    </div>
  )
}

function Reader({ note, onClose, onEdit }: { note: Note | null; onClose: () => void; onEdit: (n: Note) => void }) {
  const c = parseCited(note?.body)
  const a = note ? areaById(note.area_id) : null
  return (
    <Sheet open={!!note} onClose={onClose} wide>
      {note && <>
        <div class="reader-h">
          <div style="min-width:0">
            <h2>{note.title.replace(/^Knowledge:\s*/i, '')}</h2>
            <p class="muted small">{isKnow(note) ? 'Knowledge' : isIdea(note) ? 'Idea' : 'Note'}{a ? ` · ${a.name}` : ''}{c.sources.length ? ` · ${c.sources.length} source${c.sources.length > 1 ? 's' : ''}` : ''} · updated {new Date(note.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
          </div>
          <button class="icon-btn" aria-label="Edit" onClick={() => onEdit(note)}><Icon name="edit" size={18} /></button>
        </div>
        <CitedBody text={c.text} sources={c.sources} />
        {c.sources.length > 0 && <>
          <h3 class="src-head">Sources</h3>
          <div class="src-list">{c.sources.map((s) => <SourceRow s={s} />)}</div>
        </>}
        {isKnow(note) && !c.sources.length && <p class="hint">No sources yet. Tap edit to add them.</p>}
      </>}
    </Sheet>
  )
}

type SrcDraft = { n: number; text: string }
type EditTarget = Note | 'new' | 'idea' | 'knowledge' | null

function Editor({ note, onClose }: { note: EditTarget; onClose: () => void }) {
  const areas = useStore((s) => s.areas.filter((a) => !a.archived))
  const [f, setF] = useState<Partial<Note>>({})
  const [text, setText] = useState('')
  const [srcs, setSrcs] = useState<SrcDraft[]>([])
  const [adding, setAdding] = useState('')
  const ta = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!note) return
    if (typeof note === 'object') {
      setF({ ...note })
      const c = parseCited(note.body)
      setText(c.text); setSrcs(c.sources.map((s) => ({ n: s.n, text: s.text })))
    } else {
      setF({ title: '', body: '', pinned: false, area_id: null, tags: note === 'new' ? [] : [note] })
      setText(''); setSrcs([])
    }
    setAdding('')
  }, [note])
  const nextN = () => srcs.reduce((m, s) => Math.max(m, s.n), 0) + 1
  function cite(n: number) {
    const el = ta.current
    const pos = el ? el.selectionEnd : text.length
    const before = text.slice(0, pos).replace(/[ \t]+$/, '')
    setText(`${before} [${n}]${text.slice(pos)}`); haptic()
    requestAnimationFrame(() => { if (el) { const p = before.length + String(n).length + 3; el.focus(); el.setSelectionRange(p, p) } })
  }
  function addSource(andCite: boolean) {
    const t = adding.trim()
    if (!t) return
    const n = nextN()
    setSrcs([...srcs, { n, text: t }]); setAdding('')
    if (andCite) cite(n)
  }
  function toggle(tag: string, v: boolean) { setF({ ...f, tags: v ? [...(f.tags ?? []).filter((t) => t !== tag), tag] : (f.tags ?? []).filter((t) => t !== tag) }) }
  async function save() {
    onClose()
    const body = joinCited(text, srcs)
    if (!f.title?.trim() && !body.trim()) return
    const row = { title: f.title?.trim() || body.split('\n')[0].slice(0, 80), body: body || null, pinned: !!f.pinned, area_id: f.area_id ?? null, tags: f.tags ?? [] }
    if (note && typeof note === 'object' && row.body === note.body && row.title === note.title && row.pinned === note.pinned && row.area_id === note.area_id && JSON.stringify(row.tags) === JSON.stringify(note.tags)) return
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
      <textarea ref={ta} class="input tall" style="margin-top:8px" placeholder={isKnow(f) ? 'One fact per line, like “- WSU needs two students to start a club.” Then cite it below.' : 'Anything you want to find fast: sizes, routines, lists, how-tos…'} value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      <div class="src-edit">
        <div class="row between" style="margin-bottom:6px"><b class="small">Sources</b><span class="muted small">Tap a number to cite it</span></div>
        {srcs.map((s, i) => { const d = describe(s.n, s.text); return (
          <div class="src-erow">
            <button class="cite big" aria-label={`Cite source ${s.n}`} onClick={() => cite(s.n)}>{s.n}</button>
            <span class="src-ico"><Icon name={KIND_ICON[d.kind]} size={15} /></span>
            <input class="input" value={s.text} onInput={(e) => { const v = [...srcs]; v[i] = { ...s, text: (e.target as HTMLInputElement).value }; setSrcs(v) }} />
          </div>
        ) })}
        <div class="src-erow">
          <span class="cite big ghost">{nextN()}</span>
          <span class="src-ico"><Icon name="plus" size={15} /></span>
          <input class="input" placeholder="A link, “Email from Sam, Nov 12”, “Record: Car insurance”…" value={adding}
            onInput={(e) => setAdding((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSource(true) } }} />
        </div>
        {adding.trim() && <div class="row" style="gap:8px;margin-top:8px"><button class="btn small" onClick={() => addSource(true)}>Add and cite</button><button class="btn ghost small" onClick={() => addSource(false)}>Just add</button></div>}
      </div>
      <div class="chips" style="margin:14px 0">{areas.map((a) => <button class={`chip ${f.area_id === a.id ? 'on' : ''}`} style={`--c:${a.color}`} onClick={() => setF({ ...f, area_id: f.area_id === a.id ? null : a.id })}><i class="dot" style={`background:${a.color}`} />{a.name}</button>)}</div>
      <div class="row between" style="margin:0 2px 12px"><span>Knowledge (facts with sources)</span><Switch label="Knowledge" on={isKnow(f)} onChange={(v) => toggle('knowledge', v)} /></div>
      <div class="row between" style="margin:0 2px 12px"><span>It’s an idea</span><Switch label="Idea" on={isIdea(f)} onChange={(v) => toggle('idea', v)} /></div>
      <div class="row between" style="margin:0 2px 16px"><span>Pin to top</span><Switch label="Pin" on={!!f.pinned} onChange={(v) => setF({ ...f, pinned: v })} /></div>
      <button class="btn primary block" onClick={save}>Save</button>
      {note && typeof note === 'object' && <button class="btn ghost danger block" style="margin-top:8px" onClick={del}><Icon name="trash" size={18} /> Delete</button>}
    </Sheet>
  )
}

type Kind = 'all' | 'notes' | 'knowledge' | 'ideas'

export function Notes() {
  const notes = useStore((s) => s.notes)
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<EditTarget>(null)
  const [readId, setReadId] = useState<string | null>(null)
  const h = location.hash
  const [kind, setKind] = useState<Kind>(h.includes('ideas') ? 'ideas' : h.includes('knowledge') ? 'knowledge' : 'all')
  const count = (fn: (n: Note) => boolean) => notes.filter(fn).length
  const match = (n: Note) => kind === 'all' || (kind === 'ideas' ? isIdea(n) : kind === 'knowledge' ? isKnow(n) : !isIdea(n) && !isKnow(n))
  const list = [...notes].filter(match)
    .filter((n) => !q || `${n.title} ${n.body ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at))
  const reading = readId ? notes.find((n) => n.id === readId) ?? null : null
  const chips: [Kind, string][] = [['all', 'All'], ['notes', 'Notes'], ['knowledge', `Knowledge${count(isKnow) ? ` · ${count(isKnow)}` : ''}`], ['ideas', `Ideas${count(isIdea) ? ` · ${count(isIdea)}` : ''}`]]
  return (
    <>
      <PageHead title="Notes" sub="Lists, how-tos, cited facts, ideas" back="#/more" icon="note" color="var(--peach)" action={<button class="icon-btn" aria-label="New note" onClick={() => setEdit(kind === 'ideas' ? 'idea' : kind === 'knowledge' ? 'knowledge' : 'new')}><Icon name="plus" /></button>} />
      <input class="input" style="margin-bottom:12px;border-radius:999px" placeholder="Search notes and sources" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <div class="chip-scroll" style="margin-bottom:14px">
        {chips.map(([k, l]) => <button class={`chip ${kind === k ? 'on' : ''}`} style="--c:var(--peach)" onClick={() => setKind(k)}>{l}</button>)}
      </div>
      {list.length === 0 ? <div class="card"><p class="empty">{q ? 'Nothing matches.' : kind === 'ideas' ? 'Ideas you jot down land here.' : kind === 'knowledge' ? 'Facts you want to keep, each with where it came from.' : 'Add your first note: class schedule, gym routine, packing list…'}</p></div> : (
        <div class="notes-grid">
          {list.map((n) => { const a = areaById(n.area_id); const c = parseCited(n.body); return (
            <div class="note" style={a ? `--c:${a.color}` : ''} onClick={() => setReadId(n.id)}>
              <h3>{isIdea(n) && <span style="color:var(--gold)"><Icon name="sparkle" size={13} /> </span>}{n.pinned && <span style="color:var(--orange)"><Icon name="pin" size={13} /> </span>}{isKnow(n) ? n.title.replace(/^Knowledge:\s*/i, '') : n.title}</h3>
              {c.text && <p>{c.text.replace(/\s*\[\d+\]/g, '')}</p>}
              {c.sources.length > 0 && <span class="src-badge"><Icon name="link" size={12} /> {c.sources.length} source{c.sources.length > 1 ? 's' : ''}</span>}
            </div>
          ) })}
        </div>
      )}
      <Reader note={reading} onClose={() => setReadId(null)} onEdit={(n) => { setReadId(null); setEdit(n) }} />
      <Editor note={edit} onClose={() => setEdit(null)} />
    </>
  )
}
