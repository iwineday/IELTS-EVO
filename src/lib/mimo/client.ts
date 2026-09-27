/**
 * Xiaomi MiMo token-plan client.
 * Chat: mimo-v2.5-pro. Speech: mimo-v2.5-tts (English voice Mia).
 * Key lives in .env.local as MIMO_API_KEY (tp-…), never in source.
 */

function config() {
  const apiKey = process.env.MIMO_API_KEY
  if (!apiKey) throw new Error("MIMO_API_KEY missing — set it in .env.local")
  return {
    apiKey,
    base: (process.env.MIMO_BASE ?? "https://token-plan-cn.xiaomimimo.com/v1").replace(/\/$/, ""),
    model: process.env.MIMO_MODEL ?? "mimo-v2.5-pro",
    ttsModel: process.env.MIMO_TTS_MODEL ?? "mimo-v2.5-tts",
    voice: process.env.MIMO_TTS_VOICE ?? "Mia",
  }
}

async function post(body: unknown): Promise<Record<string, unknown>> {
  const { apiKey, base } = config()
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(40000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`MiMo ${res.status}: ${text.slice(0, 240)}`)
  }
  return (await res.json()) as Record<string, unknown>
}

export async function mimoJson(system: string, user: string): Promise<string> {
  const { model } = config()
  const data = await post({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.8,
    max_completion_tokens: 4500,
    response_format: { type: "json_object" },
    thinking: { type: "disabled" },
  })
  const choices = data.choices as Array<{ message?: { content?: string } }> | undefined
  const text = choices?.[0]?.message?.content ?? ""
  if (!text.trim()) throw new Error("MiMo returned empty text")
  return text
}

/** Clear English narration. Text goes in the assistant turn; style hint in the user turn. */
export async function mimoSpeak(text: string): Promise<Buffer> {
  const { ttsModel, voice } = config()
  const data = await post({
    model: ttsModel,
    messages: [
      {
        role: "user",
        content: "Calm clear English narrator for a listening dictation. Steady pace, natural contractions, every word easy to catch. Neutral adult woman.",
      },
      { role: "assistant", content: text },
    ],
    audio: { format: "wav", voice },
  })
  const choices = data.choices as Array<{ message?: { audio?: { data?: string } } }> | undefined
  const b64 = choices?.[0]?.message?.audio?.data
  if (!b64) throw new Error("MiMo TTS returned no audio")
  return Buffer.from(b64, "base64")
}
