import type { Hub } from '../ui/kit'

/** Pages that were merged in v0.7. Each keeps its old address, which now opens the right view here. */
export const healthHub = (on: string): Hub => ({ title: 'Health', icon: 'heart', color: 'var(--mint)', on, items: [['body', 'Body', '#/health'], ['mind', 'Mind', '#/health/mind'], ['habits', 'Habits', '#/health/habits'], ['substances', 'Substances', '#/health/substances']] })
export const reviewHub = (on: string): Hub => ({ title: 'Review', icon: 'review', color: 'var(--lilac)', on, items: [['week', 'This week', '#/review'], ['patterns', 'Patterns', '#/review/patterns']] })
export const recordsHub = (on: string): Hub => ({ title: 'Records', icon: 'layers', color: 'var(--peach)', on, items: [['docs', 'Documents', '#/records'], ['things', 'Your things', '#/records/things']] })

/** Old page addresses and the view each one is now. Used for links, saved bottom-bar picks and keyboard shortcuts. */
export const MOVED: Record<string, string> = { substances: 'health/substances', insights: 'review/patterns', things: 'records/things', 'area/health': 'health', 'area/mental': 'health/mind' }
