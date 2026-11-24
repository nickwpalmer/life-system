# Life

Nick's private life system: check-ins, quick logs, tasks, journal, reference notes and insights.
Installable web app (PWA) for iPhone and laptop. Maintained by Claude.

Live: https://nickwpalmer.github.io/life-system/

## How it fits together

- **Front end:** Vite + Preact + TypeScript, `vite-plugin-pwa` for install/offline shell. Hash routes (`#/today`, `#/tasks`, ...).
- **Data:** Supabase project `life-system` (`niztvvedjiyjlwjdwnpe`). Every table has row level security
  (`owner_id = auth.uid()`), so the publishable key in `src/lib/supabase.ts` only identifies the project.
  No secret keys live in this repo.
- **Auth:** email + password, then a passkey (Face ID on iPhone) via Supabase passkeys.
  "Require Face ID to open" keeps the session in memory only, so every open needs Face ID.
- **Hosting:** GitHub Pages via `.github/workflows/deploy.yml` on every push to `main`.
- **Claude:** reads and writes the same tables through the Supabase connector (check-in nudges, calendar sync, summaries).

## Tables

`profiles`, `areas`, `goals`, `tasks`, `checkins` (morning/night, one per day), `journal_entries`, `metrics`
(trackers: habit/vice/health/track), `logs` (one row per logged value), `notes`, `people`, `calendar_events`
(Google Calendar mirror). A trigger seeds areas and trackers for a new user.

## Code map

- `src/lib/` – Supabase client, data layer (`db.ts`), store, dates, metric math, Face ID lock.
- `src/views/` – one file per screen.
- `src/ui/` – icons, sheet, charts, small components.
