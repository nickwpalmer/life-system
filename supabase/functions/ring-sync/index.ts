// ring-sync: the app's "Sync ring now" button. Pulls the last few days from Ultrahuman and saves them through
// public.ingest_ring, the same path as the scheduled GitHub Action (life-system-backups/ring/pull.mjs).
// Needs the Edge Function secret ULTRAHUMAN_TOKEN. Only a signed-in user of this project can call it.
// No token or personal data lives in this file.
import { createClient } from 'npm:@supabase/supabase-js@2'

const TZ = 'America/Detroit'
const API = 'https://partner.ultrahuman.com/api/v1/partner/daily_metrics'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const localDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

// ---- Same parsing as pull.mjs --------------------------------------------------------------------
type J = any // deno-lint-ignore no-explicit-any
const num = (x: J) => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && /^-?\d+(\.\d+)?$/.test(x.trim()) ? Number(x) : null)
function scalar(v: J, key: string): number | null {
  const n = num(v); if (n != null) return n
  if (Array.isArray(v)) {
    const xs = v.map((p) => num(p?.value ?? p)).filter((x): x is number => x != null)
    if (!xs.length) return null
    return /step/.test(key) ? xs.reduce((a, b) => a + b, 0) : xs.reduce((a, b) => a + b, 0) / xs.length
  }
  if (!v || typeof v !== 'object') return null
  for (const k of ['value', 'total', 'avg', 'average', 'score', 'minutes', 'seconds']) {
    const n2 = num(v[k]); if (n2 != null) return k === 'seconds' ? n2 / 60 : n2
  }
  if (Array.isArray(v.values)) return scalar(v.values, key)
  return null
}
function collect(node: J, found = new Map<string, number>(), depth = 0): Map<string, number> {
  if (!node || typeof node !== 'object' || depth > 8) return found
  if (Array.isArray(node)) { for (const x of node) collect(x, found, depth + 1); return found }
  if (typeof node.type === 'string' && node.object !== undefined) {
    const o = node.object
    const daily = o && Array.isArray(o.values) && o.day_start_timestamp != null ? o.values.find((p: J) => p?.timestamp === o.day_start_timestamp) : undefined
    const multiDay = o && Array.isArray(o.values) && o.values.some((p: J) => p?.timestamp < o.day_start_timestamp)
    const v = daily ? num(daily.value) : multiDay && o.avg == null ? null : scalar(o, node.type)
    if (v != null && !found.has(node.type)) found.set(node.type, v)
    collect(node.object, found, depth + 1)
    return found
  }
  if (typeof node.type === 'string' && node.object === undefined) {
    const v = num(node.value); if (v != null && !found.has(node.type)) found.set(node.type, v)
  }
  for (const [k, v] of Object.entries(node)) {
    const s = scalar(v, k); if (s != null && !found.has(k)) found.set(k, s)
    if (v && typeof v === 'object') collect(v, found, depth + 1)
  }
  return found
}
const pick = (f: Map<string, number>, ...names: string[]) => { for (const n of names) if (f.has(n)) return f.get(n)!; return null }
const hours = (x: number | null) => (x == null ? null : x > 1440 ? x / 3600 : x > 24 ? x / 60 : x)
const r1 = (x: number | null, d = 1) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d)
function normalize(body: J) {
  const f = collect(body)
  const v: Record<string, number | null> = {
    sleep_hours: r1(hours(pick(f, 'total_sleep', 'total_duration_minutes', 'sleep_duration', 'total_sleep_minutes')), 2),
    sleep_score: r1(pick(f, 'sleep_score')),
    hrv: r1(pick(f, 'avg_sleep_hrv', 'sleep_hrv')),
    resting_hr: r1(pick(f, 'night_rhr', 'sleep_rhr', 'night_resting_heart_rate', 'resting_hr')),
    steps: r1(pick(f, 'steps', 'total_steps'), 0),
    deep_h: r1(hours(pick(f, 'deep_sleep', 'deep_minutes')), 2),
    rem_h: r1(hours(pick(f, 'rem_sleep', 'rem_minutes')), 2),
    light_h: r1(hours(pick(f, 'light_sleep', 'light_minutes')), 2),
    time_in_bed_h: r1(hours(pick(f, 'time_in_bed')), 2),
    sleep_hr: r1(pick(f, 'avg_hr')),
    sleep_efficiency: r1(pick(f, 'sleep_efic', 'sleep_efficiency', 'efficiency')),
    recovery_index: r1(pick(f, 'recovery_index', 'recovery_score', 'recovery')),
    movement_index: r1(pick(f, 'movement_index')),
    vo2_max: r1(pick(f, 'vo2_max')),
    temp_deviation: r1(pick(f, 'temperature_deviation'), 2),
    spo2: r1(pick(f, 'spo2')),
    active_minutes: r1(pick(f, 'active_minutes'), 0),
    hr_avg: r1(pick(f, 'hr', 'heart_rate')),
  }
  if (v.steps === 0) delete v.steps
  const sane: Record<string, [number, number]> = { sleep_hours: [0.5, 16], deep_h: [0, 8], rem_h: [0, 8], light_h: [0, 14], time_in_bed_h: [0.5, 18], sleep_score: [0, 100], hrv: [5, 300], resting_hr: [25, 130], steps: [0, 100000], sleep_efficiency: [0, 100], recovery_index: [0, 100], movement_index: [0, 100], vo2_max: [10, 90], spo2: [70, 100], temp_deviation: [-5, 5] }
  for (const [k, x] of Object.entries(v)) if (x == null || (sane[k] && (x < sane[k][0] || x > sane[k][1]))) delete v[k]
  return v as Record<string, number>
}
const trim = (x: J): J => Array.isArray(x) && x.every((i) => i?.type) ? x.map(trim) : Array.isArray(x) ? [...x.slice(0, 3).map(trim), ...(x.length > 3 ? [`…${x.length} items`] : [])] : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, trim(v)])) : x

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: u } = await asUser.auth.getUser()
  if (!u?.user) return json({ ok: false, error: 'Sign in first' }, 401)

  const token = Deno.env.get('ULTRAHUMAN_TOKEN')?.trim()
  if (!token) return json({ ok: false, setup: true, error: 'The ring token isn’t saved in Supabase yet' })

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const days = [2, 1, 0].map((n) => localDay(new Date(Date.now() - n * 864e5)))
  const out: { day: string; saved: boolean; sleep_hours?: number; note?: string }[] = []
  for (const day of days) {
    const res = await fetch(`${API}?date=${day}`, { headers: { Authorization: token, Accept: 'application/json' } })
    if (!res.ok) { out.push({ day, saved: false, note: `Ultrahuman answered ${res.status}` }); if (res.status === 401 || res.status === 403 || res.status === 429) break; continue }
    const body = await res.json()
    const vals = normalize(body)
    if (!['sleep_hours', 'hrv', 'steps'].some((k) => k in vals)) { out.push({ day, saved: false, note: 'not synced yet' }); continue }
    const { error } = await admin.rpc('ingest_ring', { p_day: day, p_vals: vals, p_raw: trim(body), p_owner: u.user.id })
    out.push({ day, saved: !error, sleep_hours: vals.sleep_hours, note: error?.message })
  }
  const latest = [...out].reverse().find((d) => d.saved && d.sleep_hours != null)?.day ?? null
  return json({ ok: out.some((d) => d.saved), latest, days: out })
})
