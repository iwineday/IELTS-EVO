/**
 * StepFun chat completions via the step_plan subscription channel.
 *
 * IMPORTANT:
 * - Base URL MUST stay `https://api.stepfun.com/step_plan/v1` (Plan subscription,
 *   does not bill the account balance). Never change it to `/v1`.
 * - `step-3.7-flash` is a reasoning model: we always send `reasoning_effort: "low"`,
 *   otherwise the whole token budget is burned in the hidden reasoning field and
 *   `content` comes back empty (verified against the live endpoint).
 *
 * DashScope stays in place for ASR only; TTS moved to StepFun stepaudio-2.5-tts
 * (see src/lib/stepfun/tts.ts).
 */

import { reportUsage } from './report-usage'

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface ChatOptions {
  temperature?: number
  maxTokens?: number
  /** Force JSON output (server-side response_format). */
  jsonMode?: boolean
}

export interface ChatResult {
  text: string
  usage: { input: number; output: number }
  requestId?: string
}

function getConfig() {
  const apiKey = process.env.STEPFUN_API_KEY
  if (!apiKey) throw new Error("STEPFUN_API_KEY missing — set it in .env.local")
  return {
    apiKey,
    base: process.env.STEPFUN_BASE ?? "https://api.stepfun.com/step_plan/v1",
    model: process.env.STEPFUN_MODEL ?? "step-3.7-flash",
  }
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
  const { apiKey, base, model } = getConfig()

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 2000,
      // Keep the reasoning budget tiny — see file header.
      reasoning_effort: "low",
      response_format: opts.jsonMode ? { type: "json_object" } : undefined,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`StepFun ${res.status}: ${body.slice(0, 200)}`)
  }

  const data = await res.json()
  const text: string = data.choices?.[0]?.message?.content ?? ""
  return {
    text,
    usage: {
      input: data.usage?.prompt_tokens ?? 0,
      output: data.usage?.completion_tokens ?? 0,
    },
    requestId: data.id,
  }
}

/** Try to parse a JSON object out of a model response, tolerating fenced code blocks. */
export function parseJson<T = unknown>(raw: string): T {
  let cleaned = raw.trim()
  const fence = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/)
  if (fence) cleaned = fence[1].trim()
  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const start = cleaned.search(/[{[]/)
    if (start >= 0) cleaned = cleaned.slice(start)
  }
  return JSON.parse(cleaned) as T
}
