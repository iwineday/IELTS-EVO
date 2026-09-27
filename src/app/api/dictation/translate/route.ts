import { NextRequest, NextResponse } from "next/server"
import { getLesson, isLessonId, todayKey, translationsFor } from "@/lib/dictation/lesson"

/** POST { date } → lesson with paragraph Chinese filled in. Does not touch the dictation draft. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { date?: string }
  const date = body.date ?? todayKey()
  if (!isLessonId(date)) return NextResponse.json({ error: "bad date" }, { status: 400 })
  try {
    await translationsFor(date)
    const lesson = getLesson(date)
    if (!lesson) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({ lesson })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "translation failed"
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
