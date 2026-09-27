import { NextRequest, NextResponse } from "next/server"
import { transcribe } from "@/lib/dashscope/asr"

/**
 * Speaking Agent — transcription endpoint.
 * POST { audioBase64, mime? } → { text }
 * Frontend records with MediaRecorder and converts to 16k mono WAV before upload.
 */
export async function POST(req: NextRequest) {
  const { audioBase64, mime } = (await req.json()) as {
    audioBase64?: string
    mime?: string
  }
  if (!audioBase64) {
    return NextResponse.json({ error: "audioBase64 required" }, { status: 400 })
  }

  try {
    const buf = Buffer.from(audioBase64, "base64")
    const result = await transcribe(buf, { language: "en", mime: mime ?? "audio/wav" })
    return NextResponse.json({ text: result.text })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "transcription failed"
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
