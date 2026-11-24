import { NAV } from '../app'
import { useStore } from '../lib/store'
import { Icon } from '../ui/icons'
import { PageHead } from '../ui/kit'

/** Everything in the app, in one place. Settings only holds settings now. */
export function More() {
  const suggested = useStore((s) => s.goals.filter((g) => g.status === 'active' && g.suggested).length)
  const row = (href: string, icon: string, label: string, sub: string | undefined, c: string, badge?: string) => (
    <a href={href}><span class="m-ico" style={`--c:${c}`}><Icon name={icon} /></span><span class="grow"><div>{label}</div>{sub && <div class="faint tiny">{sub}</div>}</span>{badge && <span class="pill" style="--c:var(--gold)">{badge}</span>}<span class="chev"><Icon name="chev" size={18} /></span></a>
  )
  const group = (g: 'main' | 'life' | 'system', title: string) => (
    <section class="card">
      <div class="card-h"><h2>{title}</h2></div>
      <div class="menu">{NAV.filter((n) => n.group === g && n.r !== 'today').map((n) => row(`#/${n.r}`, n.icon, n.label, n.sub, n.c, n.r === 'goals' && suggested ? `${suggested} new` : undefined))}</div>
    </section>
  )
  return (
    <>
      <PageHead title="Everything" icon="grid" color="var(--lilac)" />
      <section class="card">
        <div class="menu">
          {row('#/checkin/morning', 'sun', 'Morning check-in', 'Sleep, mood, today’s focus', 'var(--orange)')}
          {row('#/checkin/night', 'moon', 'Night check-in', 'How today went', 'var(--violet)')}
        </div>
      </section>
      {group('main', 'Every day')}
      {group('life', 'Your life')}
      {group('system', 'The app')}
    </>
  )
}
