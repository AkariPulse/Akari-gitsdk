/**
 * Detect volume‐based patterns in a series of activity amounts.
 */
export interface PatternMatch {
  index: number
  window: number
  average: number
}

export interface PatternOptions {
  /** Window size (required when using the options form) */
  windowSize: number
  /** Threshold to compare against (required when using the options form) */
  threshold: number
  /** Require the window's last value to be at least this amount (default 0) */
  minAbs?: number
  /** If true, use median instead of mean (slower) */
  useMedian?: boolean
  /** Rounding precision for output "average" (default 4) */
  precision?: number
}

/**
 * Backward-compatible overloads:
 * - detectVolumePatterns(volumes, windowSize, threshold)
 * - detectVolumePatterns(volumes, { windowSize, threshold, ... })
 */
export function detectVolumePatterns(
  volumes: number[],
  windowSize: number,
  threshold: number
): PatternMatch[]
export function detectVolumePatterns(
  volumes: number[],
  options: PatternOptions
): PatternMatch[]
export function detectVolumePatterns(
  volumes: number[],
  arg1: number | PatternOptions,
  arg2?: number
): PatternMatch[] {
  const { ws, thr, minAbs, useMedian, precision } = parseOptions(arg1, arg2)

  // sanitize inputs to finite numbers; non-finite -> 0
  const data = volumes.map(v => (Number.isFinite(v) ? Number(v) : 0))
  const n = data.length
  if (ws <= 0 || ws > n) return []

  const matches: PatternMatch[] = []

  if (useMedian) {
    // slower path: O(n * ws log ws)
    for (let i = 0; i + ws <= n; i++) {
      const window = data.slice(i, i + ws)
      const stat = median(window)
      if (stat >= thr && (minAbs <= 0 || data[i + ws - 1] >= minAbs)) {
        matches.push({ index: i, window: ws, average: round(stat, precision) })
      }
    }
    return matches
  }

  // fast rolling mean: O(n)
  let sum = 0
  for (let i = 0; i < ws; i++) sum += data[i]
  for (let i = 0; i + ws <= n; i++) {
    const avg = sum / ws
    if (avg >= thr && (minAbs <= 0 || data[i + ws - 1] >= minAbs)) {
      matches.push({ index: i, window: ws, average: round(avg, precision) })
    }
    if (i + ws < n) {
      sum += data[i + ws]
      sum -= data[i]
    }
  }

  return matches
}

/* -------------------- helpers -------------------- */

function parseOptions(arg1: number | PatternOptions, arg2?: number) {
  if (typeof arg1 === "number") {
    const ws = Math.max(1, Math.floor(arg1))
    const thr = Number(arg2 ?? 0)
    return { ws, thr, minAbs: 0, useMedian: false, precision: 4 }
  }
  const opts = arg1
  const ws = Math.max(1, Math.floor(opts.windowSize))
  const thr = Number(opts.threshold)
  const minAbs = Number.isFinite(opts.minAbs) ? (opts.minAbs as number) : 0
  const useMedian = Boolean(opts.useMedian)
  const precision = Number.isFinite(opts.precision) ? Math.max(0, Math.floor(opts.precision!)) : 4
  return { ws, thr, minAbs, useMedian, precision }
}

function median(arr: number[]): number {
  const a = arr.slice().sort((x, y) => x - y)
  const m = a.length >> 1
  return a.length % 2 === 1 ? a[m] : (a[m - 1] + a[m]) / 2
}

function round(n: number, precision: number): number {
  const f = Math.pow(10, precision)
  return Math.round(n * f) / f
}
