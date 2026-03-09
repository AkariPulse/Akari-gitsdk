/**
 * Analyze on-chain token activity on Solana: fetch recent tx signatures for a mint,
 * load transactions via JSON-RPC, and reconstruct token transfers for that mint
 *
 * - Uses proper JSON-RPC (getSignaturesForAddress, getTransaction with jsonParsed)
 * - Pagination with `before` to reach the requested limit
 * - Concurrency-limited transaction fetches with timeouts and retries
 * - Robust pairing: matches positive and negative owner deltas within the same tx
 * - Returns normalized ActivityRecord[]
 */

export interface ActivityRecord {
  timestamp: number
  signature: string
  source: string
  destination: string
  amount: number
}

type JsonRpcRequest = {
  jsonrpc: "2.0"
  id: number
  method: string
  params?: any[]
}

type JsonRpcResponse<T> = {
  jsonrpc: "2.0"
  id: number
  result?: T
  error?: { code: number; message: string; data?: any }
}

type RpcSignatureInfo = {
  signature: string
  slot: number
  err: any | null
  blockTime: number | null
  confirmationStatus?: string
}

type RpcGetSignaturesForAddressResult = RpcSignatureInfo[]

type UiTokenAmount = {
  uiAmount: number | null
  decimals: number
  amount: string
  uiAmountString?: string
}

type TokenBalance = {
  accountIndex: number
  mint: string
  owner?: string
  uiTokenAmount: UiTokenAmount
}

type TxMeta = {
  preTokenBalances?: TokenBalance[]
  postTokenBalances?: TokenBalance[]
}

type ParsedTransactionResult = {
  slot: number
  blockTime: number | null
  meta: TxMeta | null
  transaction: any
}

export class TokenActivityAnalyzer {
  constructor(private readonly rpcEndpoint: string) {}

  /**
   * Fetch up to `limit` signatures referencing the given address (e.g., mint address)
   * Paginates using the "before" cursor
   */
  async fetchRecentSignatures(mint: string, limit = 100): Promise<RpcSignatureInfo[]> {
    const out: RpcSignatureInfo[] = []
    let before: string | undefined = undefined

    while (out.length < limit) {
      const batch = await this.rpcCall<RpcGetSignaturesForAddressResult>("getSignaturesForAddress", [
        mint,
        { limit: Math.min(1000, limit - out.length), before, commitment: "confirmed" },
      ])
      if (!batch || batch.length === 0) break
      out.push(...batch)
      if (batch.length < 1) break
      before = batch[batch.length - 1].signature
      if (batch.length === 0) break
    }

    return out.slice(0, limit)
  }

  /**
   * Analyze token activity for a specific SPL mint
   * - limit: number of signatures to process (fetched from getSignaturesForAddress)
   * - options.concurrency: simultaneous getTransaction calls (default 6)
   * - options.timeoutMs: per-RPC timeout (default 15000)
   * - options.retries: per-RPC retries on network/5xx (default 2)
   */
  async analyzeActivity(
    mint: string,
    limit = 50,
    options?: { concurrency?: number; timeoutMs?: number; retries?: number }
  ): Promise<ActivityRecord[]> {
    const signatures = await this.fetchRecentSignatures(mint, limit)
    const concurrency = Math.max(1, Math.floor(options?.concurrency ?? 6))
    const timeoutMs = options?.timeoutMs ?? 15_000
    const retries = Math.max(0, Math.floor(options?.retries ?? 2))

    const results: ActivityRecord[] = []

    // Simple worker pool
    let idx = 0
    const worker = async () => {
      while (idx < signatures.length) {
        const i = idx++
        const sig = signatures[i].signature
        try {
          const tx = await this.getTransaction(sig, timeoutMs, retries)
          if (!tx || !tx.meta) continue
          const recs = this.extractMintTransfersFromTx(sig, tx, mint)
          if (recs.length) results.push(...recs)
        } catch {
          // skip failing tx
        }
      }
    }

    const workers = Array.from({ length: concurrency }, () => worker())
    await Promise.all(workers)

    // sort ascending by time then signature for stability
    results.sort((a, b) => (a.timestamp - b.timestamp) || (a.signature < b.signature ? -1 : 1))
    return results
  }

  // ——————————— internals ———————————

  private async rpcCall<T>(method: string, params: any[], timeoutMs = 15_000, retries = 2): Promise<T> {
    let attempt = 0
    let lastErr: unknown

    while (attempt <= retries) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const payload: JsonRpcRequest = { jsonrpc: "2.0", id: Date.now(), method, params }
        const res = await fetch(this.rpcEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
        clearTimeout(timer)

        if (!res.ok) {
          // retry on 5xx
          if (res.status >= 500 && attempt < retries) {
            attempt++
            continue
          }
          throw new Error(`HTTP ${res.status}`)
        }

        const json = (await res.json()) as JsonRpcResponse<T>
        if (json.error) throw new Error(json.error.message || "RPC error")
        return json.result as T
      } catch (err) {
        clearTimeout(timer)
        lastErr = err
        if (attempt < retries) {
          attempt++
          continue
        }
        throw err
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("RPC call failed")
  }

  private async getTransaction(signature: string, timeoutMs: number, retries: number): Promise<ParsedTransactionResult | null> {
    const result = await this.rpcCall<ParsedTransactionResult | null>(
      "getTransaction",
      [
        signature,
        {
          encoding: "jsonParsed",
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        },
      ],
      timeoutMs,
      retries
    )
    return result
  }

  /**
   * Build transfers for the given mint by netting owner-level deltas inside one transaction
   * Strategy:
   *  - Build maps of pre/post balances for the target mint keyed by accountIndex
   *  - Compute owner deltas (post - pre)
   *  - Split into positives (inflows) and negatives (outflows)
   *  - Greedily pair the largest remaining outflow with inflows to form source→destination records
   */
  private extractMintTransfersFromTx(signature: string, tx: ParsedTransactionResult, mint: string): ActivityRecord[] {
    const meta = tx.meta
    const ts = (tx.blockTime ?? 0) * 1000

    const pre = (meta?.preTokenBalances ?? []).filter(b => b.mint === mint)
    const post = (meta?.postTokenBalances ?? []).filter(b => b.mint === mint)

    if (pre.length === 0 && post.length === 0) return []

    // Map accountIndex -> balance
    const preMap = new Map<number, TokenBalance>()
    const postMap = new Map<number, TokenBalance>()
    for (const b of pre) preMap.set(b.accountIndex, b)
    for (const b of post) postMap.set(b.accountIndex, b)

    // Owner net deltas
    const ownerDelta = new Map<string, number>() // owner -> delta (post - pre)
    const ensureOwner = (owner?: string) => (owner && owner.length > 0 ? owner : "unknown")

    const indices = new Set<number>([...preMap.keys(), ...postMap.keys()])
    for (const idx of indices) {
      const preBal = preMap.get(idx)
      const postBal = postMap.get(idx)
      const owner = ensureOwner((postBal ?? preBal)?.owner)
      const preAmt = this.uiAmount(preBal?.uiTokenAmount)
      const postAmt = this.uiAmount(postBal?.uiTokenAmount)
      const delta = postAmt - preAmt
      if (delta !== 0) {
        ownerDelta.set(owner, (ownerDelta.get(owner) ?? 0) + delta)
      }
    }

    if (ownerDelta.size === 0) return []

    // Split into sinks (positive) and sources (negative)
    const inflows: Array<{ owner: string; amount: number }> = []
    const outflows: Array<{ owner: string; amount: number }> = []

    for (const [owner, d] of ownerDelta.entries()) {
      if (d > 0) inflows.push({ owner, amount: d })
      else if (d < 0) outflows.push({ owner, amount: -d }) // store positive magnitude
    }

    if (inflows.length === 0 || outflows.length === 0) {
      // Fallback: if only inflow or only outflow detected, emit per-owner change with unknown counterparty
      const fallback: ActivityRecord[] = []
      for (const x of inflows) {
        fallback.push({ timestamp: ts, signature, source: "unknown", destination: x.owner, amount: round4(x.amount) })
      }
      for (const x of outflows) {
        fallback.push({ timestamp: ts, signature, source: x.owner, destination: "unknown", amount: round4(x.amount) })
      }
      return fallback
    }

    // Greedy pairing: match outflows to inflows
    inflows.sort((a, b) => b.amount - a.amount)
    outflows.sort((a, b) => b.amount - a.amount)

    const records: ActivityRecord[] = []
    let i = 0
    let j = 0
    while (i < outflows.length && j < inflows.length) {
      const out = outflows[i]
      const inn = inflows[j]
      const amt = Math.min(out.amount, inn.amount)
      if (amt > 0) {
        records.push({
          timestamp: ts,
          signature,
          source: out.owner,
          destination: inn.owner,
          amount: round4(amt),
        })
        out.amount -= amt
        inn.amount -= amt
      }
      if (out.amount <= 1e-12) i++
      if (inn.amount <= 1e-12) j++
    }

    return records
  }

  private uiAmount(x?: UiTokenAmount | null): number {
    // jsonParsed uiTokenAmount.uiAmount is already human-readable float (may be null)
    if (!x || x.uiAmount == null) return 0
    const n = typeof x.uiAmount === "number" ? x.uiAmount : Number(x.uiAmount)
    return Number.isFinite(n) ? n : 0
  }
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}
