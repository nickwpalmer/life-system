import { useEffect, useState } from 'preact/hooks'
import { useStore, toast } from '../lib/store'
import { saveProfile } from '../lib/db'
import { Icon } from '../ui/icons'
import { Sheet } from '../ui/kit'

/** Where everything points: who you're becoming, what you value, what a good year looks like. */
export type Compass = { mission?: string; values?: string; ideal?: string; now?: string }

export const useCompass = () => useStore((s) => (s.profile?.settings?.compass ?? {}) as Compass)

const FIELDS: [keyof Compass, string, string][] = [
  ['mission', 'Who you’re becoming', 'One line. e.g. A biomedical engineer who builds things that help people, and stays kind and steady doing it.'],
  ['values', 'What you value most', 'Three to five words. e.g. Curiosity, health, loyalty, craft'],
  ['ideal', 'A year from now, life is good if…', 'Concrete. e.g. Strong GPA, a lab or internship spot, sleeping 7+ hours, money saved, close with Liz and family'],
  ['now', 'What’s in the way right now', 'Honest and short. e.g. I put off problem sets until the night before'],
]

function CompassSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useCompass()
  const [f, setF] = useState<Compass>(c)
  useEffect(() => { if (open) setF(c) }, [open])
  const save = async () => {
    try { await saveProfile({ settings: { compass: f } }); toast('Compass saved'); onClose() } catch (e) { toast(`Couldn’t save: ${(e as Error).message}`) }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Your compass">
      <p class="muted small" style="margin-bottom:12px">The short answer to “what is all this for?” Goals, the weekly review and I all point back here. Rewrite it whenever it stops feeling true.</p>
      {FIELDS.map(([k, label, ph]) => (
        <label class="field"><span>{label}</span><textarea class="input" style="min-height:58px" placeholder={ph} value={f[k] ?? ''} onInput={(e) => setF({ ...f, [k]: (e.target as HTMLTextAreaElement).value })} /></label>
      ))}
      <button class="btn primary block" onClick={save}>Save</button>
    </Sheet>
  )
}

export function CompassCard({ compact }: { compact?: boolean }) {
  const c = useCompass()
  const [open, setOpen] = useState(false)
  const empty = !c.mission && !c.values && !c.ideal && !c.now
  return (
    <>
      <section class="card compass" style="--accent:var(--teal)">
        <div class="card-h"><div class="row"><span class="h-ico"><Icon name="compass" size={15} /></span><h2>Compass</h2></div><button class="link" onClick={() => setOpen(true)}>{empty ? 'Set it' : 'Edit'}</button></div>
        {empty ? (
          <button class="compass-empty" onClick={() => setOpen(true)}>
            <b>Four short answers that everything else points to.</b>
            <span class="muted small">Who you’re becoming, what you value, what a good year looks like, and what’s in the way. About three minutes.</span>
          </button>
        ) : (
          <div class="compass-body">
            {c.mission && <p class="c-mission">{c.mission}</p>}
            {c.values && <div class="chips" style="margin-top:8px">{c.values.split(/[,·\n]/).map((v) => v.trim()).filter(Boolean).map((v) => <span class="chip on" style="--c:var(--teal)">{v}</span>)}</div>}
            {!compact && c.ideal && <div class="c-line"><span class="faint tiny">A good year</span><span class="small">{c.ideal}</span></div>}
            {!compact && c.now && <div class="c-line"><span class="faint tiny">In the way</span><span class="small">{c.now}</span></div>}
          </div>
        )}
      </section>
      <CompassSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}
