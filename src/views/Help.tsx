import { useState } from 'preact/hooks'
import { Icon } from '../ui/icons'
import { PageHead } from '../ui/kit'

const QA: [string, string][] = [
  ['How do I put Life on my iPhone Home Screen?', 'Open the app in Safari, tap Share, then Add to Home Screen. It opens full screen like any other app.'],
  ['I changed the logo. Why is the old one still on my Home Screen?', 'iPhone saves the icon when you add the app. After you pick a new logo in Settings, press and hold the Life icon, remove it from the Home Screen (not delete data, nothing is lost), then add it again from Safari.'],
  ['How do I use it on my Mac?', 'Open the app in Safari, then choose File, Add to Dock. Your iPhone passkey syncs through iCloud Keychain, so the Mac signs in with Touch ID or your iPhone. If it doesn’t show up, sign in with your password once and tap “Add Face ID on this device” in Settings.'],
  ['Keyboard shortcuts on the Mac', 'N opens quick capture from anywhere. 1 to 7 jump to Home, Tasks, Calendar, Education, Daily log, Journal and Finances. Esc closes a sheet.'],
  ['What is “Claude’s changes”?', 'Every time Claude adds or edits something in your data, it’s written to a log with what it looked like before. Open Everything, then Claude’s changes, to see it and undo any of it. Your own edits in the app aren’t logged there.'],
  ['What’s the difference between a goal and a project?', 'A goal is an outcome you want, like “Finish the semester with a 3.5”. A project is a set of tasks with a finish line that moves you toward it, like “Study plan for MATH 101 final”. Link tasks to a goal and its progress fills in as you finish them.'],
  ['When does Home switch between morning, day and night?', 'By default morning runs 4:30 to 9 AM, the quick log 9 AM to 8 PM, and night 8 PM to 4:30 AM. Change the times in Settings.'],
  ['Where does my data live?', 'In your own private database. Only you can read it when signed in, and Claude reads it with your permission to keep things up to date. The app’s code is public, but none of your data is in it.'],
  ['How does Apple Health get in?', 'A Shortcut on your iPhone sends last night’s sleep and yesterday’s steps each morning. Settings has the steps to set it up..'],
]

export function Help() {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <>
      <PageHead title="Help" sub="How things work" back="#/more" icon="help" color="var(--sky)" />
      <section class="card">
        {QA.map(([q, a], i) => (
          <div class="faq">
            <button class="row between" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}><span>{q}</span><span class={`g-chev ${open === i ? 'on' : ''}`}><Icon name="chev" size={16} /></span></button>
            {open === i && <p class="muted small">{a}</p>}
          </div>
        ))}
      </section>
      <p class="faint small" style="text-align:center">Anything else, just ask Claude.</p>
    </>
  )
}
