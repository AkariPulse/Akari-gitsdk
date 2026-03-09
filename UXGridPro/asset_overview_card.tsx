import React, { useEffect, useMemo, useRef, useState } from "react"

type AssetOverviewPanelProps = {
  assetId: string
  /** Optional API base, defaults to "/api/elaris" */
  apiBase?: string
  /** Auto-refresh interval in ms (disabled if not provided or <= 0) */
  refreshMs?: number
  /** Optional container className */
  className?: string
  /** Per-request timeout (ms), default 10s */
  timeoutMs?: number
}

type AssetOverview = {
  name: string
  priceUsd: number
  supply: number
  holders: number
}

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: AssetOverview; updatedAt: number }
  | { status: "error"; message: string }

export const AssetOverviewPanel: React.FC<AssetOverviewPanelProps> = ({
  assetId,
  apiBase = "/api/elaris",
  refreshMs,
  className = "",
  timeoutMs = 10_000,
}) => {
  const [state, setState] = useState<LoadState>({ status: "idle" })
  const latestReqId = useRef(0)
  const timerRef = useRef<number | null>(null)

  const currencyFmt = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }),
    []
  )
  const numberFmt = useMemo(() => new Intl.NumberFormat(undefined), [])

  const fetchOnce = async (signal?: AbortSignal) => {
    const reqId = ++latestReqId.current
    setState(prev => (prev.status === "success" ? prev : { status: "loading" }))

    try {
      const data = await fetchAssetOverview({
        assetId,
        apiBase,
        timeoutMs,
        signal,
      })
      // Ignore out-of-date responses
      if (reqId !== latestReqId.current) return
      setState({ status: "success", data, updatedAt: Date.now() })
    } catch (err: any) {
      if (signal?.aborted) return
      setState({
        status: "error",
        message: err?.message ?? "Failed to load asset overview",
      })
    }
  }

  // Initial load + refresh
  useEffect(() => {
    const ctrl = new AbortController()
    fetchOnce(ctrl.signal)

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (Number.isFinite(refreshMs) && refreshMs && refreshMs > 0) {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      timerRef.current = window.setInterval(() => {
        const c = new AbortController()
        fetchOnce(c.signal)
      }, refreshMs)
    }
    return () => {
      ctrl.abort()
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      latestReqId.current++
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, apiBase, refreshMs, timeoutMs])

  const onRetry = () => {
    const c = new AbortController()
    fetchOnce(c.signal)
  }

  return (
    <div
      className={`p-4 bg-white rounded-2xl shadow-sm border border-gray-100 ${className}`}
      aria-busy={state.status === "loading"}
      aria-live="polite"
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold tracking-tight">Asset Overview</h2>
        {state.status === "success" && (
          <span className="text-xs text-gray-500">
            Updated {new Date(state.updatedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Loading skeleton */}
      {state.status === "loading" && (
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-4 bg-gray-200 rounded w-2/5" />
          <div className="h-4 bg-gray-200 rounded w-1/4" />
          <div className="h-4 bg-gray-200 rounded w-1/3" />
        </div>
      )}

      {/* Error state */}
      {state.status === "error" && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700 mb-2">
            {state.message || "Failed to load asset overview."}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            Retry
          </button>
        </div>
      )}

      {/* Success state */}
      {state.status === "success" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InfoRow label="ID" value={<code className="text-xs">{assetId}</code>} />
          <InfoRow label="Name" value={state.data.name || "—"} />
          <InfoRow label="Price (USD)" value={currencyFmt.format(safeNum(state.data.priceUsd))} />
          <InfoRow
            label="Circulating Supply"
            value={numberFmt.format(Math.max(0, Math.floor(safeNum(state.data.supply))))}
          />
          <InfoRow
            label="Holders"
            value={numberFmt.format(Math.max(0, Math.floor(safeNum(state.data.holders))))}
          />
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  )
}

function isAssetOverview(x: any): x is AssetOverview {
  return (
    x &&
    typeof x === "object" &&
    typeof x.name === "string" &&
    Number.isFinite(Number(x.priceUsd)) &&
    Number.isFinite(Number(x.supply)) &&
    Number.isFinite(Number(x.holders))
  )
}

async function fetchAssetOverview(args: {
  assetId: string
  apiBase: string
  timeoutMs: number
  signal?: AbortSignal
}): Promise<AssetOverview> {
  const { assetId, apiBase, timeoutMs, signal } = args
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${apiBase.replace(/\/+$/, "")}/assets/${encodeURIComponent(assetId)}`, {
      method: "GET",
      signal: signal ? anySignal([signal, ctrl.signal]) : ctrl.signal,
      headers: { "Accept": "application/json" },
    })
    if (!res.ok) {
      const text = await safeText(res)
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text || "no body"}`)
    }
    const json = await safeJson(res)
    if (!isAssetOverview(json)) throw new Error("Invalid response shape")
    return {
      name: json.name,
      priceUsd: Number(json.priceUsd),
      supply: Number(json.supply),
      holders: Number(json.holders),
    }
  } finally {
    clearTimeout(timer)
  }
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const anyFactory = (AbortSignal as any).any
  if (typeof anyFactory === "function") return anyFactory(signals)
  const c = new AbortController()
  const onAbort = () => c.abort()
  for (const s of signals) {
    if (s.aborted) {
      c.abort()
      break
    }
    s.addEventListener("abort", onAbort, { once: true })
  }
  return c.signal
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ""
  }
}

async function safeJson(res: Response): Promise<any> {
  const text = await safeText(res)
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

function safeNum(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n)
  return Number.isFinite(v) ? v : 0
}

export default AssetOverviewPanel
