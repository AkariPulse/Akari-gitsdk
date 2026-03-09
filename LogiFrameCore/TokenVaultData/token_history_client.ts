export interface TokenDataPoint {
  timestamp: number
  priceUsd: number
  volumeUsd: number
  marketCapUsd: number
}

export interface TokenDataFetcherConfig {
  apiBase: string
  apiKey?: string
  headers?: Record<string, string>
  timeoutMs?: number
  retries?: number
  retryBackoffMs?: number
}

export interface HistoryQuery {
  /**
   * Inclusive start time in ms since epoch
   */
  fromMs?: number
  /**
   * Exclusive end time in ms since epoch
   */
  toMs?: number
  /**
   * Optional candle interval hint the API might accept (e.g., '1m','5m','1h','1d')
   */
  interval?: string
  /**
   * Limit the number of points (if supported by API)
   */
  limit?: number
  /**
   * Optional quote currency parameter (if API supports, default USD)
   */
  quote?: string
  /**
   * External AbortSignal to cancel the request
   */
  signal?: AbortSignal
}

export class TokenDataFetcher {
  private readonly apiBase: string
  private readonly apiKey?: string
  private readonly headers: Record<string, string>
  private readonly timeoutMs: number
  private readonly retries: number
  private readonly retryBackoffMs: number

  constructor(cfg: TokenDataFetcherConfig) {
    this.apiBase = cfg.apiBase.replace(/\/+$/, "")
    this.apiKey = cfg.apiKey
    this.headers = { ...(cfg.headers ?? {}) }
    if (this.apiKey) this.headers["Authorization"] = `Bearer ${this.apiKey}`
    this.timeoutMs = cfg.timeoutMs ?? 15000
    this.retries = Math.max(0, Math.floor(cfg.retries ?? 2))
    this.retryBackoffMs = Math.max(0, Math.floor(cfg.retryBackoffMs ?? 500))
  }

  /**
   * Fetch an array of TokenDataPoint for the given token symbol.
   * Expected endpoint pattern: `${apiBase}/tokens/${symbol}/history`
   * Accepts optional query params if the API supports them.
   */
  async fetchHistory(symbol: string, query: HistoryQuery = {}): Promise<TokenDataPoint[]> {
    const url = this.buildUrl(symbol, query)
    const res = await this.fetchWithRetries(url, { headers: this.headers, signal: query.signal })
    const raw = (await this.safeJson(res)) as unknown

    if (!Array.isArray(raw)) {
      throw new Error("Unexpected response: expected an array")
    }

    const out: TokenDataPoint[] = []
    for (const r of raw) {
      const dp = this.mapPoint(r)
      if (dp) out.push(dp)
    }
    return out
  }

  private buildUrl(symbol: string, q: HistoryQuery): string {
    const params = new URLSearchParams()
    if (Number.isFinite(q.fromMs!)) params.set("from", String(q.fromMs))
    if (Number.isFinite(q.toMs!)) params.set("to", String(q.toMs))
    if (q.interval) params.set("interval", q.interval)
    if (Number.isFinite(q.limit!)) params.set("limit", String(q.limit))
    if (q.quote) params.set("quote", q.quote)

    const path = `/tokens/${encodeURIComponent(symbol)}/history`
    const base = `${this.apiBase}${path}`
    const qs = params.toString()
    return qs ? `${base}?${qs}` : base
  }

  private async fetchWithRetries(
    url: string,
    init: RequestInit & { signal?: AbortSignal }
  ): Promise<Response> {
    let attempt = 0
    let lastErr: unknown = undefined
    while (attempt <= this.retries) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const res = await fetch(url, {
          ...init,
          signal: init.signal
            ? this.anySignal(init.signal, controller.signal)
            : controller.signal,
        })
        clearTimeout(timer)
        if (!res.ok) {
          // Retry on 5xx; throw immediately on 4xx
          if (res.status >= 500 && res.status <= 599 && attempt < this.retries) {
            await this.delay(this.backoffDelay(attempt))
            attempt++
            continue
          }
          throw new Error(`HTTP ${res.status} ${res.statusText}`)
        }
        return res
      } catch (err) {
        clearTimeout(timer)
        // Abort immediately if caller's signal aborted
        if (init.signal?.aborted) throw err
        lastErr = err
        // Network errors: retry if attempts remain
        if (attempt < this.retries) {
          await this.delay(this.backoffDelay(attempt))
          attempt++
          continue
        }
        throw err
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("Request failed")
  }

  private anySignal(a: AbortSignal, b: AbortSignal): AbortSignal {
    if ((AbortSignal as any).any) {
      return (AbortSignal as any).any([a, b])
    }
    // Fallback: abort a new controller when either aborts
    const c = new AbortController()
    const onAbort = () => c.abort()
    if (a.aborted || b.aborted) {
      c.abort()
    } else {
      a.addEventListener("abort", onAbort, { once: true })
      b.addEventListener("abort", onAbort, { once: true })
    }
    return c.signal
  }

  private async safeJson(res: Response): Promise<unknown> {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error("Failed to parse JSON response")
    }
  }

  private mapPoint(raw: any): TokenDataPoint | null {
    // Accept common timestamp shapes:
    // - seconds epoch: r.time, r.timestamp, r.ts
    // - milliseconds epoch: r.timeMs, r.timestampMs
    // - ISO string: r.timeISO
    const ts =
      raw?.timeMs ??
      raw?.timestampMs ??
      (Number.isFinite(raw?.time) && raw.time > 1e12 ? raw.time : undefined) ??
      (Number.isFinite(raw?.timestamp) && raw.timestamp > 1e12 ? raw.timestamp : undefined) ??
      (Number.isFinite(raw?.ts) && raw.ts > 1e12 ? raw.ts : undefined) ??
      (Number.isFinite(raw?.time) ? raw.time * 1000 : undefined) ??
      (Number.isFinite(raw?.timestamp) ? raw.timestamp * 1000 : undefined) ??
      (Number.isFinite(raw?.ts) ? raw.ts * 1000 : undefined) ??
      (typeof raw?.timeISO === "string" ? Date.parse(raw.timeISO) : undefined)

    const price = this.toNumber(raw?.priceUsd ?? raw?.price_usd ?? raw?.price)
    const volume = this.toNumber(raw?.volumeUsd ?? raw?.volume_usd ?? raw?.volume)
    const mcap = this.toNumber(raw?.marketCapUsd ?? raw?.market_cap_usd ?? raw?.marketCap)

    if (!Number.isFinite(ts) || !Number.isFinite(price)) return null

    return {
      timestamp: ts,
      priceUsd: price,
      volumeUsd: Number.isFinite(volume) ? volume : 0,
      marketCapUsd: Number.isFinite(mcap) ? mcap : 0,
    }
  }

  private toNumber(v: unknown): number {
    if (typeof v === "number") return v
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v)
      return Number.isFinite(n) ? n : NaN
    }
    return NaN
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private backoffDelay(attempt: number): number {
    // linear backoff with jitter; keep it predictable and bounded
    const base = this.retryBackoffMs * (attempt + 1)
    const jitter = Math.floor(Math.random() * 200)
    return base + jitter
  }
}
