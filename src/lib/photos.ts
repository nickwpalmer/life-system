import { useEffect, useState } from 'preact/hooks'
import { supabase } from './supabase'
import { getState, toast } from './store'

/**
 * Journal photos live in a private Supabase Storage bucket, one folder per user.
 * They are shrunk on the device first (longest side 1600px, JPEG ~80%), so each is roughly 150 to 400 KB.
 * The bucket refuses anything over 1 MB or that isn't JPEG/WebP.
 */
const BUCKET = 'journal-photos'
const MAX = 1600

async function shrink(file: File): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Couldn’t read that picture')); i.src = URL.createObjectURL(file)
  })
  const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight))
  const c = document.createElement('canvas')
  c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  URL.revokeObjectURL(img.src)
  for (const q of [0.8, 0.65, 0.5]) {
    const b = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', q))
    if (b && b.size < 950_000) return b
  }
  throw new Error('That picture is too big even after shrinking')
}

/** Shrinks and uploads; returns the storage paths to keep on the entry. */
export async function uploadPhotos(files: FileList | File[]): Promise<string[]> {
  if (getState().demo) { toast('Photos are off in the demo'); return [] }
  const uid = getState().session?.user.id
  if (!uid) return []
  const out: string[] = []
  for (const f of Array.from(files)) {
    try {
      const blob = await shrink(f)
      const path = `${uid}/${crypto.randomUUID()}.jpg`
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
      if (error) throw error
      out.push(path)
    } catch (e) { toast(`Couldn’t add a photo: ${(e as Error).message}`) }
  }
  return out
}

export async function deletePhoto(path: string) {
  if (getState().demo) return
  await supabase.storage.from(BUCKET).remove([path])
}

/** Short-lived private links for showing photos. Cached for 50 minutes. */
const cache = new Map<string, { url: string; at: number }>()
export function usePhotoUrls(paths: string[] | null | undefined) {
  const key = (paths ?? []).join('|')
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    const ps = paths ?? []
    if (!ps.length || getState().demo) { setUrls({}); return }
    const fresh = (p: string) => { const c = cache.get(p); return c && Date.now() - c.at < 50 * 60e3 ? c.url : null }
    const missing = ps.filter((p) => !fresh(p))
    const done = () => setUrls(Object.fromEntries(ps.map((p) => [p, fresh(p) ?? ''])))
    if (!missing.length) { done(); return }
    supabase.storage.from(BUCKET).createSignedUrls(missing, 3600).then(({ data }) => {
      for (const d of data ?? []) if (d.path && d.signedUrl) cache.set(d.path, { url: d.signedUrl, at: Date.now() })
      done()
    })
  }, [key])
  return urls
}
