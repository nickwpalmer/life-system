import { fromKey } from '../lib/dates'

type Series = { label: string; color: string; values: (number | null)[] }

const W = 320, H = 130, PAD = { l: 22, r: 8, t: 10, b: 18 }

function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : ''
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]
    const cx = (x0 + x1) / 2
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`
  }
  return d
}

/** Smooth line chart; gaps (null) split a line into segments. */
export function LineChart({ days, series, min = 0, max }: { days: string[]; series: Series[]; min?: number; max?: number }) {
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null))
  const hi = max ?? Math.max(1, ...all)
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(1, days.length - 1)
  const y = (v: number) => PAD.t + (1 - (v - min) / (hi - min || 1)) * (H - PAD.t - PAD.b)
  const ticks = [min, (min + hi) / 2, hi]
  return (
    <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img">
      <defs>
        {series.map((s, i) => (
          <linearGradient id={`fill${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color={s.color} stop-opacity="0.25" />
            <stop offset="1" stop-color={s.color} stop-opacity="0" />
          </linearGradient>
        ))}
      </defs>
      {ticks.map((t) => (
        <g>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.06)" />
          <text x={PAD.l - 6} y={y(t) + 3} text-anchor="end">{Math.round(t * 10) / 10}</text>
        </g>
      ))}
      {[0, Math.floor((days.length - 1) / 2), days.length - 1].map((i) => (
        <text x={x(i)} y={H - 4} text-anchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}>
          {fromKey(days[i]).toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </text>
      ))}
      {series.map((s, si) => {
        const segs: [number, number][][] = []
        let cur: [number, number][] = []
        s.values.forEach((v, i) => {
          if (v == null) { if (cur.length) segs.push(cur); cur = [] } else cur.push([x(i), y(v)])
        })
        if (cur.length) segs.push(cur)
        return (
          <g>
            {segs.map((pts) => (
              <>
                {pts.length > 1 && <path d={`${smoothPath(pts)} L${pts[pts.length - 1][0]},${H - PAD.b} L${pts[0][0]},${H - PAD.b} Z`} fill={`url(#fill${si})`} />}
                <path class="line" d={smoothPath(pts)} stroke={s.color} style={`animation-delay:${si * 0.15}s`} />
                {pts.length === 1 && <circle cx={pts[0][0]} cy={pts[0][1]} r="3" fill={s.color} />}
              </>
            ))}
          </g>
        )
      })}
    </svg>
  )
}

export function BarChart({ days, values, color = '#c4b5fd', target }: { days: string[]; values: (number | null)[]; color?: string; target?: number | null }) {
  const hi = Math.max(1, target ?? 0, ...values.map((v) => v ?? 0))
  const n = days.length
  const bw = (W - PAD.l - PAD.r) / n
  const y = (v: number) => PAD.t + (1 - v / hi) * (H - PAD.t - PAD.b)
  return (
    <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img">
      <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="rgba(255,255,255,0.08)" />
      <text x={PAD.l - 6} y={y(hi) + 3} text-anchor="end">{Math.round(hi * 10) / 10}</text>
      {target != null && <line x1={PAD.l} x2={W - PAD.r} y1={y(target)} y2={y(target)} stroke="#fdba74" stroke-dasharray="3 4" opacity="0.6" />}
      {values.map((v, i) => v ? (
        <rect class="bar" x={PAD.l + i * bw + bw * 0.18} y={y(v)} width={bw * 0.64} height={H - PAD.b - y(v)} rx={Math.min(4, bw * 0.3)} fill={color} style={`animation-delay:${i * 0.02}s`} />
      ) : null)}
      {[0, n - 1].map((i) => (
        <text x={PAD.l + i * bw + bw / 2} y={H - 4} text-anchor={i === 0 ? 'start' : 'end'}>
          {fromKey(days[i]).toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </text>
      ))}
    </svg>
  )
}

/** One square per day, brighter = more. */
export function Heat({ values, color = '#fdba74' }: { values: (number | null)[]; color?: string }) {
  const hi = Math.max(1, ...values.map((v) => v ?? 0))
  return (
    <div class="heat">
      {values.map((v, i) => (
        <i style={`${v ? `background:${color};opacity:${0.25 + 0.75 * (v / hi)};` : ''}animation-delay:${i * 0.01}s`} title={v ? String(v) : ''} />
      ))}
    </div>
  )
}
