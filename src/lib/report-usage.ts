/**
 * Fire-and-forget usage reporter for Supabase request_log.
 */

export interface UsageReport {
  productId: string
  model: string
  inputTokens: number
  outputTokens: number
  userId?: string
  latencyMs?: number
  metadata?: Record<string, unknown>
}

export function reportUsage(opts: UsageReport): void {
  const url = process.env.SUPABASE_URL || process.env.SCHEDULE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SCHEDULE_SUPABASE_KEY
  if (!url || !key) return

  fetch(`${url}/rest/v1/request_log`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      product_id: opts.productId,
      user_id: opts.userId ?? null,
      model: opts.model,
      provider: "openai-compatible",
      input_tokens: opts.inputTokens,
      output_tokens: opts.outputTokens,
      total_tokens: opts.inputTokens + opts.outputTokens,
      latency_ms: opts.latencyMs ?? null,
      metadata: opts.metadata ?? {},
    }),
  }).catch((err) => console.error("[report-usage] insert error:", err))
}
