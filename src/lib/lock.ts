import { supabase, lockEnabled } from './supabase'
import { setState } from './store'

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
    if (lockEnabled()) await lockNow()
  })
}

export async function lockNow() {
  await supabase.auth.signOut({ scope: 'local' })
  setState({ locked: true })
}

export async function unlockWithPasskey() {
  const { error } = await supabase.auth.signInWithPasskey()
  if (error) throw error
  setState({ locked: false })
}

export const passkeySupported = () => typeof window !== 'undefined' && !!window.PublicKeyCredential
