export interface LaunchConfig {
  contractName: string
  parameters: Record<string, unknown>
  deployEndpoint: string
  apiKey?: string
  /**
   * Optional default headers merged into each request
   */
  headers?: Record<string, string>
}

export interface LaunchResult {
  success: boolean
  address?: string
  transactionHash?: string
  error?: string
}

export interface DeployOptions {
  /**
   * Abort request externally
   */
  signal?: AbortSignal
  /**
   * Request timeout in ms (default 20000)
   */
  timeoutMs?: number
  /**
   * Number of retries on network/5xx (default 2)
   */
  retries?: number
  /**
   * Deterministic backoff between retries in ms (default 600)
   * Backoff used is base * (attempt + 1)
   */
  retryBackoffMs?: number
  /**
   * Optional idempotency key forwarded to server (via Idempotency-Key header)
   * Useful to avoid double-deploys on retries
   */
  idempotencyKey?: string
}

/**
 * Robust deployer for contract launches
 */
export class LaunchNode {
  constructor(private readonly config: LaunchConfig) {}

  /**
   * Backward-compatible call with no options
   */
  async deploy(): Promise<LaunchResult>
  async deploy(options: DeployOptions): Promise<LaunchResult>
  async deploy(options?: DeployOptions): Promise<LaunchResult> {
    const { deployEndpoint, apiKey, contractName, parameters, headers } = this.config

    const opts: Required<Omit<DeployOptions, "signal" | "idempotencyKey">> & {
      signal?: AbortSignal
      idempotencyKey?: string
    } = {
      timeoutMs: options?.timeoutMs ?? 20000,
      retries: Math.max(0, Math.floor(options?.retries ?? 2)),
      retryBackoffMs: Math.max(0, Math.floor(options?.retryBackoffMs ?? 600)),
      signal: options?.signal,
      idempotencyKey: options?.idempotencyKey,
    }

    const body = JSON.stringify({ contractName, parameters })
    const mergedHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...(headers ?? {}),
    }
    if (opts.idempotencyKey) mergedHeaders["Idempotency-Key"] = opts.idempotencyKey

    try {
      const res = await this.fetchWithRetries(
        deployEndpoint,
        {
          method: "POST",
          headers: mergedHeaders,
          body,
          signal: opts.signal,
        },
        opts
      )

      if (!res.ok) {
        const text = await this.safeText(res)
        return { success: false, error: `HTTP ${res.status}: ${text}` }
      }

      const json = await this.safeJson(res)
      const address = this.pickString(json, ["contractAddress", "address"])
      const txHash = this.pickString(json, ["txHash", "transactionHash", "tx"])

      return {
        success: true,
        address,
        transactionHash: txHash,
      }
    } catch (err: any) {
      return { success: false, error: err?.message ?? String(err) }
    }
  }

  // ————— internals —————

  private async fetchWithRetries(
    url: string,
    init: RequestInit & { signal?: AbortSignal },
    opts: { timeoutMs: number; retries: number; retryBackoffMs: number; signal?: AbortSignal }
  ): Promise<Response> {
    let attempt = 0
    let lastErr: unknown

    while (attempt <= opts.retries) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs)

      try {
        const res = await fetch(url, {
          ...init,
          signal: init.signal ? this.anySignal(init.signal, controller.signal) : controller.signal,
        })
        clearTimeout(timer)

        if (!res.ok && res.status >= 500 && res.status <= 599 && attempt < opts.retries) {
          await this.delay(opts.retryBackoffMs * (attempt + 1))
          attempt++
          continue
        }

        return res
      } catch (err) {
        clearTimeout(timer)
        if (init.signal?.aborted) throw err
        lastErr = err
        if (attempt < opts.retries) {
          await this.delay(opts.retryBackoffMs * (attempt + 1))
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

  private async safeText(res: Response): Promise<string> {
    try {
      return await res.text()
    } catch {
      return ""
    }
  }

  private async safeJson(res: Response): Promise<any> {
    const text = await this.safeText(res)
    try {
      return JSON.parse(text)
    } catch {
      // return minimal structure so pickString can still work if server returns plain text
      return { raw: text }
    }
  }

  private pickString(obj: any, keys: string[]): string | undefined {
    for (const k of keys) {
      const v = obj?.[k]
      if (typeof v === "string" && v.length > 0) return v
    }
    return undefined
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
