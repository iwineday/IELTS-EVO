/**
 * TTS via StepFun stepaudio-2.5-tts (step_plan subscription channel).
 *
 * OpenAI-compatible `/audio/speech`: returns raw audio bytes directly —
 * no OSS URL round-trip like qwen-tts, so it is one network hop faster.
 * Verified live: voice "linjiajiejie", response_format "wav" → 200 audio/wav.
 *
 * DashScope stays in place for ASR only (step_plan has no ASR endpoint:
 * /audio/transcriptions 404s and stepaudio-2.5-chat is quota-gated).
 */

/** stepaudio-2.5-tts voice id. `linjiajiejie` is the verified default. */
export type TtsVoice = string

export interface TtsOptions {
  voice?: TtsVoice
}

export interface TtsResult {
  audioBase64: string
  format: string
  requestId?: string
}

const DEFAULT_VOICE: TtsVoice = "linjiajiejie"

function getConfig() {
  const apiKey = process.env.STEPFUN_API_KEY
  if (!apiKey) throw new Error("STEPFUN_API_KEY missing — set it in .env.local")
  return {
    apiKey,
    base: process.env.STEPFUN_BASE ?? "https://api.stepfun.com/step_plan/v1",
  }
}

export async function synthesize(text: string, opts: TtsOptions = {}): Promise<TtsResult> {
  const { apiKey, base } = getConfig()

  const res = await fetch(`${base}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "stepaudio-2.5-tts",
      input: text,
      voice: opts.voice ?? DEFAULT_VOICE,
      response_format: "wav",
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`StepFun TTS ${res.status}: ${body.slice(0, 200)}`)
  }

  const buf = Buffer.from(await res.arrayBuffer())
  return { audioBase64: buf.toString("base64"), format: "wav" }
}
