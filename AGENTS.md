# Writing to Life's data: rules for any AI assistant

Life is a personal app. Its code lives in this public repository; its **data lives in Supabase** (Postgres) and never in this repo.
Read this before you add, change or delete anything in the database, whatever tool you use (Supabase connector, SQL, REST).

## Ground rules

1. **Never put personal data in this repository.** No schedules, money, school records, names or IDs in code, commits or demo data. Demo data (`src/lib/demo.ts`, `registerDemo(...)`) stays generic.
2. **Never store:** passwords or password hints, Social Security numbers, full card or bank account numbers, recovery phrases, API keys. Usernames and insurance policy or member numbers are fine.
3. **Every row needs `owner_id`.** It defaults to `auth.uid()`, which is empty when you write with a service connection, so set it explicitly to the owner's user id. Look it up with `select id from profiles limit 1` (there is one user) instead of hard-coding it.
4. **Leave a note on every change** so it reads well in the app's "Claude's changes" screen. Run this in the same transaction, before the write:
   `select set_config('app.change_note', 'Added your car registration to Records', true);`
   Write the note to the owner, in plain words, saying what changed.
5. **Writes made outside the app are logged and can be undone.** Trigger `log_claude_change` records before and after values in `change_log`. The owner undoes them in the app (RPC `revert_change(id)`). Don't edit or delete `change_log` rows.
6. **Ask before you delete or bulk-change real rows.** Prefer status changes (`dropped`, `done`) over deletes. Don't mark tasks done or delete them unless the owner says so.
7. **Schema changes:** never weaken row-level security. Every table has RLS on with one policy, `owner all` (`owner_id = (select auth.uid())`). A new table needs the same policy, an `updated_at` trigger (`set_updated_at()`), a `log_claude_change` trigger, and an entry in `revert_change`'s table whitelist. Batch DDL into one migration.
8. **Times:** the owner is in `America/Detroit`. Store timestamps as `timestamptz`; convert local times before you write.
9. **Don't duplicate.** Search before you insert (same title or name, same day).

## Where things go

| What the owner says | Table | How |
|---|---|---|
| Something to do | `tasks` | `status='inbox'` if it needs sorting, `'open'` if clear. `source='claude'`. |
| A feeling, reflection, story | `journal_entries` | `body`, optional `title`, `mood` 1 to 10, `occurred_at` = when it happened. See Journal. |
| A number for the day (slept 7h, mood 6) | `logs` | Daily entry; see Logs. |
| Something taken (coffee, a drink, a supplement) | `substance_logs` | `substance`, `amount`, `unit`, `occurred_at`; `time_known=false` if no time given (use local noon). |
| A document or ID-type fact (insurance, registration, W-2) | `records` | See Records. |
| A reference note, list or how-to | `notes` | `title`, `body`. |
| A person, birthday, keep-in-touch | `people` | `name`, `relation`, `birthday`, `contact_every_days`, `last_contact`. |
| An outcome they want | `goals` | `status='active'`; if you're proposing it rather than they stated it, `suggested=true`. |
| A school deadline, exam or term date | `key_dates` | `kind` in deadline, exam, term, event; `area_key='education'`; `course` like `MAT 2010`. |
| A class taken, grade, transfer credit | `edu_courses` / `courses` / `degree_reqs` | History, current or planned classes, degree plan. |
| A scholarship or grant | `scholarships` | `status` in maybe, to_apply, applied, awarded, declined, missed. |

Areas (`areas.key`): `education`, `mental`, `finances`, `health`, `work`, `relationships`, `growth`, `home`. Put `area_id` on tasks, notes, goals and journal entries when the area is clear.

## Tasks

- `status`: inbox, open, doing, waiting, done, dropped. Set `completed_at` when done.
- `priority`: 0 none, 1 low, 2 medium, 3 high.
- `due_date` (date) and optional `due_time` (local time). `scheduled_for` = the day they plan to do it.
- `goal_id` links a task to a goal (goal steps are tasks). `parent_id` makes a subtask.
- `source`: `app` (typed in the app), `claude` (you), `ticktick` (one-time import, read-only history).

## Logs (daily numbers)

- Each tracked thing is a row in `metrics` (look it up by `key`): mood, anxiety, energy (scale 1 to 10), sleep_hours (h), sleep_score, hrv (ms), resting_hr (bpm), steps, exercise, meditation, study, reading (min), water (glasses), screen_time (h), spend ($). The owner can add more.
- **Whole-day value:** one row per metric per day, `source='daily'`, `occurred_at` = **local noon** of that day (12:00 America/Detroit). If a daily row already exists for that metric and day, update it; don't add a second one.
- **Timed value** (a mood right now, a workout at 6 PM): `source='app'` or `'claude'`, `occurred_at` = the actual time.
- Apple Health writes `source='health'` through RPC `ingest_health`. Don't write those by hand.
- `value_num` for numbers, `value_text` for text metrics, `note` for context.

## Journal

- `author`: `'nick'` for the owner's own writing (the default), `'claude'` for anything an AI wrote, such as a summary of a brain dump. **Always set `author='claude'` when you write a journal entry.** The app shows the two in different colors.
- Never write an entry as if the owner wrote it. A summary of what they said is `author='claude'`, titled like "Claude's summary: Tuesday brain dump".
- `photos`: storage paths of attached pictures, in the private bucket `journal-photos`, at `<owner_id>/<uuid>.jpg`. The app shrinks pictures before upload (longest side 1600px, JPEG); the bucket refuses files over 1 MB. Don't upload photos yourself unless the owner sends one and asks; never make the bucket public.

## Records

- `name`, `category` (insurance, vehicle, taxes, identity, accounts, medical, housing, school, other), `issuer`, `details` (plan, policy or member number, what it covers), `location` (where the original is: "glove box", "Drive > Taxes > 2025"), `link` (https only; normally a Google Drive link), `login_hint` (username or account email, and which site; **never a password**), `expires_on` (date or null), `renews` (true for registrations and licenses), `notes`, `pinned`.
- Only set `expires_on` when there is a real date. Records with no date never show as expired.
- Files are not uploaded to the app. Link to them in Google Drive.

## Calendar and money

- `calendar_events` is a copy of Google Calendar, refreshed automatically. Don't edit it; change the real calendar instead.
- `fin_*` tables are snapshots read from Monarch. Don't hand-edit them.

## Check-ins and reviews

- `checkins`: one per `(kind, day)`, kind morning or night; scales 1 to 10. Upsert on `(owner_id, kind, day)`.
- `reviews`: one per `week_start` (Monday). Upsert on `(owner_id, week_start)`.

## Owner settings

`profiles.settings.prefs` holds app preferences (theme, logo, bottom-bar tabs, Home time windows, calendar layers, `calRoles` mapping each Google calendar name to personal, work, classes, assignments or important). Merge into it with `jsonb_set` / `||`; never overwrite the whole `settings` object.

## Backups

A separate private repository runs a weekly encrypted dump of the `public` schema. Restore steps are in that repo's RESTORE.md.
