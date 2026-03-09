export interface PairInfo {
  exchange: string
  pairAddress: string
  baseSymbol: string
  quoteSymbol: string
  liquidityUsd: number
  volume24hUsd: number
  priceUsd: number
}

export type PairRaw = unknown

export interface DexApiConfig {
  name: string
  baseUrl: string
  apiKey?: string
  headers?: Record<string, string>
  pairPath?: (pairAddress: string) => string
  mapPair?: (raw: PairRaw, ctx: { api: DexApiConfig; pairAddress: string }) => PairInfo
}

export interface DexSuiteConfig {
  apis: DexApiConfig[]
  timeoutMs?: number
}

export class DexSuite {
  constructor(private readonly config: DexSuiteConfig) {}

  private buildUrl(base: string, path: string): string {
    const hasSlash = base.endsWith("/")
    const needsSlash = !path.startsWith("/")
    return hasSlash && needsSlash ? `${base}${path}` : hasSlash || needsSlash ? `${base}${path}` : `${base}/${path}`
  }

  private buildHeaders(api: DexApiConfig): Record<string, string> {
    const h: Record<string, string> = { ...(api.headers ?? {}) }
    if (api.apiKey) h["Authorization"] = `Bearer ${api.apiKey}`
    return h
  }

  private async fetchFromApi<T>(api: DexApiConfig, path: string, timeoutMs = this.config.timeoutMs ?? 10000): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(this.buildUrl(api.baseUrl, path), {
        headers: this.buildHeaders(api),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`${api.name} ${path} HTTP ${res.status}`)
      return (await res.json()) as T
    } finally {
      clearTimeout(timer)
    }
  }

  private toNumber(v: unknown): number {
    if (typeof v === "number") return v
    if (typeof v === "string" && v.trim() !== "") return Number(v)
    return NaN
  }

  private defaultMapPair(raw: any, ctx: { api: DexApiConfig; pairAddress: string }): PairInfo {
    const base = raw?.token0 ?? raw?.base ?? {}
    const quote = raw?.token1 ?? raw?.quote ?? {}
    const liquidityUsd = this.toNumber(raw?.liquidityUsd ?? raw?.liquidity_usd ?? raw?.liquidityUSD)
    const volume24hUsd = this.toNumber(raw?.volume24hUsd ?? raw?.volume_24h_usd ?? raw?.volume24USD)
    const priceUsd = this.toNumber(raw?.priceUsd ?? raw?.price_usd ?? raw?.price)
    return {
      exchange: ctx.api.name,
      pairAddress: ctx.pairAddress,
      baseSymbol: String(base?.symbol ?? base?.ticker ?? "BASE"),
      quoteSymbol: String(quote?.symbol ?? quote?.ticker ?? "QUOTE"),
      liquidityUsd: Number.isFinite(liquidityUsd) ? liquidityUsd : 0,
      volume24hUsd: Number.isFinite(volume24hUsd) ? volume24hUsd : 0,
      priceUsd: Number.isFinite(priceUsd) ? priceUsd : 0,
    }
  }

  /**
   * Retrieve aggregated pair info across all configured DEX APIs
   */
  async getPairInfo(pairAddress: string): Promise<PairInfo[]> {
    const tasks = this.config.apis.map(async api => {
      const path = api.pairPath ? api.pairPath(pairAddress) : `/pair/${encodeURIComponent(pairAddress)}`
      try {
        const raw = await this.fetchFromApi<PairRaw>(api, path)
        const info = (api.mapPair ?? this.defaultMapPair)(raw as any, { api, pairAddress })
        // basic sanity guard
        if (!info.baseSymbol || !info.quoteSymbol) throw new Error("invalid mapping")
        return info
      } catch {
        return undefined
      }
    })

    const settled = await Promise.all(tasks)
    return settled.filter((x): x is PairInfo => Boolean(x))
  }

  /**
   * Compare a list of pairs across exchanges, returning the best volume and liquidity.
   * Addresses with no successful data are omitted from the result map.
   */
  async comparePairs(
    pairs: string[]
  ): Promise<Record<string, { bestVolume: PairInfo; bestLiquidity: PairInfo }>> {
    const entries = await Promise.all(
      pairs.map(async addr => {
        const infos = await this.getPairInfo(addr)
        if (infos.length === 0) return undefined

        const bestVolume = this.pickMax(infos, i => i.volume24hUsd)
        const bestLiquidity = this.pickMax(infos, i => i.liquidityUsd)
        if (!bestVolume || !bestLiquidity) return undefined

        return [addr, { bestVolume, bestLiquidity }] as const
      })
    )

    const valid = entries.filter((e): e is [string, { bestVolume: PairInfo; bestLiquidity: PairInfo }] => Boolean(e))
    return Object.fromEntries(valid)
  }

  private pickMax<T>(arr: T[], sel: (v: T) => number): T | undefined {
    if (arr.length === 0) return undefined
    let best = arr[0]
    let bestVal = sel(best)
    for (let i = 1; i < arr.length; i++) {
      const v = sel(arr[i])
      if (v > bestVal) {
        best = arr[i]
        bestVal = v
      }
    }
    return best
  }
}
