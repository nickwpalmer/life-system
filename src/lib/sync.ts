import { bootstrap } from './db'
import { reloadAll } from './rows'
import { getState, toast } from './store'

let running: Promise<void> | null = null
/** Pull everything fresh from the database: the main data and any lists already open. */
export function syncAll(quiet = false) {
  if (getState().demo) { if (!quiet) toast('Up to date'); return Promise.resolve() }
  if (running) return running
  running = Promise.all([bootstrap(true), reloadAll()])
    .then(() => { if (!quiet) toast('Up to date') })
    .catch(() => { if (!quiet) toast('Couldn’t sync. Check your connection.') })
    .finally(() => { running = null })
  return running
}
