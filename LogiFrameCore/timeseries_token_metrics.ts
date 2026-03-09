export interface PricePoint {
  timestamp: number
  price: number
}

export interface TokenMetrics {
  averagePrice: number
  volatility: number      // standard deviation
  maxPrice: number
  minPrice: number
}

export interface TokenAnalysisOptions {
  /**
   * If true, use sample standard deviation (n-1)
   * Default: false (population std dev, n)
   */
  sampleStd?: boolean
  /**
   * If true, auto-sort by timestamp ascending before analysis
   * Default: false (analysis order-agnostic for mean/std)
   */
  sortByTime?: boolean
}

type StatsCache = {
  computed: boolean
  count: number
  mean: number
  m2: number            // sum of squares of diffs from the current mean
  max: number
  min: number
}

export class TokenAnalysisCalculator {
  private readonly data: PricePoint[]
  private readonly sampleStd: boolean
  private cache: StatsCache = {
    computed: false,
    count: 0,
    mean: 0,
    m2: 0,
    max: -Infinity,
    min: Infinity,
  }

  constructor(data: PricePoint[], opts: TokenAnalysisOptions = {}) {
    // sanitize & (optionally) sort
    const clean = data
      .filter(p => Number.isFinite(p.timestamp) && Number.isFinite(p.price))
      .map(p => ({ timestamp: Number(p.timestamp), price: Number(p.price) }))
    if (opts.sortByTime) clean.sort((a, b) => a.timestamp - b.timestamp)
    this.data = clean
    this.sampleStd = opts.sampleStd ?? false
  }

  private ensureComputed(): void {
    if (this.cache.computed) return
    const c = this.cache
    if (this.data.length === 0) {
      // keep defaults: mean=0, m2=0, max=-Inf, min=+Inf
      c.computed = true
      return
    }

    // Welford's online algorithm for numeric stability
    let n = 0
    let mean = 0
    let m2 = 0
    let max = -Infinity
    let min = Infinity

    for (const { price } of this.data) {
      n += 1
      const delta = price - mean
      mean += delta / n
      const delta2 = price - mean
      m2 += delta * delta2
      if (price > max) max = price
      if (price < min) min = price
    }

    c.count = n
    c.mean = mean
    c.m2 = m2
    c.max = max
    c.min = min
    c.computed = true
  }

  getAveragePrice(): number {
    this.ensureComputed()
    return this.cache.count > 0 ? this.cache.mean : 0
  }

  /**
   * Returns standard deviation
   * - population (n) by default
   * - sample (n-1) if constructed with { sampleStd: true }
   */
  getVolatility(): number {
    this.ensureComputed()
    const n = this.cache.count
    if (n === 0) return 0
    if (this.sampleStd) {
      if (n < 2) return 0
      return Math.sqrt(this.cache.m2 / (n - 1))
    }
    return Math.sqrt(this.cache.m2 / n)
  }

  getMaxPrice(): number {
    this.ensureComputed()
    if (this.cache.count === 0) return 0
    return this.cache.max
  }

  getMinPrice(): number {
    this.ensureComputed()
    if (this.cache.count === 0) return 0
    return this.cache.min
  }

  computeMetrics(): TokenMetrics {
    // Ensures single-pass stats are ready and returns a cohesive snapshot
    this.ensureComputed()
    return {
      averagePrice: this.getAveragePrice(),
      volatility: this.getVolatility(),
      maxPrice: this.getMaxPrice(),
      minPrice: this.getMinPrice(),
    }
  }
}
