import { useStore } from '../lib/store'
import { Icon } from '../ui/icons'
import { PageHead } from '../ui/kit'

export function More() {
  const areas = useStore((s) => s.areas.filter((a) => !a.archived))
  const goals = useStore((s) => s.goals.filter((g) => g.status === 'active' && !g.suggested).length)
  const suggested = useStore((s) => s.goals.filter((g) => g.status === 'active' && g.suggested).length)
  const notes = useStore((s) => s.notes.length)
  const people = useStore((s) => s.people.length)
  const tile = (href: string, icon: string, name: string, sub: string, c: string) => (
    <a class="tile" href={href} style={`--c:${c}`}><div class="t-ico"><Icon name={icon} size={24} /></div><div class="t-name">{name}</div><div class="t-sub">{sub}</div></a>
  )
  return (
    <>
      <PageHead title="Everything" icon="grid" color="var(--lilac)" />
      <div class="tiles">
        {tile('#/calendar', 'cal', 'Calendar', 'Your week', 'var(--sky)')}
        {tile('#/goals', 'target', 'Goals', suggested ? `${goals} active · ${suggested} to look at` : `${goals} active`, 'var(--gold)')}
        {tile('#/review', 'review', 'Weekly review', 'Reset for next week', 'var(--lilac)')}
        {tile('#/insights', 'chart', 'Insights', 'Patterns in your days', 'var(--teal)')}
        {tile('#/notes', 'note', 'Reference', `${notes} notes`, 'var(--peach)')}
        {tile('#/people', 'users', 'People', people ? `${people} people` : 'Birthdays, keeping in touch', 'var(--coral)')}
      </div>
      <section class="card">
        <div class="card-h"><h2>Areas</h2></div>
        <div class="menu">
          {areas.map((a) => <a href={`#/area/${a.key}`}><span class="m-ico" style={`--c:${a.color}`}><i class="dot" style={`background:${a.color};width:12px;height:12px`} /></span>{a.name}<span class="chev"><Icon name="chev" size={18} /></span></a>)}
        </div>
      </section>
      <section class="card">
        <div class="menu">
          <a href="#/checkin/morning"><span class="m-ico" style="--c:var(--orange)"><Icon name="sun" /></span>Morning check-in<span class="chev"><Icon name="chev" size={18} /></span></a>
          <a href="#/checkin/night"><span class="m-ico" style="--c:var(--violet)"><Icon name="moon" /></span>Night check-in<span class="chev"><Icon name="chev" size={18} /></span></a>
          <a href="#/settings"><span class="m-ico" style="--c:var(--muted)"><Icon name="gear" /></span>Settings<span class="chev"><Icon name="chev" size={18} /></span></a>
        </div>
      </section>
    </>
  )
}
