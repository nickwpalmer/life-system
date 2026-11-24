import { supabase, lockEnabled } from './supabase'
import { setState } from './store'

/**
 * Face ID lock. When on, the session is memory-only (see supabase.ts), so a cold
 * open has no session. Returning after IDLE_MS in the background signs out locally,
 * dropping tokens from memory too. Unlocking = a passkey sign-in, which the server
 * verifies; on iPhone the passkey prompt is Face ID.
 */
const IDLE_MS = 2 * 60 * 1000
let hiddenAt = 0

export function installIdleLock() {
  document.addEventListener('visibilitychange', async () => {
    if (!lockEnabled()) return
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return }
    if (hiddenAt && Date.now() - hiddenAt > IDLE_MS) await lockNow()
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
