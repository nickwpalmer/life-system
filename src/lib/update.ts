import { registerSW } from 'virtual:pwa-register'

/**
 * App updates. A new version used to take over and reload the page the moment it arrived. If that happened
 * while the Face ID sheet was open, the page under the sheet was replaced and the unlock hung (v0.7 bug).
 * Now a new version waits until no Face ID sign-in is in progress, then reloads.
 */
let busy = 0
let pending = false
let update: ((reload?: boolean) => Promise<void>) | null = null

export const markAuthBusy = (on: boolean) => { busy = Math.max(0, busy + (on ? 1 : -1)); if (!busy) tryApply() }
export const authBusy = () => busy > 0

function tryApply() {
  if (!pending) return
  if (busy) return // markAuthBusy(false) calls this again
  pending = false
  if (waiting && update) update(true).catch(() => location.reload())
  else location.reload()
}
let waiting = false

export function installUpdates() {
  const sw = navigator.serviceWorker
  // The new version takes control on its own; reload into it once nothing is in the way.
  if (sw?.controller) sw.addEventListener('controllerchange', () => { pending = true; setTimeout(tryApply, 400) })
  update = registerSW({ immediate: true, onNeedRefresh() { waiting = true; pending = true; setTimeout(tryApply, 400) } })
}

/** Apply a waiting version now (Sync now uses this), unless Face ID is in progress. */
export function applyUpdateSoon() { pending = true; tryApply() }
