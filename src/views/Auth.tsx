import { useState } from 'preact/hooks'
import { supabase, lockEnabled } from '../lib/supabase'
import { unlockWithPasskey, passkeySupported } from '../lib/lock'
import { Icon } from '../ui/icons'

const APP_URL = `${location.origin}/life-system/`

export function AuthScreen() {
  const locked = lockEnabled()
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin')
  const [showForm, setShowForm] = useState(!locked)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [fidBusy, setFidBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  async function faceId() {
    setErr(''); setFidBusy(true)
    try { await unlockWithPasskey() }
    catch (e) {
      const m = (e as Error).message || ''
      setErr(/disabled/i.test(m) ? 'Face ID sign-in isn’t switched on for this app yet. Use your password for now.'
        : /not.?found|not registered/i.test(m) ? 'No Face ID passkey for this app yet. Sign in with your password, then add one in Settings.'
        : /abort|cancel|NotAllowed/i.test(m) ? '' : m)
    }
    setFidBusy(false)
  }

  async function submit(e: Event) {
    e.preventDefault(); setErr(''); setOk(''); setBusy(true)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: APP_URL } })
        if (error) throw error
        if (!data.session) { setOk('Check your email and tap the confirm link. Then come back here and sign in.'); setMode('signin') }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: APP_URL })
        if (error) throw error
        setOk('Reset link sent. Open it, then set a new password in Settings.')
      }
    } catch (e) {
      const m = (e as Error).message
      setErr(/Invalid login/i.test(m) ? 'That email and password don’t match.' : /not confirmed/i.test(m) ? 'Confirm your email first (check your inbox).' : /signups not allowed/i.test(m) ? 'New accounts are switched off.' : m)
    }
    setBusy(false)
  }

  return (
    <div class="center">
      <div class="auth">
        <img class="logo" src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" />
        <h1>{locked ? 'Welcome back' : <span class="grad-text">Life</span>}</h1>
        <p class="muted">{locked ? 'Locked to keep your things private.' : 'Your private place for days, goals and growth.'}</p>

        {passkeySupported() && (
          <>
            <button class="faceid" onClick={faceId} disabled={fidBusy} aria-label={locked ? 'Unlock with Face ID' : 'Sign in with Face ID'}><Icon name="face" size={44} stroke={1.5} /></button>
            <button class="btn ghost" onClick={faceId} disabled={fidBusy}>{locked ? 'Unlock with Face ID' : 'Sign in with Face ID'}</button>
          </>
        )}

        {err && <p class="err" style="text-align:center">{err}</p>}
        {ok && <p class="ok" style="text-align:center">{ok}</p>}

        {!showForm ? (
          <button class="btn ghost small" style="margin-top:8px" onClick={() => setShowForm(true)}>Use email and password instead</button>
        ) : (
          <form onSubmit={submit}>
            <label class="field"><span>Email</span>
              <input class="input" type="email" autocomplete="username" required value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} />
            </label>
            {mode !== 'reset' && (
              <label class="field"><span>Password</span>
                <input class="input" type="password" autocomplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={10} required value={password} onInput={(e) => setPassword((e.target as HTMLInputElement).value)} />
              </label>
            )}
            <button class="btn primary block" disabled={busy}>
              {busy ? '…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create my account' : 'Send reset link'}
            </button>
            <div class="row between" style="margin-top:12px">
              <button type="button" class="btn ghost sm" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setErr('') }}>
                {mode === 'signup' ? 'I have an account' : 'Create account'}
              </button>
              <button type="button" class="btn ghost sm" onClick={() => { setMode(mode === 'reset' ? 'signin' : 'reset'); setErr('') }}>
                {mode === 'reset' ? 'Back' : 'Forgot password'}
              </button>
            </div>
            {mode === 'signup' && <p class="faint small" style="margin-top:10px;text-align:center">Use at least 10 characters. You’ll switch to Face ID after this.</p>}
          </form>
        )}
      </div>
    </div>
  )
}
