import { NextRequest, NextResponse } from "next/server"
import { synthesize, type TtsVoice } from "@/lib/stepfun/tts"

/**
 * Generic TTS endpoint for phrase/sentence playback.
 * POST { text, voice? } → { audioBase64, format }
 */
export async function POST(req: NextRequest) {
  const { text, voice } = (await req.json()) as { text?: string; voice?: TtsVoice }
  if (!text?.trim()) {
    return NextResponse.json({ error: "text required" }, { status: 400 })
  }

  try {
    const result = await synthesize(text.slice(0, 500), { voice })
    return NextResponse.json({ audioBase64: result.audioBase64, format: result.format })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "tts failed"
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
