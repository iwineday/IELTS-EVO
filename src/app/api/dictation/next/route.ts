import { NextRequest, NextResponse } from "next/server"
import { listRecent, openNextLesson, todayKey } from "@/lib/dictation/lesson"

/** POST { date } → the other piece from that day, creating the second one if needed. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { date?: string }
  try {
    const lesson = await openNextLesson(body.date ?? todayKey())
    return NextResponse.json({ lesson, recent: listRecent() })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "next lesson failed"
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
