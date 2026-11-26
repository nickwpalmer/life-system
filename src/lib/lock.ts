import { supabase, lockEnabled } from './supabase'
import { setState } from './store'
import { markAuthBusy, authBusy } from './update'

/**
 * Face ID lock. When on, the session is memory-only (see supabase.ts), so a cold
 * open has no session. Returning after IDLE_MS in the background signs out locally,
 * dropping tokens from memory too. Unlocking = a passkey sign-in, which the server
 * verifies; on iPhone the passkey prompt is Face ID.
 */
export const IDLE_MS = 5 * 60 * 1000
let hiddenAt = 0

/** Coming back after 5+ minutes away: lock (if Face ID is on), go Home, and pick up any new version of the app. */
export function installIdleLock() {
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return }
    const away = hiddenAt && Date.now() - hiddenAt > IDLE_MS
    hiddenAt = 0
    if (!away) return
    if (!document.querySelector('.sheet textarea, .sheet input:focus')) location.hash = '#/today'
    navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {})
    if (lockEnabled() && !authBusy()) await lockNow()
  })
}

export async function lockNow() {
  await supabase.auth.signOut({ scope: 'local' })
  setState({ locked: true })
}

/**
 * Face ID unlock. Marks itself busy so an app update can't reload the page under the Face ID sheet, and gives
 * up after 90 seconds so the button never stays stuck: you can tap it again or use your password.
 */
let stop: (() => void) | null = null
/** Stop waiting on the current Face ID try (the Stuck? button). */
export function cancelPasskey() { stop?.() }

export async function unlockWithPasskey() {
  markAuthBusy(true)
  let timer = 0
  try {
    const timeout = new Promise<never>((_, rej) => {
      timer = window.setTimeout(() => rej(new Error('timeout')), 60_000)
      stop = () => rej(new Error('cancelled'))
    })
    const { data, error } = await Promise.race([supabase.auth.signInWithPasskey(), timeout])
    if (error) throw error
    // Make sure the session really landed before the lock screen goes away.
    if (!data?.session) { const { data: s } = await supabase.auth.getSession(); if (!s.session) throw new Error('No session after Face ID') }
    setState({ locked: false })
  } finally {
    clearTimeout(timer)
    stop = null
    markAuthBusy(false)
  }
}

export const passkeySupported = () => typeof window !== 'undefined' && !!window.PublicKeyCredential
