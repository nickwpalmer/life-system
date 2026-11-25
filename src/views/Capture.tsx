import { useEffect, useRef, useState } from 'preact/hooks'
import { allTags, useStore, setState, toast, getState } from '../lib/store'
import { addTask, insert } from '../lib/db'
import { parseQuick } from '../lib/parse'
import { fmtDay, fmtClock } from '../lib/dates'
import { Sheet, haptic } from '../ui/kit'
import { Icon } from '../ui/icons'

type Mode = 'task' | 'journal' | 'note'

/**
 * One place to get anything out of your head (GTD "capture").
 * Plain text lands in the Inbox to sort later. Add a date or #area and it's filed straight away.
 */
export function Capture() {
  const open = useStore((s) => s.capture)
  const areas = useStore((s) => s.areas)
  const [text, setText] = useState('')
  const [mode, setMode] = useState<Mode>('task')
  const [idea, setIdea] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (open) { setText(''); setIdea(false); const m = typeof open === 'string' && open !== 'mood' ? open : 'task'; setMode(m); if (matchMedia('(pointer: fine)').matches) setTimeout(() => ref.current?.focus(), 60) } }, [open])
  const close = () => setState({ capture: false })
  const p = parseQuick(text, areas, allTags())
  const filed = !!(p.due_date || p.area_id || p.tag)

  async function save(again = false) {
    const t = text.trim()
    if (!t) return
    haptic()
    try {
      if (mode === 'task') {
        const lines = t.split('\n').map((s) => s.trim()).filter(Boolean)
        for (const line of lines) {
          const q = parseQuick(line, getState().areas, allTags())
          await addTask({ title: q.title || line, due_date: q.due_date, due_time: q.due_time, priority: q.priority, area_id: q.area_id, recurrence: q.recurrence, tags: q.tag ? [q.tag] : [], status: q.due_date || q.area_id || q.tag ? 'open' : 'inbox' })
        }
        toast(lines.length > 1 ? `${lines.length} tasks captured` : filed ? `Added${p.due_date ? ` for ${/^(Today|Tomorrow)$/.test(fmtDay(p.due_date)) ? fmtDay(p.due_date).toLowerCase() : fmtDay(p.due_date)}` : ''}` : 'In your inbox')
      } else if (mode === 'journal') {
        await insert('journal_entries', { body: t, title: null, mood: null, area_id: null, tags: [], photos: [], author: 'nick', occurred_at: new Date().toISOString() })
        toast('Saved to journal')
      } else {
        const [first, ...rest] = t.split('\n')
        await insert('notes', { title: first.slice(0, 120), body: rest.join('\n').trim() || null, pinned: false, tags: idea ? ['idea'] : [], area_id: null })
        toast(idea ? 'Saved to your ideas' : 'Saved to notes')
      }
      setText('')
      if (!again) close()
      else ref.current?.focus()
    } catch { /* toast already shown */ }
  }

  const area = areas.find((a) => a.id === p.area_id)
  return (
    <Sheet open={!!open} onClose={close} title="Capture">
      <div class="chips" style="margin:4px 0 12px">
        {([['task', 'Task', 'tasks', 'var(--violet)'], ['journal', 'Journal', 'book', 'var(--mint)'], ['note', 'Note or idea', 'note', 'var(--peach)']] as const).map(([m, l, ic, c]) => (
          <button class={`chip ${mode === m ? 'on' : ''}`} style={`--c:${c}`} onClick={() => { setMode(m); setTimeout(() => ref.current?.focus(), 30) }}><Icon name={ic} size={16} />{l}</button>
        ))}
        <button class="chip" style="--c:var(--pink)" onClick={() => setState({ capture: false, feel: true })}><Icon name="smile" size={16} />Feeling</button>
        <button class="chip" style="--c:var(--orange)" onClick={() => setState({ capture: false, substance: true })}><Icon name="flask" size={16} />Substance</button>
      </div>
      <>
      <textarea ref={ref} class="input" rows={mode === 'task' ? 2 : 5} style="min-height:0"
        placeholder={mode === 'task' ? 'What’s on your mind?' : mode === 'journal' ? 'Write freely…' : 'Title on the first line, details below'}
        value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (mode === 'task' ? !e.shiftKey : e.metaKey || e.ctrlKey)) { e.preventDefault(); save(e.altKey) } }} />
      <p class="hint">
        {mode !== 'task' ? (mode === 'journal' ? 'Saves with today’s date and time.' : <>Shows up in Notes. <button class="linkish" onClick={() => setIdea(!idea)}>{idea ? '✓ It’s an idea' : 'Mark as an idea'}</button></>)
          : !text.trim() ? 'Goes to your inbox. Add a day or #area to file it, like “dentist friday 3pm #health”.'
            : <>{p.due_date ? <><b>{fmtDay(p.due_date)}</b>{p.due_time ? <> at <b>{fmtClock(p.due_time)}</b></> : null} · </> : null}
              {area ? <><b>{area.name}</b> · </> : null}{p.priority ? <><b>{p.priority === 3 ? 'high' : 'medium'} priority</b> · </> : null}{filed ? 'filed' : 'to inbox'}</>}
      </p>
      <div class="row" style="margin-top:12px">
        <button class="btn primary grow" disabled={!text.trim()} onClick={() => save()}>Save</button>
        <button class="btn" disabled={!text.trim()} onClick={() => save(true)} title="Save and add another">+ Another</button>
      </div></>
    </Sheet>
  )
}
