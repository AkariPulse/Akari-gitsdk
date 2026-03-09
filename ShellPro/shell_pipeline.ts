import { execCommand, type ExecOptions, type ExecResult } from "./execCommand"

export interface ShellTask {
  id: string
  command: string
  description?: string
  /**
   * Optional overrides for this specific task (cwd, env, timeoutMs, maxBuffer, captureStderr, etc.)
   */
  options?: ExecOptions
}

export interface ShellResult {
  taskId: string
  output?: string
  error?: string
  executedAt: number
  finishedAt: number
  durationMs: number
  /**
   * Present only when captureStderr=true was used for this task (via defaults or per-task options)
   */
  stderr?: string
  /**
   * Exit metadata (0 on success when captureStderr=true, otherwise undefined)
   */
  code?: number | null
  signal?: NodeJS.Signals | null
}

export interface RunnerOptions {
  /**
   * If false, stop on first error. Default: true (continue).
   */
  continueOnError?: boolean
  /**
   * Default exec options applied to every task (can be overridden by task.options)
   */
  defaultExecOptions?: ExecOptions
}

export class ShellTaskRunner {
  private tasks: ShellTask[] = []
  private readonly continueOnError: boolean
  private readonly defaultExecOptions: ExecOptions

  constructor(opts: RunnerOptions = {}) {
    this.continueOnError = opts.continueOnError ?? true
    this.defaultExecOptions = opts.defaultExecOptions ?? {}
  }

  /**
   * Schedule a shell task for execution
   */
  scheduleTask(task: ShellTask): void {
    this.tasks.push(task)
  }

  /**
   * Execute a single task immediately (does not remove it from queue)
   */
  async runOne(task: ShellTask): Promise<ShellResult> {
    const start = Date.now()
    const mergedOpts: ExecOptions = { ...this.defaultExecOptions, ...(task.options ?? {}) }
    try {
      const out = await execCommand(task.command, mergedOpts)
      const finishedAt = Date.now()
      const base = {
        taskId: task.id,
        executedAt: start,
        finishedAt,
        durationMs: finishedAt - start,
      }

      if (typeof out === "string") {
        return { ...base, output: out }
      } else {
        const res = out as ExecResult
        return {
          ...base,
          output: res.stdout,
          stderr: res.stderr,
          code: res.code,
          signal: res.signal,
        }
      }
    } catch (err: any) {
      const finishedAt = Date.now()
      return {
        taskId: task.id,
        error: err?.message ?? String(err),
        executedAt: start,
        finishedAt,
        durationMs: finishedAt - start,
      }
    }
  }

  /**
   * Execute all scheduled tasks in sequence
   * Clears the internal queue after running
   */
  async runAll(): Promise<ShellResult[]> {
    const results: ShellResult[] = []
    for (const task of this.tasks) {
      const result = await this.runOne(task)
      results.push(result)

      if (result.error && !this.continueOnError) {
        // clear queue before early exit to avoid re-use in next call
        this.tasks = []
        return results
      }
    }
    // clear after running
    this.tasks = []
    return results
  }

  /**
   * Returns a shallow copy of the scheduled tasks
   */
  getQueue(): ShellTask[] {
    return [...this.tasks]
  }

  /**
   * Clears the queued tasks without running them
   */
  clear(): void {
    this.tasks = []
  }
}
