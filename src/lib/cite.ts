// Citations for notes, stored as plain text so they read fine anywhere:
//
//   - A fact. [1][2]
//
//   Sources
//   [1] https://example.org/page
//   [2] Email from Sam to me, 2026-11-12
//
// A source line is a link, or words: "Email from …", "Record: Car insurance",
// "Person: Sam", "Note: Gym routine", "Sam said, 2026-11-20". Anything after
// the link is kept as a note on it, like "(via PubMed)".
// Older notes that put sources after an em dash ("- fact. — url ; url") are
// read the same way, so nothing has to be rewritten by hand.

export type SrcKind = 'web' | 'email' | 'record' | 'person' | 'note' | 'said' | 'other'
export type Src = { n: number; text: string; kind: SrcKind; label: string; url?: string; extra?: string; target?: string }
export type Cited = { text: string; sources: Src[] }

const HEAD = /^\s*sources:?\s*$/i
const LINE = /^\s*\[(\d+)\]\s+(.+?)\s*$/
const LEGACY = /^(\s*-\s.*?)\s+—\s+(.+)$/
const SAME = /^same\b.*\babove\.?$/i

export function describe(n: number, text: string): Src {
  const t = text.trim()
  const m = t.match(/^(https?:\/\/\S+)\s*(.*)$/)
  if (m) {
    let label = m[1]
    try { const u = new URL(m[1]); label = u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? decodeURIComponent(u.pathname).replace(/\/$/, '').replace(/^(.{0,38}).*$/, (_a, s) => s.length >= 38 ? s + '…' : s) : '') } catch { /* keep raw */ }
    return { n, text: t, kind: 'web', label, url: m[1], extra: m[2] || undefined }
  }
  const pre = t.match(/^(record|person|note):\s*(.+)$/i)
  if (pre) return { n, text: t, kind: pre[1].toLowerCase() as SrcKind, label: pre[2], target: pre[2] }
  if (/^e-?mail\b/i.test(t) || /\bemail\b/i.test(t.split(',')[0])) return { n, text: t, kind: 'email', label: t }
  if (/\b(said|told|says)\b/i.test(t.split(',')[0])) return { n, text: t, kind: 'said', label: t }
  return { n, text: t, kind: 'other', label: t }
}

/** Turns "- fact. — src ; src" lines into "- fact. [1][2]" plus a Sources list. Returns null when there's nothing to convert. */
export function fromLegacy(body: string): string | null {
  const lines = body.split('\n')
  if (!lines.some((l) => LEGACY.test(l))) return null
  const order: string[] = []
  const idx = (s: string) => { let i = order.indexOf(s); if (i < 0) { order.push(s); i = order.length - 1 } return i + 1 }
  let prev: number[] = []
  const out = lines.map((l) => {
    const m = l.match(LEGACY)
    if (!m) return l
    const raw = m[2].trim()
    let nums: number[]
    if (SAME.test(raw)) {
      // "same PDF as above" points at one of the line above's sources when it can
      const want = /pdf/i.test(raw) ? /\.pdf/i : /form/i.test(raw) ? /forms?\b/i : /e-?mail/i.test(raw) ? /e-?mail/i : null
      const pick = want && !/sources/i.test(raw) ? prev.filter((n) => want.test(order[n - 1])) : []
      nums = pick.length ? pick : prev
    } else nums = raw.split(/\s+;\s+/).map((s) => idx(s.trim()))
    prev = nums
    return `${m[1]} ${nums.map((n) => `[${n}]`).join('')}`
  })
  return `${out.join('\n').replace(/\s+$/, '')}\n\nSources\n${order.map((s, i) => `[${i + 1}] ${s}`).join('\n')}`
}

export function parseCited(body: string | null | undefined): Cited {
  let b = body ?? ''
  if (!/^\s*\[\d+\]\s/m.test(b)) b = fromLegacy(b) ?? b
  const lines = b.split('\n')
  let h = -1
  for (let i = lines.length - 1; i >= 0; i--) if (HEAD.test(lines[i])) { h = i; break }
  if (h < 0) return { text: b, sources: [] }
  const rest = lines.slice(h + 1).filter((l) => l.trim())
  if (!rest.length || !rest.every((l) => LINE.test(l))) return { text: b, sources: [] }
  const sources = rest.map((l) => { const m = l.match(LINE)!; return describe(Number(m[1]), m[2]) })
  return { text: lines.slice(0, h).join('\n').replace(/\s+$/, ''), sources }
}

export function joinCited(text: string, sources: { n: number; text: string }[]): string {
  const t = text.replace(/\s+$/, '')
  const s = sources.filter((x) => x.text.trim())
  return s.length ? `${t}\n\nSources\n${s.map((x) => `[${x.n}] ${x.text.trim()}`).join('\n')}` : t
}

/** Splits a line into text and citation numbers, for drawing pills. */
export function splitCites(line: string): (string | number)[] {
  const parts: (string | number)[] = []
  const re = /\[(\d+)\]/g
  let last = 0, m: RegExpExecArray | null
  while ((m = re.exec(line))) { if (m.index > last) parts.push(line.slice(last, m.index)); parts.push(Number(m[1])); last = re.lastIndex }
  if (last < line.length) parts.push(line.slice(last))
  return parts
}

export const countSources = (body: string | null | undefined) => parseCited(body).sources.length
