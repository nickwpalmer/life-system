import { useEffect, useState } from 'preact/hooks'
import { Icon } from '../ui/icons'
import { PageHead } from '../ui/kit'
import { HealthSync } from './HealthSync'

const QA: [string, string][] = [
  ['How do I put Life on my iPhone Home Screen?', 'Open the app in Safari, tap Share, then Add to Home Screen. It opens full screen like any other app.'],
  ['I changed the logo. Why is the old one still on my Home Screen?', 'iPhone saves the icon when you add the app. After you pick a new logo in Settings, press and hold the Life icon, remove it from the Home Screen (not delete data, nothing is lost), then add it again from Safari.'],
  ['How do I use it on my Mac?', 'Open the app in Safari, then choose File, Add to Dock. Your iPhone passkey syncs through iCloud Keychain, so the Mac signs in with Touch ID or your iPhone. If it doesn’t show up, sign in with your password once and tap “Add Face ID on this device” in Settings.'],
  ['Keyboard shortcuts on the Mac', 'N opens quick capture from anywhere. 1 to 7 jump to Home, Tasks, Calendar, Education, Daily log, Journal and Finances. Esc closes a sheet.'],
  ['What is “Claude’s changes”?', 'Every time Claude adds or edits something in your data, it’s written to a log with what it looked like before. Open Everything, then Claude’s changes, to see it and undo any of it. Your own edits in the app aren’t logged there.'],
  ['What’s the difference between a goal and a project?', 'A goal is an outcome you want, like “Finish the semester with a 3.5”. A project is a set of tasks with a finish line that moves you toward it, like “Study plan for MATH 101 final”. Link tasks to a goal and its progress fills in as you finish them.'],
  ['When does Home switch between morning, day and night?', 'By default morning runs 4:30 to 9 AM, the quick log 9 AM to 8 PM, and night 8 PM to 4:30 AM. Change the times in Settings.'],
  ['Where does my data live?', 'In your own private database. Only you can read it when signed in, and Claude reads it with your permission to keep things up to date. The app’s code is public, but none of your data is in it.'],
  ['What goes in Records?', 'Insurance, car registration, tax returns, W-2s, your lease, IDs: anything you’d hate to dig for. Each record says where the original is and can link to the file in Google Drive. Add an expiry date and the card turns gold in the last 30 days and red once it has passed. Records with no date never show as expired. Usernames are fine; passwords and SSNs stay out.'],
  ['How does Apple Health get in?', 'A Shortcut on your iPhone sends last night’s sleep, steps, resting heart rate and HRV each morning. The setup is below. They show in the daily log as read-only numbers; tap “Fix a number” there if one is wrong.'],
  ['Where’s the undo for Claude’s changes?', 'Open Everything, then Claude’s changes. Each change has its own Undo. Undoing leaves Claude a note so it won’t redo it, and you can leave Claude a note there too. Claude reads those notes before it changes anything.'],
  ['How do I refresh?', 'Pull down at the top of any page, or use Sync now in Settings. The app also refreshes whenever you come back to it.'],
]

export function Help({ section }: { section?: string }) {
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => { if (section === 'health') setTimeout(() => document.getElementById('health')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300) }, [section])
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
      <div id="health"><HealthSync /></div>
      <section class="card" style="--accent:var(--mint)">
        <div class="card-h"><h2>Ultrahuman ring, direct</h2></div>
        <p class="muted small" style="margin-bottom:10px">More than Apple Health passes along: recovery, sleep stages, VO2 max and skin temperature, pulled straight from Ultrahuman every morning and evening. No phone needed. It’s built and waiting for a token.</p>
        <ol class="steps small">
          <li>Make a token: sign in at <b>vision.ultrahuman.com</b> with your app email, then <b>Developer › Personal API Tokens</b>. Copy it. Treat it like a password.</li>
          <li>On GitHub, open your private <b>life-system-backups</b> repo, then <b>Settings › Secrets and variables › Actions › New repository secret</b>. Name it <code>ULTRAHUMAN_TOKEN</code>, paste the token as the value, and tap <b>Add secret</b>.</li>
          <li>Tell Claude it’s in. Claude runs a test pull, checks the numbers and fills in past days.</li>
        </ol>
        <p class="faint tiny">When the ring and Apple Health both have a day, the ring’s number is the one kept. The Shortcut can stay on as a backup.</p>
      </section>
      <p class="faint small" style="text-align:center">Anything else, just ask Claude.</p>
    </>
  )
}
