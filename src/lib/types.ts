export type Area = {
  id: string; key: string; name: string; color: string | null; icon: string | null
  sort: number; archived: boolean
}

export type MetricKind = 'boolean' | 'count' | 'number' | 'scale' | 'duration' | 'text'
export type MetricRole = 'habit' | 'vice' | 'health' | 'track'

export type Metric = {
  id: string; area_id: string | null; key: string; name: string; kind: MetricKind
  unit: string | null; role: MetricRole; target: number | null
  target_period: 'day' | 'week' | 'month' | null; higher_is_better: boolean | null
  icon: string | null; sort: number; active: boolean; show_today: boolean
}

/** source 'daily' = a whole-day entry (occurred_at is local noon); anything else is a timed entry. */
export type Log = {
  id: string; metric_id: string; value_num: number | null; value_text: string | null
  occurred_at: string; note: string | null; source: string
}

export type TaskStatus = 'inbox' | 'open' | 'doing' | 'waiting' | 'done' | 'dropped'
export type Task = {
  id: string; area_id: string | null; goal_id: string | null; title: string; notes: string | null
  status: TaskStatus; priority: number; due_date: string | null; due_time: string | null
  scheduled_for: string | null; estimate_min: number | null
  completed_at: string | null; created_at: string; updated_at?: string; tags: string[]; source?: string
}

export type Checkin = {
  id?: string; kind: 'morning' | 'night'; day: string
  mood: number | null; energy: number | null; stress: number | null; focus: number | null
  sleep_quality: number | null; intention: string | null; top_three: string[]; gratitude: string[]
  win: string | null; lesson: string | null; reflection: string | null; data: Record<string, unknown>
}

export type JournalEntry = {
  id: string; area_id: string | null; title: string | null; body: string; mood: number | null
  tags: string[]; occurred_at: string
}

export type Note = {
  id: string; area_id: string | null; title: string; body: string | null; pinned: boolean
  tags: string[]; updated_at: string
}

export type Goal = {
  id: string; area_id: string | null; title: string; why: string | null
  status: 'active' | 'paused' | 'done' | 'dropped'; target_date: string | null
  suggested: boolean; next_step: string | null; progress: number | null; sort: number
  horizon: string | null; created_at: string
}

export type Person = {
  id: string; name: string; relation: string | null; birthday: string | null
  contact_every_days: number | null; last_contact: string | null; notes: string | null
}

export type Review = {
  id: string; week_start: string; wins: string | null; lessons: string | null
  focus: string[]; rating: number | null; data: Record<string, unknown>
}

export type CalEvent = {
  id: string; title: string; starts_at: string; ends_at: string | null; all_day: boolean
  location: string | null; calendar_name: string | null; description?: string | null
}

export type Profile = { id: string; display_name: string | null; timezone: string; settings: Record<string, unknown> }
