import { z } from "zod"

/**
 * Lightweight validator for 5-field CRON: "m h dom mon dow"
 * Supports: numbers, "*", ranges (a-b), lists (a,b,c), and steps (*/x, a-b/x).
 */
export function isValidCron5(expr: string): boolean {
  const fields = expr.trim().split(/\s+/)
  if (fields.length !== 5) return false
  const ranges: Array<[number, number]> = [
    [0, 59],  // minute
    [0, 23],  // hour
    [1, 31],  // day of month
    [1, 12],  // month
    [0, 7],   // day of week (0 or 7 = Sunday)
  ]
  return fields.every((f, i) => validateCronField(f, ranges[i][0], ranges[i][1]))
}

function validateCronField(f: string, min: number, max: number): boolean {
  const parts = f.split(",")
  return parts.every(p => validateCronUnit(p, min, max))
}

function validateCronUnit(u: string, min: number, max: number): boolean {
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

/** Trimmed string with min/max checks */
const trimmedString = (min: number, max: number) =>
  z.string().transform(s => s.trim()).pipe(z.string().min(min).max(max))

/** Allowed parameter value types: string | number | boolean | null */
const paramValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])

/** Parameter keys: letters/digits/._:-, 1..64 chars */
const paramKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_.:-]+$/, "Invalid parameter key")

/** CRON string (5 fields) with custom validation */
export const Cron5Schema = z
  .string()
  .transform(s => s.trim())
  .refine(isValidCron5, "Invalid CRON expression (expected 5 fields: m h dom mon dow)")

/**
 * Schema for scheduling a new Elaris task via Typeform submission.
 */
export const TaskFormSchema = z.object({
  taskName: trimmedString(3, 100),
  taskType: z.enum(["anomalyScan", "tokenAnalytics", "whaleMonitor"]),
  parameters: z
    .record(paramKeySchema, paramValueSchema)
    .refine(obj => Object.keys(obj).length > 0, "Parameters must include at least one key"),
  scheduleCron: Cron5Schema,
})

export type TaskFormInput = z.infer<typeof TaskFormSchema>

/** Helper that returns either parsed data or a single joined error string */
export function parseTaskForm(
  raw: unknown
): { ok: true; data: TaskFormInput } | { ok: false; message: string } {
  const parsed = TaskFormSchema.safeParse(raw)
  if (parsed.success) return { ok: true, data: parsed.data }
  const message = parsed.error.issues
    .map(i => `${i.path.join(".") || "<root>"}: ${i.message}`)
    .join("; ")
  return { ok: false, message }
}
