import { NextRequest, NextResponse } from "next/server"
import { audioForSentence, isLessonId, todayKey } from "@/lib/dictation/lesson"

/** GET ?date=YYYY-MM-DD&s=0 → one sentence wav. `s` is used so old paragraph clips cached under `i` are not reused. */
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? todayKey()
  const index = Number(req.nextUrl.searchParams.get("s") ?? "")
  if (!isLessonId(date) || !Number.isInteger(index)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 })
  }
  try {
    const audio = await audioForSentence(date, index)
    return new NextResponse(new Uint8Array(audio.bytes), {
      headers: {
        "Content-Type": audio.contentType,
        "Cache-Control": "private, max-age=86400",
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "audio failed"
    const status = msg === "sentence not found" ? 404 : 502
    return NextResponse.json({ error: msg }, { status })
  }
}
