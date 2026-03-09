import type { TaskFormInput } from "./taskFormSchemas"
import { TaskFormSchema } from "./taskFormSchemas"
import crypto from "crypto"

export interface SubmissionOptions {
  /**
   * Scheduler service base URL, e.g. https://scheduler.elaris.app
   * If omitted, will use process.env.ELARIS_SCHEDULER_URL
   */
  schedulerUrl?: string
  /**
   * Optional API key for the scheduler service
   * If omitted, will use process.env.ELARIS_SCHEDULER_API_KEY
   */
  schedulerApiKey?: string
  /**
   * Verify Typeform webhook signature (HMAC-SHA256)
   * Default: false (no verification)
   */
  verifySignature?: boolean
  /**
   * Raw "Typeform-Signature" header value (e.g., "sha256=...")
   */
  signatureHeader?: string
  /**
   * Shared secret for Typeform webhook (the one you configure in Typeform)
   * If omitted, will use process.env.TYPEFORM_SECRET
   */
  typeformSecret?: string
  /**
   * Raw request body as received (string or Buffer). Required when verifySignature=true
   */
  rawBody?: string | Buffer
  /**
   * Optional custom fetch (for testing)
   */
  fetchImpl?: typeof fetch
}

export async function handleTypeformSubmission(
  raw: unknown,
  options?: SubmissionOptions
): Promise<{ success: boolean; message: string; taskId?: string }> {
  const fetchFn = options?.fetchImpl ?? fetch

  // 1) Optional signature verification (Typeform HMAC-SHA256 over raw body)
  if (options?.verifySignature) {
    const secret = options.typeformSecret ?? process.env.TYPEFORM_SECRET
    const header = options.signatureHeader
    const body = options.rawBody
    if (!secret || !header || (body === undefined || body === null)) {
      return { success: false, message: "Signature verification failed: missing secret/header/rawBody" }
    }
    if (!verifyTypeformSignature(secret, header, body)) {
      return { success: false, message: "Signature verification failed: invalid signature" }
    }
  }

  // 2) Validate & coerce payload via Zod
  const parsed = TaskFormSchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map(i => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ")
    return { success: false, message: `Validation error: ${msg}` }
  }
  const data = parsed.data as TaskFormInput
  const { taskName, taskType, parameters, scheduleCron } = data

  // 3) Validate CRON expression (simple 5-field)
  const cronOk = isValidCron5(scheduleCron)
  if (!cronOk) {
    return { success: false, message: `Invalid CRON expression: "${scheduleCron}"` }
  }

  // 4) Schedule task via external scheduler API
  const schedulerUrl = (options?.schedulerUrl ?? process.env.ELARIS_SCHEDULER_URL)?.replace(/\/+$/, "")
  const apiKey = options?.schedulerApiKey ?? process.env.ELARIS_SCHEDULER_API_KEY
  if (!schedulerUrl) return { success: false, message: "Scheduler URL is not configured" }

  try {
    const res = await fetchFn(`${schedulerUrl}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        name: taskName,
        type: taskType,
        params: parameters,
        cron: scheduleCron,
      }),
    })
    if (!res.ok) {
      const text = await safeText(res)
      return { success: false, message: `Scheduler error: HTTP ${res.status} ${text}` }
    }
    const json = await safeJson(res)
    const taskId = pickString(json, ["id", "taskId", "task_id"])
    return { success: true, message: `Task "${taskName}" scheduled${taskId ? ` with ID ${taskId}` : ""}`, taskId }
  } catch (err: any) {
    return { success: false, message: err?.message ?? String(err) }
  }
}

/* -------------------- helpers -------------------- */

function verifyTypeformSignature(secret: string, header: string, rawBody: string | Buffer): boolean {
  // Typeform sends "sha256=base64(hmac_sha256(rawBody, secret))"
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("base64")
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  // Prevent leak via length oracle
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

function isValidCron5(expr: string): boolean {
  // Very lightweight validation for "m h dom mon dow" (5 fields)
  // Accepts: numbers, *, ranges (a-b), steps (*/x or a-b/x), lists (a,b,c)
  const fields = expr.trim().split(/\s+/)
  if (fields.length !== 5) return false
  const ranges: Array<[number, number]> = [
    [0, 59],  // minute
    [0, 23],  // hour
    [1, 31],  // day of month
    [1, 12],  // month
    [0, 7],   // day of week (0 or 7 = Sunday)
  ]
  return fields.every((f, idx) => validateCronField(f, ranges[idx][0], ranges[idx][1]))
}

function validateCronField(f: string, min: number, max: number): boolean {
  const parts = f.split(",")
  return parts.every(p => validateCronUnit(p, min, max))
}

function validateCronUnit(u: string, min: number, max: number): boolean {
  // "*", "*/x", "a", "a-b", "a-b/x"
  if (u === "*") return true
  const stepSplit = u.split("/")
  const base = stepSplit[0]
  const step = stepSplit[1] ? Number(stepSplit[1]) : undefined
  if (stepSplit.length > 2 || (step !== undefined && (!Number.isInteger(step) || step <= 0))) return false

  if (base.includes("-")) {
    const [aStr, bStr] = base.split("-")
    const a = Number(aStr), b = Number(bStr)
    if (!Number.isInteger(a) || !Number.isInteger(b) || a > b) return false
    if (a < min || b > max) return false
    return true
  } else {
    const n = Number(base)
    if (!Number.isInteger(n)) return false
    return n >= min && n <= max
  }
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
    return { raw: text }
  }
}

function pickString(obj: any, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj?.[k]
    if (typeof v === "string" && v.length > 0) return v
  }
  return undefined
}
