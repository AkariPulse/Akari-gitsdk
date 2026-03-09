/**
 * Simple task executor with typing, retries, timeouts, and concurrency.
 *
 * Handlers can observe an AbortSignal (for timeouts or external cancellation).
 */

export type Handler<Params = any, Result = any> = (
  params: Params,
  ctx: { id: string; type: string; signal?: AbortSignal }
) => Promise<Result>

export interface TaskOptions {
  /** Abort request externally */
  signal?: AbortSignal
  /** Per-task timeout in ms (default: inherits engine default or undefined) */
  timeoutMs?: number
  /** Number of retries on handler rejection (default 0) */
  retries?: number
  /** Deterministic backoff between retries in ms: base * (attempt + 1). Default 500 */
  retryBackoffMs?: number
  /** Optional priority: lower number runs earlier (default 0) */
  priority?: number
}

export interface Task<Params = any> {
  id: string
  type: string
  params: Params
  options?: TaskOptions
}

export interface ExecutionResult<Result = any> {
  id: string
  type: string
  startedAt: number
  finishedAt: number
  durationMs: number
  result?: Result
  error?: string
  attempts: number
}

export interface EngineOptions {
  /** Max number of tasks running concurrently (default 1 = sequential) */
  concurrency?: number
  /** Defaults applied to every task unless overridden */
  defaultTaskOptions?: Omit<TaskOptions, "signal">
}

export class ExecutionEngine {
  private handlers: Record<string, Handler<any, any>> = {}
  private queue: Task[] = []
  private readonly concurrency: number
  private readonly defaultTaskOptions: Omit<TaskOptions, "signal">

  constructor(opts: EngineOptions = {}) {
    this.concurrency = Math.max(1, Math.floor(opts.concurrency ?? 1))
    this.defaultTaskOptions = {
      timeoutMs: undefined,
      retries: 0,
      retryBackoffMs: 500,
      priority: 0,
      ...(opts.defaultTaskOptions ?? {}),
    }
  }

  register<Params = any, Result = any>(type: string, handler: Handler<Params, Result>): void {
    this.handlers[type] = handler as Handler<any, any>
  }

  hasHandler(type: string): boolean {
    return Boolean(this.handlers[type])
  }

  enqueue<Params = any>(id: string, type: string, params: Params, options?: TaskOptions): void {
    if (!this.handlers[type]) throw new Error(`No handler for ${type}`)
    this.queue.push({ id, type, params, options })
  }

  getQueue(): Task[] {
    // Stable order view; tasks are processed by priority then FIFO
    return [...this.queue]
  }

  clear(): void {
    this.queue = []
  }

  async runAll(): Promise<ExecutionResult[]> {
    // Sort by priority asc, then preserve FIFO within equal priority
    const tasks = this.queue
      .map((t, idx) => ({ t, idx }))
      .sort((a, b) => (a.t.options?.priority ?? 0) - (b.t.options?.priority ?? 0) || a.idx - b.idx)
      .map(x => x.t)

    this.queue = [] // clear queue at start to avoid re-use

    const results: ExecutionResult[] = []
    const workers: Promise<void>[] = []

    let cursor = 0
    const next = (): Task | undefined => {
      if (cursor >= tasks.length) return undefined
      return tasks[cursor++]
    }

    const runWorker = async () => {
      let task: Task | undefined
      while ((task = next())) {
        const res = await this.runOne(task)
        results.push(res)
      }
    }

    for (let i = 0; i < this.concurrency; i++) {
      workers.push(runWorker())
    }

    await Promise.all(workers)
    return results
  }

  async runOne(task: Task): Promise<ExecutionResult> {
    const handler = this.handlers[task.type]
    if (!handler) {
      return {
        id: task.id,
        type: task.type,
        startedAt: Date.now(),
        finishedAt: Date.now(),
        durationMs: 0,
        error: `No handler for ${task.type}`,
        attempts: 0,
      }
    }

    const startedAt = Date.now()
    const merged: TaskOptions = { ...this.defaultTaskOptions, ...(task.options ?? {}) }

    const attempts = (merged.retries ?? 0) + 1
    let lastErr: unknown
    for (let attempt = 0; attempt < attempts; attempt++) {
      const tryStart = Date.now()
      const controller = new AbortController()
      const signals = [merged.signal, controller.signal].filter(Boolean) as AbortSignal[]
      const combined = signals.length > 0 ? this.anySignal(signals) : undefined

      let timeoutId: number | undefined
      try {
        if (merged.timeoutMs && merged.timeoutMs > 0) {
          timeoutId = setTimeout(() => controller.abort(), merged.timeoutMs) as unknown as number
        }

        const result = await handler(task.params, {
          id: task.id,
          type: task.type,
          signal: combined,
        })

        if (timeoutId !== undefined) clearTimeout(timeoutId)

        const finishedAt = Date.now()
        return {
          id: task.id,
          type: task.type,
          startedAt,
          finishedAt,
          durationMs: finishedAt - startedAt,
          result,
          attempts: attempt + 1,
        }
      } catch (err) {
        if (timeoutId !== undefined) clearTimeout(timeoutId)
        lastErr = err
        const isLast = attempt === attempts - 1
        if (isLast) break
        // deterministic linear backoff
        const backoff = Math.max(0, (merged.retryBackoffMs ?? 500) * (attempt + 1))
        const remaining = Math.max(0, backoff - (Date.now() - tryStart))
        if (remaining > 0) await this.delay(remaining)
      }
    }

    const finishedAt = Date.now()
    return {
      id: task.id,
      type: task.type,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      error: this.errorMessage(lastErr),
      attempts,
    }
  }

  // ——— internals ———

  private anySignal(signals: AbortSignal[]): AbortSignal | undefined {
    if (signals.length === 0) return undefined
    // If running on platforms that support AbortSignal.any
    const anyFactory = (AbortSignal as any).any
    if (typeof anyFactory === "function") return anyFactory(signals)

    const controller = new AbortController()
    const onAbort = () => controller.abort()
    for (const s of signals) {
      if (s.aborted) {
        controller.abort()
        break
      }
      s.addEventListener("abort", onAbort, { once: true })
    }
    return controller.signal
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private errorMessage(err: unknown): string {
    if (!err) return "Unknown error"
    if (typeof err === "string") return err
    if (err instanceof Error) return err.message
    try {
      return JSON.stringify(err)
    } catch {
      return String(err)
    }
  }
}
