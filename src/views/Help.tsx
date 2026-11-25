import { useEffect, useState } from 'preact/hooks'
import { Icon } from '../ui/icons'
import { PageHead } from '../ui/kit'

/** Only the questions that come up again and again. One-time setup lives with Claude, not here. */
const QA: [string, string, string?][] = [
  ['How do I log how I’m feeling?', 'Tap + and then Feeling. Rate any of mood, energy, stress and focus from 1 to 10, as often as you like. Each one is saved with its time, so the app can line it up against sleep, substances, class and work. “Earlier today” lists what you’ve logged, with an × to take one back.'],
  ['How do I add tasks fast?', 'Type it the way you’d say it. “calc hw fri 5pm !!” sets Friday at 5 PM, high priority. “#education” files it in an area, and any other #word puts it on a list, like “#shopping”. “gym every mon”, “daily”, “weekdays”, “weekly”, “monthly” and “yearly” make it repeat. The line under the box shows what it understood.'],
  ['How do repeating tasks work?', 'Check one off and it comes back open on its next day, with a fresh checklist. The finished one stays in Done. Open a task and pick Repeat to change or stop it.'],
  ['What are Lists and steps?', 'Lists are #words, like #shopping. They have their own tab in Tasks. For a bigger task, open it and use “+ Add a step”: each step is its own task you can check off.'],
  ['I did a check-in by mistake. How do I undo it?', 'Open the check-in from Home and tap Clear at the top. It removes the check-in and the journal entry it wrote.'],
  ['The ring stopped syncing', 'First open the Ultrahuman app on your phone: the ring only uploads when its app syncs. Then pull down to sync. If the sync panel says the ring needs reconnecting, the Ultrahuman token has expired or changed. Make a new one at vision.ultrahuman.com (Developer › Personal API Tokens), then put it in two places under the name ULTRAHUMAN_TOKEN: GitHub (life-system-backups › Settings › Secrets and variables › Actions) and Supabase (life-system › Edge Functions › Secrets). Or just tell Claude it changed.', 'ring'],
  ['Does the app update itself?', 'Yes. When Claude ships a new version, the app picks it up the next time you open it, or when you come back after 5 minutes away, and reloads itself. You never need to remove it from your Home Screen. Your data lives in your database, not in the app, so an old copy left open can’t mix anything up. The version you’re on is in Settings › Connections › This app.'],
  ['How do reminders work?', 'Claude reads your tasks and brings up what’s due when it checks in with you. For an exact time, tell Claude in the chat, like “remind me at 3 to call the broker”.'],
  ['I changed the icon. Why is the old one on my Home Screen?', 'iPhone saves the icon when you add the app. Press and hold Life, remove it from the Home Screen (nothing is lost), then add it again from Safari with Share › Add to Home Screen.'],
  ['What is “Claude’s changes”?', 'Every time Claude adds or edits something in your data, it’s logged with what it looked like before. Settings › Connections › Claude opens it. Each change has Undo, and you can leave Claude a note there.'],
  ['Keyboard shortcuts on the Mac', 'N opens capture from anywhere. 1 to 7 jump to Home, Tasks, Calendar, Education, Daily log, Journal and Finances. Esc closes a sheet.'],
]

export function Help({ section }: { section?: string }) {
  const [open, setOpen] = useState<number | null>(() => { const i = QA.findIndex((q) => q[2] && q[2] === section); return i >= 0 ? i : null })
  useEffect(() => { if (open != null) setTimeout(() => document.getElementById(`faq${open}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250) }, [])
  return (
    <>
      <PageHead title="Help" sub="The things that come up" back="#/more" icon="help" color="var(--sky)" />
      <section class="card">
        {QA.map(([q, a], i) => (
          <div class="faq" id={`faq${i}`}>
            <button class="row between" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}><span>{q}</span><span class={`g-chev ${open === i ? 'on' : ''}`}><Icon name="chev" size={16} /></span></button>
            {open === i && <p class="muted small">{a}</p>}
          </div>
        ))}
      </section>
      <p class="faint small" style="text-align:center">Anything else, just ask Claude.</p>
    </>
  )
}
