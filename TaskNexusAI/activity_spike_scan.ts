export interface VolumePoint {
  timestamp: number
  volumeUsd: number
}

export interface SpikeEvent {
  timestamp: number
  volume: number
  spikeRatio: number
}

export interface SpikeOptions {
  /** Rolling window size for the baseline mean/std (default 10) */
  windowSize?: number
  /** Minimum ratio (current / mean) to qualify (default 2.0) */
  spikeThreshold?: number
  /** If set, require z-score >= this value in addition to the ratio (optional) */
  zScoreThreshold?: number
  /** Minimum absolute volume required to count as a spike (default 0) */
  minAbsVolume?: number
  /** Cooldown between spikes in ms to avoid back-to-back duplicates (default 0) */
  cooldownMs?: number
  /** Sort points by timestamp ascending before detection (default true) */
  sortByTime?: boolean
  /** Rounding precision for spikeRatio (default 2) */
  precision?: number
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
  const data = points
    .filter(p => Number.isFinite(p.timestamp) && Number.isFinite(p.volumeUsd))
    .map(p => ({ timestamp: Number(p.timestamp), volumeUsd: Number(p.volumeUsd) }))

  if (opts.sortByTime) data.sort((a, b) => a.timestamp - b.timestamp)
  const n = data.length
  const w = opts.windowSize
  if (n === 0 || w <= 1 || w > n) return []

  // seed window [0, w)
  let sum = 0
  let sumSq = 0
  for (let i = 0; i < w; i++) {
    const v = data[i].volumeUsd
    sum += v
    sumSq += v * v
  }

  const events: SpikeEvent[] = []
  let lastSpikeTs = -Infinity

  for (let i = w; i < n; i++) {
    // baseline from [i-w, i)
    const mean = sum / w
    const variance = Math.max(0, sumSq / w - mean * mean)
    const std = Math.sqrt(variance)

    const curr = data[i].volumeUsd
    const ratio =
      mean > 0 ? curr / mean : (curr > 0 ? Number.POSITIVE_INFINITY : 1)

    const z = std > 0 ? (curr - mean) / std : undefined

    const ratioOk = ratio >= opts.spikeThreshold
    const zOk = opts.zScoreThreshold === undefined ? true : (z ?? -Infinity) >= opts.zScoreThreshold
    const absOk = curr >= opts.minAbsVolume
    const cooldownOk = data[i].timestamp - lastSpikeTs >= opts.cooldownMs

    if (ratioOk && zOk && absOk && cooldownOk) {
      events.push({
        timestamp: data[i].timestamp,
        volume: curr,
        spikeRatio: round(ratio, opts.precision),
      })
      lastSpikeTs = data[i].timestamp
    }

    // slide window: include current, drop oldest
    const old = data[i - w].volumeUsd
    sum += curr - old
    sumSq += curr * curr - old * old
  }

  return events
}

/* -------------------- helpers -------------------- */

function normalizeOptions(arg?: number | SpikeOptions, spikeThresholdArg?: number): Required<SpikeOptions> {
  if (typeof arg === "number") {
    return {
      windowSize: Math.max(2, Math.floor(arg)),
      spikeThreshold: spikeThresholdArg ?? 2.0,
      zScoreThreshold: undefined,
      minAbsVolume: 0,
      cooldownMs: 0,
      sortByTime: true,
      precision: 2,
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
    precision: Math.max(0, Math.floor(o.precision ?? 2)),
  }
}

function round(n: number, precision: number): number {
  if (!Number.isFinite(n)) return n
  const f = Math.pow(10, precision)
  return Math.round(n * f) / f
}
