export interface Order {
  price: number
  size: number
}

export interface DepthMetrics {
  averageBidDepth: number
  averageAskDepth: number
  spread: number
}

type RawOrder = { price?: number | string; size?: number | string } | [number | string, number | string]

interface AnalyzerConfig {
  headers?: Record<string, string>
  apiKey?: string
  timeoutMs?: number
  retries?: number
  retryBackoffMs?: number
}

export class TokenDepthAnalyzer {
  private readonly rpcEndpoint: string
  private readonly marketId: string
  private readonly headers: Record<string, string>
  private readonly timeoutMs: number
  private readonly retries: number
  private readonly retryBackoffMs: number

  constructor(rpcEndpoint: string, marketId: string, config: AnalyzerConfig = {}) {
    this.rpcEndpoint = rpcEndpoint.replace(/\/+$/, "")
    this.marketId = marketId
    this.headers = { ...(config.headers ?? {}) }
    if (config.apiKey) this.headers["Authorization"] = `Bearer ${config.apiKey}`
    this.timeoutMs = config.timeoutMs ?? 15000
    this.retries = Math.max(0, Math.floor(config.retries ?? 2))
    this.retryBackoffMs = Math.max(0, Math.floor(config.retryBackoffMs ?? 400))
  }

  async fetchOrderbook(depth = 50, opts?: { signal?: AbortSignal }): Promise<{ bids: Order[]; asks: Order[] }> {
    const url = `${this.rpcEndpoint}/orderbook/${encodeURIComponent(this.marketId)}?depth=${encodeURIComponent(
      String(depth)
    )}`
    const res = await this.fetchWithRetries(url, { headers: this.headers, signal: opts?.signal })
    if (!res.ok) throw new Error(`Orderbook fetch failed: HTTP ${res.status}`)
    const json = (await this.safeJson(res)) as any

    // Accept common shapes: { bids: Array<RawOrder>, asks: Array<RawOrder> }
    const rawBids: RawOrder[] = Array.isArray(json?.bids) ? json.bids : []
    const rawAsks: RawOrder[] = Array.isArray(json?.asks) ? json.asks : []

    const bids = this.normalizeSide(rawBids).sort((a, b) => b.price - a.price) // highest first
    const asks = this.normalizeSide(rawAsks).sort((a, b) => a.price - b.price) // lowest first

    return { bids, asks }
  }

  async analyze(depth = 50, opts?: { signal?: AbortSignal }): Promise<DepthMetrics> {
    const { bids, asks } = await this.fetchOrderbook(depth, opts)
    const avg = (arr: Order[]) => {
      if (arr.length === 0) return 0
      let sum = 0
      for (let i = 0; i < arr.length; i++) sum += arr[i].size
      return sum / arr.length
    }

    // Best bid = max bid price; best ask = min ask price (data may not be presorted)
    const bestBid = bids.length ? bids[0].price : 0
    const bestAsk = asks.length ? asks[0].price : 0
    const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0

    return {
      averageBidDepth: avg(bids),
      averageAskDepth: avg(asks),
      spread,
    }
  }

  // ——— internals ———

  private normalizeSide(side: RawOrder[]): Order[] {
    const out: Order[] = []
    for (const entry of side) {
      let price: number | undefined
      let size: number | undefined
      if (Array.isArray(entry) && entry.length >= 2) {
        price = this.toNumber(entry[0])
        size = this.toNumber(entry[1])
      } else if (entry && typeof entry === "object") {
        price = this.toNumber((entry as any).price)
        size = this.toNumber((entry as any).size)
      }
      if (Number.isFinite(price) && Number.isFinite(size) && price! > 0 && size! >= 0) {
        out.push({ price: price!, size: size! })
      }
    }
    return out
  }

  private toNumber(v: unknown): number | undefined {
    if (typeof v === "number") return v
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v)
      return Number.isFinite(n) ? n : undefined
    }
    return undefined
  }

  private async fetchWithRetries(
    url: string,
    init: RequestInit & { signal?: AbortSignal }
  ): Promise<Response> {
    let attempt = 0
    let lastErr: unknown
    while (attempt <= this.retries) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const res = await fetch(url, {
          ...init,
          signal: init.signal ? this.anySignal(init.signal, controller.signal) : controller.signal,
        })
        clearTimeout(timer)
        if (!res.ok && res.status >= 500 && attempt < this.retries) {
          await this.delay(this.retryBackoffMs * (attempt + 1))
          attempt++
          continue
        }
        return res
      } catch (err) {
        clearTimeout(timer)
        lastErr = err
        if (init.signal?.aborted) throw err
        if (attempt < this.retries) {
          await this.delay(this.retryBackoffMs * (attempt + 1))
          attempt++
          continue
        }
        throw err
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("Request failed")
  }

  private anySignal(a: AbortSignal, b: AbortSignal): AbortSignal {
    if ((AbortSignal as any).any) return (AbortSignal as any).any([a, b])
    const c = new AbortController()
    const onAbort = () => c.abort()
    if (a.aborted || b.aborted) c.abort()
    else {
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

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
