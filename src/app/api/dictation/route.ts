import { NextRequest, NextResponse } from "next/server"
import { getLesson, getOrCreateToday, isLessonId, listRecent, saveProgress, todayKey, type DictationStage } from "@/lib/dictation/lesson"

const STAGES = new Set<DictationStage>(["listen", "write", "memorize", "recite", "done"])

/**
 * Daily intensive-listening passage.
 * GET  ?date=YYYY-MM-DD  → today's lesson (generated once) or a stored past day
 * POST { date, stage?, dictationText?, reciteText?, listenIncrement? }
 */
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date")
  try {
    if (!date || date === todayKey()) {
      const lesson = await getOrCreateToday()
      return NextResponse.json({ lesson, recent: listRecent() })
    }
    if (!isLessonId(date)) {
      return NextResponse.json({ error: "bad date" }, { status: 400 })
    }
    const lesson = getLesson(date)
    if (!lesson) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({ lesson, recent: listRecent() })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "dictation failed"
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    date?: string
    stage?: DictationStage
    dictationText?: string
    reciteText?: string
    listenIncrement?: boolean
  }
  const date = body.date ?? todayKey()
  const lesson = getLesson(date)
  if (!lesson) return NextResponse.json({ error: "not found" }, { status: 404 })

  const patch: Parameters<typeof saveProgress>[1] = {}
  if (body.stage && STAGES.has(body.stage)) patch.stage = body.stage
  if (typeof body.dictationText === "string") patch.dictationText = body.dictationText
  if (typeof body.reciteText === "string") patch.reciteText = body.reciteText
  if (body.listenIncrement) patch.listens = lesson.listens + 1

  const saved = saveProgress(date, patch)
  return NextResponse.json({ lesson: saved })
}
