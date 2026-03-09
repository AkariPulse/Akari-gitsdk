export interface VolumePoint {
  timestamp: number
  volumeUsd: number
}

export interface SpikeEvent {
  timestamp: number
  volume: number
  spikeRatio: number
  zScore?: number
  windowMean?: number
  windowStd?: number
}

export interface SpikeOptions {
  /**
   * Rolling window size used for mean/std computation
   * Default: 10
   */
  windowSize?: number
  /**
   * Minimum ratio (curr / avg) to qualify as a spike
   * Default: 2.0
   */
  spikeThreshold?: number
  /**
   * Optional z-score threshold to reduce false positives
   * If provided, event must satisfy BOTH ratio and z-score
   * Default: undefined (not applied)
   */
  zScoreThreshold?: number
  /**
   * Minimum absolute volume to consider
   * Default: 0 (no floor)
   */
  minAbsVolume?: number
  /**
   * Minimum time (ms) between spikes to avoid back-to-back duplicates
   * Default: 0 (no cooldown)
   */
  cooldownMs?: number
  /**
   * If true, auto-sort points by ascending timestamp
   * Default: true
   */
  sortByTime?: boolean
}

/**
 * Backward-compatible overloads:
 * - detectVolumeSpikes(points, windowSize?, spikeThreshold?)
 * - detectVolumeSpikes(points, options)
 */
export function detectVolumeSpikes(
  points: VolumePoint[],
  windowSize?: number,
  spikeThreshold?: number
): SpikeEvent[]
export function detectVolumeSpikes(
  points: VolumePoint[],
  options?: SpikeOptions
): SpikeEvent[]
export function detectVolumeSpikes(
  points: VolumePoint[],
  arg?: number | SpikeOptions,
  spikeThresholdArg?: number
): SpikeEvent[] {
  const opts = normalizeOptions(arg, spikeThresholdArg)

  // sanitize & (optionally) sort
  const clean = points
    .filter(p => Number.isFinite(p.timestamp) && Number.isFinite(p.volumeUsd))
    .map(p => ({ timestamp: Number(p.timestamp), volumeUsd: Number(p.volumeUsd) }))

  if (opts.sortByTime) clean.sort((a, b) => a.timestamp - b.timestamp)
  if (clean.length === 0 || opts.windowSize <= 1) return []

  // rolling window stats without re-slicing arrays (O(n))
  const w = opts.windowSize
  const queue: number[] = []
  let sum = 0
  let sumSq = 0

  // prime the window with the first w values (excluding index w where we start testing)
  for (let i = 0; i < Math.min(w, clean.length); i++) {
    const v = clean[i].volumeUsd
    queue.push(v)
    sum += v
    sumSq += v * v
  }

  const events: SpikeEvent[] = []
  let lastSpikeTs = -Infinity

  for (let i = w; i < clean.length; i++) {
    // compute stats on window [i-w, i)
    const mean = sum / w
    const variance = Math.max(0, sumSq / w - mean * mean) // population variance
    const std = Math.sqrt(variance)

    const curr = clean[i].volumeUsd
    const ratio = mean > 0 ? curr / mean : Number.POSITIVE_INFINITY
    const z = std > 0 ? (curr - mean) / std : undefined

    const ratioOk = ratio >= opts.spikeThreshold
    const zOk = opts.zScoreThreshold === undefined ? true : (z ?? -Infinity) >= opts.zScoreThreshold
    const absOk = curr >= opts.minAbsVolume
    const cooldownOk = clean[i].timestamp - lastSpikeTs >= opts.cooldownMs

    if (ratioOk && zOk && absOk && cooldownOk) {
      events.push({
        timestamp: clean[i].timestamp,
        volume: curr,
        spikeRatio: round2(ratio),
        zScore: z !== undefined ? round2(z) : undefined,
        windowMean: round2(mean),
        windowStd: round2(std),
      })
      lastSpikeTs = clean[i].timestamp
    }

    // slide window forward by removing clean[i - w] and adding clean[i]
    const exiting = queue.shift()!
    sum -= exiting
    sumSq -= exiting * exiting

    queue.push(curr)
    sum += curr
    sumSq += curr * curr
  }

  return events
}

function normalizeOptions(arg?: number | SpikeOptions, spikeThresholdArg?: number): Required<SpikeOptions> {
  if (typeof arg === "number") {
    return {
      windowSize: Math.max(2, Math.floor(arg)),
      spikeThreshold: spikeThresholdArg ?? 2.0,
      zScoreThreshold: undefined,
      minAbsVolume: 0,
      cooldownMs: 0,
      sortByTime: true,
    }
  }
  const o = arg ?? {}
  return {
    windowSize: Math.max(2, Math.floor(o.windowSize ?? 10)),
    spikeThreshold: o.spikeThreshold ?? 2.0,
    zScoreThreshold: o.zScoreThreshold,
    minAbsVolume: o.minAbsVolume ?? 0,
    cooldownMs: Math.max(0, Math.floor(o.cooldownMs ?? 0)),
    sortByTime: o.sortByTime ?? true,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
