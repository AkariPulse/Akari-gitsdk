import type { TokenDataPoint } from "./tokenDataFetcher"
import { TokenDataFetcher, type HistoryQuery } from "./tokenDataFetcher"

export interface DataIframeConfig {
  /** Element id where the iframe will be appended */
  containerId: string
  /** Full URL to the embedded app/page (render target) */
  iframeUrl: string
  /** Expected origin for postMessage security, e.g. "https://app.elaris.ai" */
  targetOrigin: string
  /** API base for fetching token history (separate from iframeUrl) */
  apiBase: string
  /** Token symbol to fetch */
  token: string
  /** Optional polling interval in ms */
  refreshMs?: number
  /** Optional query params for history endpoint (from/to/interval/limit/quote) */
  historyQuery?: HistoryQuery
  /** Auto-resize iframe height to its container’s clientHeight (default: false) */
  autoResize?: boolean
  /** Optional extra headers for API calls */
  headers?: Record<string, string>
  /** Optional Authorization bearer token for API */
  apiKey?: string
}

export class TokenDataIframeEmbedder {
  private iframe?: HTMLIFrameElement
  private fetcher: TokenDataFetcher
  private refreshTimer?: number
  private resizeObs?: ResizeObserver
  private isInitialized = false
  private lastSentAt = 0
  private inFlight?: AbortController

  constructor(private cfg: DataIframeConfig) {
    this.fetcher = new TokenDataFetcher({
      apiBase: cfg.apiBase,
      apiKey: cfg.apiKey,
      headers: cfg.headers,
    })
  }

  /**
   * Mounts the iframe and starts periodic data posting if refreshMs is set
   */
  async init(): Promise<void> {
    if (this.isInitialized) return
    const container = document.getElementById(this.cfg.containerId)
    if (!container) throw new Error(`Container not found: ${this.cfg.containerId}`)

    const iframe = document.createElement("iframe")
    iframe.src = this.cfg.iframeUrl
    iframe.style.border = "none"
    iframe.style.width = "100%"
    iframe.style.height = "100%"
    iframe.setAttribute("referrerpolicy", "no-referrer")
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin")
    iframe.onload = () => {
      // First push once loaded
      void this.postTokenData()
    }
    container.appendChild(iframe)
    this.iframe = iframe

    if (this.cfg.autoResize) {
      this.resizeObs = new ResizeObserver(entries => {
        for (const e of entries) {
          if (e.target === container && this.iframe) {
            const h = (e.target as HTMLElement).clientHeight
            this.iframe.style.height = `${h}px`
          }
        }
      })
      this.resizeObs.observe(container)
    }

    if (Number.isFinite(this.cfg.refreshMs) && (this.cfg.refreshMs as number) > 0) {
      this.refreshTimer = window.setInterval(() => {
        void this.postTokenData()
      }, this.cfg.refreshMs as number)
    }

    this.isInitialized = true
  }

  /**
   * Clean up timers, observers, and remove the iframe
   */
  destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = undefined
    }
    if (this.resizeObs) {
      this.resizeObs.disconnect()
      this.resizeObs = undefined
    }
    if (this.inFlight) {
      this.inFlight.abort()
      this.inFlight = undefined
    }
    if (this.iframe?.parentElement) {
      this.iframe.parentElement.removeChild(this.iframe)
    }
    this.iframe = undefined
    this.isInitialized = false
  }

  /**
   * Fetch latest token history and post to the iframe window
   */
  async postTokenData(): Promise<void> {
    if (!this.iframe?.contentWindow) return
    // prevent overlapping requests
    if (this.inFlight) this.inFlight.abort()
    const ac = new AbortController()
    this.inFlight = ac
    try {
      const data: TokenDataPoint[] = await this.fetcher.fetchHistory(this.cfg.token, {
        ...(this.cfg.historyQuery ?? {}),
        signal: ac.signal,
      })
      // Throttle same-tick floods (in case of rapid calls)
      const now = Date.now()
      if (now - this.lastSentAt < 50) return
      this.lastSentAt = now

      // Post securely to expected origin
      this.iframe.contentWindow.postMessage(
        { type: "ELARIS_TOKEN_DATA", token: this.cfg.token, data },
        this.cfg.targetOrigin
      )
    } catch {
      // swallow: caller can add external logging if needed
    } finally {
      if (this.inFlight === ac) this.inFlight = undefined
    }
  }
}
