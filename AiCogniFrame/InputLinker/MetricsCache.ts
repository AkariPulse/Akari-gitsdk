export interface MetricEntry {
  key: string
  value: number
  updatedAt: number
}

export class ElarisMetricsCache {
  private readonly cache = new Map<string, MetricEntry>()

  get(key: string): MetricEntry | undefined {
    return this.cache.get(key)
  }

  set(key: string, value: number): void {
    this.cache.set(key, { key, value, updatedAt: Date.now() })
  }

  hasRecent(key: string, maxAgeMs: number): boolean {
    const entry = this.cache.get(key)
    return entry !== undefined && Date.now() - entry.updatedAt < maxAgeMs
  }

  invalidate(key: string): void {
    this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  entries(): MetricEntry[] {
    return [...this.cache.values()]
  }

  keys(): string[] {
    return [...this.cache.keys()]
  }

  values(): number[] {
    return [...this.cache.values()].map(e => e.value)
  }

  size(): number {
    return this.cache.size
  }

  /** Removes all entries older than given maxAgeMs */
  prune(maxAgeMs: number): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.updatedAt > maxAgeMs) {
        this.cache.delete(key)
      }
    }
  }
}
