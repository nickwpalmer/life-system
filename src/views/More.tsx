import { Icon } from '../ui/icons'
import { lockNow } from '../lib/lock'
import { lockEnabled } from '../lib/supabase'

export function More() {
  const items: [string, string, string, string][] = [
    ['#/checkin/morning', 'sun', 'Morning check-in', 'Set up the day'],
    ['#/checkin/night', 'moon', 'Night check-in', 'Close the loop'],
    ['#/notes', 'note', 'Quick reference', 'Things you look up often'],
    ['#/calendar', 'cal', 'Calendar', 'Your week at a glance'],
    ['#/settings', 'gear', 'Settings', 'Face ID, metrics, areas'],
  ]
  return (
    <>
      <div class="page-title"><h1>More</h1></div>
      <section class="card menu">
        {items.map(([href, ic, t, s]) => (
          <a href={href}><span class="m-ico"><Icon name={ic} size={20} /></span><span><div>{t}</div><div class="faint small">{s}</div></span><span class="chev"><Icon name="chev" size={18} /></span></a>
        ))}
      </section>
      {lockEnabled() && (
        <section class="card menu">
          <button onClick={lockNow}><span class="m-ico"><Icon name="lock" size={20} /></span><span>Lock now</span></button>
        </section>
      )}
    </>
  )
}
