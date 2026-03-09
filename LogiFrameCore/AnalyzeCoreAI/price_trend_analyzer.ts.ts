export interface PricePoint {
  timestamp: number
  priceUsd: number
}

export interface TrendResult {
  startTime: number
  endTime: number
  trend: "upward" | "downward" | "neutral"
  changePct: number
}

export interface TrendOptions {
  /**
   * Minimum number of points per segment (inclusive)
   * Default: 5
   */
  minSegmentPoints?: number
  /**
   * Minimum absolute % change required to accept a segment
   * (e.g., 0.5 means 0.5%). Default: 0 (no threshold)
   */
  slopeThresholdPct?: number
  /**
   * If true, flat (0-direction) runs are merged into neighbors when possible
   * Default: true
   */
  mergeFlats?: boolean
  /**
   * If true, auto-sort points by ascending timestamp
   * Default: true
   */
  sortByTime?: boolean
}

/**
 * Backward-compatible overload:
 * - analyzePriceTrends(points, minSegmentLength)
 * - analyzePriceTrends(points, options)
 */
export function analyzePriceTrends(points: PricePoint[], minSegmentLength?: number): TrendResult[]
export function analyzePriceTrends(points: PricePoint[], options?: TrendOptions): TrendResult[]
export function analyzePriceTrends(
  points: PricePoint[],
  arg?: number | TrendOptions
): TrendResult[] {
  const opts: Required<TrendOptions> = normalizeOptions(arg)

  // sanitize & (optionally) sort
  const clean = points
    .filter(p => Number.isFinite(p.timestamp) && Number.isFinite(p.priceUsd))
    .map(p => ({ timestamp: Number(p.timestamp), priceUsd: Number(p.priceUsd) }))
  if (clean.length < opts.minSegmentPoints) return []

  if (opts.sortByTime) clean.sort((a, b) => a.timestamp - b.timestamp)

  // helpers
  const pct = (from: number, to: number) => ((to - from) / from) * 100
  const round2 = (n: number) => Math.round(n * 100) / 100
  const dirFrom = (prev: number, curr: number, thrPct: number) => {
    const change = pct(prev, curr)
    const absChange = Math.abs(change)
    if (absChange < thrPct) return 0
    return change > 0 ? 1 : -1
  }

  type Run = { start: number; end: number; dir: -1 | 0 | 1 }
  const runs: Run[] = []

  // build directional runs
  let startIdx = 0
  let currDir: -1 | 0 | 1 = 0
  for (let i = 1; i < clean.length; i++) {
    const prev = clean[i - 1].priceUsd
    const curr = clean[i].priceUsd
    const d = dirFrom(prev, curr, opts.slopeThresholdPct)

    if (i === 1) {
      currDir = d
    }

    const turningPoint = d !== 0 && currDir !== 0 && d !== currDir
    const atEnd = i === clean.length - 1

    // if direction flips, close previous run at i-1
    if (turningPoint) {
      runs.push({ start: startIdx, end: i - 1, dir: currDir })
      startIdx = i - 1
      currDir = d
    }

    // extend dir when currently flat and now got a non-flat
    if (currDir === 0 && d !== 0) {
      // close flat run before switching
      if (i - 1 > startIdx) runs.push({ start: startIdx, end: i - 1, dir: 0 })
      startIdx = i - 1
      currDir = d
    }

    // close at the end
    if (atEnd) {
      runs.push({ start: startIdx, end: i, dir: currDir })
    }
  }

  // optional: merge flats into neighbors for cleaner segments
  const merged: Run[] = []
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i]
    if (opts.mergeFlats && r.dir === 0) {
      const prev = merged[merged.length - 1]
      const next = runs[i + 1]
      // merge into previous if same direction as next or either neighbor exists
      if (prev && next && prev.dir !== 0 && next.dir === prev.dir) {
        // absorb flat into prev by extending its end to next.end
        prev.end = next.end
        i++ // skip next
        continue
      } else if (prev && prev.dir !== 0) {
        // absorb into prev only
        prev.end = r.end
        continue
      } else if (next && next.dir !== 0) {
        // absorb into next by shifting its start
        next.start = r.start
        continue
      } else {
        // isolated flat, push as-is
        merged.push(r)
      }
    } else {
      merged.push(r)
    }
  }

  // convert runs into TrendResult with minimum length & slope thresholds
  const results: TrendResult[] = []
  for (const r of merged) {
    const len = r.end - r.start + 1
    if (len < opts.minSegmentPoints) continue

    const a = clean[r.start]
    const b = clean[r.end]
    const change = pct(a.priceUsd, b.priceUsd)
    const absChange = Math.abs(change)

    if (absChange < opts.slopeThresholdPct && r.dir !== 0) {
      // below slope threshold: optionally keep as neutral if long enough
      results.push({
        startTime: a.timestamp,
        endTime: b.timestamp,
        trend: "neutral",
        changePct: round2(change),
      })
      continue
    }

    const trend: TrendResult["trend"] =
      r.dir === 1 ? "upward" : r.dir === -1 ? "downward" : "neutral"

    results.push({
      startTime: a.timestamp,
      endTime: b.timestamp,
      trend,
      changePct: round2(change),
    })
  }

  return results
}

function normalizeOptions(arg?: number | TrendOptions): Required<TrendOptions> {
  if (typeof arg === "number") {
    return {
      minSegmentPoints: Math.max(2, Math.floor(arg)),
      slopeThresholdPct: 0,
      mergeFlats: true,
      sortByTime: true,
    }
  }
  const o = arg ?? {}
  return {
    minSegmentPoints: Math.max(2, Math.floor(o.minSegmentPoints ?? 5)),
    slopeThresholdPct: Math.max(0, o.slopeThresholdPct ?? 0),
    mergeFlats: o.mergeFlats ?? true,
    sortByTime: o.sortByTime ?? true,
  }
}
