/**
 * ASR via DashScope qwen3-asr-flash (multimodal generation endpoint).
 *
 * Accepts an in-memory audio buffer as a base64 data URI — no OSS upload
 * needed, verified working for a single IELTS Speaking turn (<60s).
 * (The old Paraformer file-transcription endpoint requires public URLs.)
 */
import { dashScopeFetch } from "./client"

export interface AsrOptions {
  /** Language hint. en for IELTS Speaking. */
  language?: "en" | "zh"
  /** Mime of the payload, e.g. audio/wav or audio/webm. */
  mime?: string
}

export interface AsrResult {
  text: string
  requestId?: string
}

interface QwenAsrResponse {
  output?: {
    choices?: Array<{ message?: { content?: Array<{ text?: string }> } }>
  }
  request_id?: string
}

/** Transcribe an in-memory audio buffer (wav/mp3/webm) into text. */
export async function transcribe(
  audio: Buffer | ArrayBuffer,
  opts: AsrOptions = {},
): Promise<AsrResult> {
  const buf = audio instanceof ArrayBuffer ? Buffer.from(audio) : audio
  const base64 = buf.toString("base64")
  const mime = opts.mime ?? "audio/wav"

  const res = await dashScopeFetch(
    "/api/v1/services/aigc/multimodal-generation/generation",
    {
      method: "POST",
      json: {
        model: "qwen3-asr-flash",
        input: {
          messages: [
            { role: "system", content: [{ text: "" }] },
            { role: "user", content: [{ audio: `data:${mime};base64,${base64}` }] },
          ],
        },
        parameters: {
          asr_options: { language: opts.language ?? "en", enable_itn: true },
        },
      },
    },
  )
  const data = (await res.json()) as QwenAsrResponse
  const text =
    data.output?.choices?.[0]?.message?.content
      ?.map((c) => c.text ?? "")
      .join(" ")
      .trim() ?? ""
  return { text, requestId: data.request_id }
}
