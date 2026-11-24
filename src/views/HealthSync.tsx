import { useEffect, useState } from 'preact/hooks'
import { supabase, SUPABASE_URL, SUPABASE_KEY } from '../lib/supabase'
import { getState, toast } from '../lib/store'
import { fmtShort } from '../lib/dates'
import { Icon } from '../ui/icons'
import { Sheet } from '../ui/kit'

type KeyRow = { created_at: string; last_used_at: string | null }

const copy = async (text: string, what: string) => {
  try { await navigator.clipboard.writeText(text); toast(`Copied ${what}`) } catch { toast('Couldn’t copy. Press and hold to select it instead.') }
}

function Copyable({ label, value }: { label: string; value: string }) {
  return (
    <div class="copy-row">
      <div class="faint tiny">{label}</div>
      <div class="row" style="gap:8px"><code class="grow">{value}</code><button class="btn sm" onClick={() => copy(value, label.toLowerCase())}>Copy</button></div>
    </div>
  )
}

function Steps({ fresh }: { fresh: string | null }) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/ingest_health`
  return (
    <>
      <p class="muted small" style="margin-bottom:12px">Your Ultrahuman ring writes to Apple Health. This Shortcut runs each morning and sends last night’s sleep, HRV and resting heart rate, plus yesterday’s full step count, so the Body part of your log is filled before you open the app.</p>
      {fresh ? <Copyable label="Your key (shown once)" value={fresh} /> : <p class="small" style="margin-bottom:10px">Your key was shown when you made it. Lost it? Make a new one below; the old one stops working.</p>}
      <Copyable label="URL" value={url} />
      <Copyable label="apikey header" value={SUPABASE_KEY} />
      <ol class="steps small">
        <li>Open <b>Shortcuts</b>, tap <b>+</b>, name it <b>Send health to Life</b>.</li>
        <li><b>Find Health Samples</b>: Type <b>Sleep Analysis</b>, Start Date in the last <b>1 day</b>, Value is any of the asleep stages. Add <b>Get Details of Health Sample</b> (Duration), <b>Calculate Statistics</b> (Sum), <b>Set Variable</b> <code>sleep</code>. Minutes are fine.</li>
        <li>Same for <b>Heart Rate Variability</b> (last 1 day, Average) into <code>hrv</code>, and <b>Resting Heart Rate</b> (Average) into <code>rhr</code>.</li>
        <li><b>Get Contents of URL</b> with the URL above. Method <b>POST</b>. Headers: <code>apikey</code> = the apikey above, <code>Content-Type</code> = <code>application/json</code>. Request Body <b>JSON</b>: <code>p_key</code> = your key, and <code>p_values</code> as a Dictionary with <code>sleep_hours</code>, <code>hrv</code>, <code>resting_hr</code>.</li>
        <li>For yesterday’s steps: <b>Adjust Date</b> on Current Date, <b>Get Start of Day</b>, into <code>today0</code>. <b>Adjust Date</b> again, subtract <b>1 day</b> from <code>today0</code>, into <code>yday0</code>.</li>
        <li><b>Find Health Samples</b>: Type <b>Steps</b>, Start Date <b>is between</b> <code>yday0</code> and <code>today0</code>. <b>Calculate Statistics</b> (Sum) into <code>steps</code>.</li>
        <li><b>Format Date</b> <code>yday0</code> with custom format <code>yyyy-MM-dd</code>. Then a second <b>Get Contents of URL</b> like step 4, with <code>p_day</code> = that date and <code>p_values</code> holding just <code>steps</code>.</li>
        <li>Run it once. Both calls should answer with <code>"ok": true</code>.</li>
        <li>In <b>Automation</b>, tap <b>+</b>, choose <b>Time of Day</b>, <b>7:30 AM</b> daily (or <b>Alarm, is stopped</b> if you’d rather it follow your alarm), set <b>Run Immediately</b>, and pick this shortcut.</li>
      </ol>
      <p class="faint tiny">Running it again the same day just replaces that day’s numbers. The key can only add health numbers; it can’t read anything.</p>
    </>
  )
}

export function HealthSync() {
  const demo = getState().demo
  const [row, setRow] = useState<KeyRow | null | undefined>(undefined)
  const [fresh, setFresh] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (demo) { setRow(null); return }
    supabase.from('ingest_keys').select('created_at,last_used_at').maybeSingle().then(({ data }) => setRow((data as KeyRow) ?? null))
  }, [])
  const make = async () => {
    if (row && !confirm('Make a new key? The old one stops working, so you’d update the Shortcut too.')) return
    setBusy(true)
    try {
      if (demo) { setFresh('lh_demo_key_not_real'); setOpen(true); return }
      const { data, error } = await supabase.rpc('create_ingest_key')
      if (error) throw error
      setFresh(data as string); setRow({ created_at: new Date().toISOString(), last_used_at: null }); setOpen(true)
    } catch (e) { toast(`Couldn’t make a key: ${(e as Error).message}`) } finally { setBusy(false) }
  }
  return (
    <section class="card" style="--accent:var(--mint)">
      <div class="card-h"><div class="row"><span class="h-ico"><Icon name="heart" size={15} /></span><h2>Apple Health</h2></div>
        {row && <span class="faint small">{row.last_used_at ? `Synced ${fmtShort(row.last_used_at.slice(0, 10))}` : 'Waiting for first sync'}</span>}</div>
      <p class="muted small" style="margin-bottom:12px">Sleep, HRV, resting heart rate and steps from your ring, sent every morning by an iPhone Shortcut. About ten minutes to set up.</p>
      <div class="row wrap">
        {row === null && <button class="btn primary sm" disabled={busy} onClick={make}>Set it up</button>}
        {row && <button class="btn sm" onClick={() => setOpen(true)}>Setup steps</button>}
        {row && <button class="btn ghost sm" disabled={busy} onClick={make}>New key</button>}
      </div>
      <Sheet open={open} onClose={() => { setOpen(false); setFresh(null) }} title="Connect Apple Health"><Steps fresh={fresh} /></Sheet>
    </section>
  )
}
