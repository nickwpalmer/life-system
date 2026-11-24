import { createClient } from '@supabase/supabase-js'

// Public by design: the URL and publishable key only identify the project.
// Every table is protected by row level security (owner_id = auth.uid()).
export const SUPABASE_URL = 'https://niztvvedjiyjlwjdwnpe.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_tvWznlVCIJ8NEsFO7j6gDg_MmxGw3nP'

const LOCK_FLAG = 'life.lock'
const memory = new Map<string, string>()

export const lockEnabled = () => {
  try { return localStorage.getItem(LOCK_FLAG) === '1' } catch { return false }
}

/**
 * Session storage that obeys the Face ID lock.
 * Lock on: the session lives only in memory, so nothing that grants access is
 * saved on the device. Every cold open (and every return after the idle limit)
 * needs a fresh passkey sign-in, which iPhone performs with Face ID.
 * Lock off: normal persistent sign-in.
 */
const storage = {
  getItem: (k: string) => (lockEnabled() ? memory.get(k) ?? null : localStorage.getItem(k)),
  setItem: (k: string, v: string) => { if (lockEnabled()) memory.set(k, v); else localStorage.setItem(k, v) },
  removeItem: (k: string) => { memory.delete(k); try { localStorage.removeItem(k) } catch { /* ignore */ } },
}

export function setLockFlag(on: boolean) {
  if (on) {
    // Move any saved session out of localStorage into memory.
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('sb-')) { memory.set(k, localStorage.getItem(k) || ''); localStorage.removeItem(k) }
    }
    localStorage.setItem(LOCK_FLAG, '1')
  } else {
    localStorage.removeItem(LOCK_FLAG)
    for (const [k, v] of memory) localStorage.setItem(k, v)
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
