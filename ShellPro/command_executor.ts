import { exec, ExecException } from "child_process"

export interface ExecOptions {
  /** Max runtime in ms before kill (default 30000) */
  timeoutMs?: number
  /** Working directory for the command */
  cwd?: string
  /** Extra environment variables */
  env?: NodeJS.ProcessEnv
  /** Max stdout+stderr buffer size in bytes (default 10 MB) */
  maxBuffer?: number
  /** If true, return both stdout and stderr instead of only stdout */
  captureStderr?: boolean
}

export interface ExecResult {
  stdout: string
  stderr: string
  code: number | null
  signal: NodeJS.Signals | null
}

/**
 * Execute a shell command and resolve with its output.
 * Rejects with rich error info if the command fails.
 */
export function execCommand(
  command: string,
  options: ExecOptions = {}
): Promise<string | ExecResult> {
  const {
    timeoutMs = 30_000,
    cwd,
    env,
    maxBuffer = 10 * 1024 * 1024,
    captureStderr = false,
  } = options

  return new Promise((resolve, reject) => {
    const proc = exec(
      command,
      { timeout: timeoutMs, cwd, env: { ...process.env, ...env }, maxBuffer },
      (error: ExecException | null, stdout: string, stderr: string) => {
        if (error) {
          const err = new Error(
            `Command failed: ${error.message}\nstdout: ${stdout}\nstderr: ${stderr}`
          )
          ;(err as any).code = error.code
          ;(err as any).signal = error.signal
          return reject(err)
        }
        const out = stdout.trim()
        if (captureStderr) {
          resolve({
            stdout: out,
            stderr: stderr.trim(),
            code: 0,
            signal: null,
          })
        } else {
          resolve(out)
        }
      }
    )

    // safety: ignore, proc cleanup handled by Node child_process
    proc.on("error", reject)
  })
}
