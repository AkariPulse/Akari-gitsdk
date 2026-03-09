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
  /** Rolling window size for mean/std (default 10) */
  windowSize?: number
  /** Minimum ratio (curr / mean) to qualify (default 2.0) */
  spikeThreshold?: number
  /** Optional z-score threshold; if set, BOTH ratio and z must pass */
  zScoreThreshold?: number
  /** Floor on absolute volume (default 0) */
  minAbsVolume?: number
  /** Minimum time between spikes in ms to avoid duplicates (default 0) */
  cooldownMs?: number
  /** Auto-sort by timestamp ascending (default true) */
  sortByTime?: boolean
}

// Overloads for backward compatibility:
// - detectVolumeSpikes(points, windowSize?, spikeThreshold?)
// - detectVolumeSpikes(points, options)
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

  // sanitize and optionally sort
  const clean = points
    .filter(p => Number.isFinite(p.timestamp) && Number.isFinite(p.volumeUsd))
    .map(p => ({ timestamp: Number(p.timestamp), volumeUsd: Number(p.volumeUsd) }))

  if (opts.sortByTime) clean.sort((a, b) => a.timestamp - b.timestamp)
  if (clean.length === 0 || opts.windowSize <= 1) return []

  const w = opts.windowSize
  const events: SpikeEvent[] = []

  // rolling window sums (deterministic, O(n))
  const queue: number[] = []
  let sum = 0
  let sumSq = 0

  // seed the window [0, w)
  for (let i = 0; i < Math.min(w, clean.length); i++) {
    const v = clean[i].volumeUsd
    queue.push(v)
    sum += v
    sumSq += v * v
  }

  let lastSpikeTs = -Infinity

  for (let i = w; i < clean.length; i++) {
    // stats for previous window [i-w, i)
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

    // slide window forward deterministically: remove i-w, add i
    const exiting = queue.shift()!
    sum -= exiting
    sumSq -= exiting * exiting

    const enter = curr
    queue.push(enter)
    sum += enter
    sumSq += enter * enter
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
