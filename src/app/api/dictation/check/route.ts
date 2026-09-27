import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { compareDictation, diffWords } from "@/lib/dictation/diff"
import { getLesson, lessonSentences, todayKey } from "@/lib/dictation/lesson"

const USER_ID = "user_default"

/**
 * Compare a dictation or a recitation against the hidden script.
 * POST { date?, phase: "dictation" | "recite", text, part?, draft? }
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    date?: string
    phase?: "dictation" | "recite"
    text?: string
    part?: number
    draft?: string
  }
  const date = body.date ?? todayKey()
  const phase = body.phase
  const text = body.text ?? ""
  if (phase !== "dictation" && phase !== "recite") {
    return NextResponse.json({ error: "phase required" }, { status: 400 })
  }
  if (!text.trim()) {
    return NextResponse.json({ error: "text required" }, { status: 400 })
  }

  const db = getDb()
  const sentences = lessonSentences(date)
  if (!sentences) return NextResponse.json({ error: "not found" }, { status: 404 })

  let hits = 0
  let total = 0
  const attemptLines = (body.draft ?? text).split("\n")
  for (let i = 0; i < sentences.length; i++) {
    const one = compareDictation(sentences[i], attemptLines[i] ?? "")
    hits += one.hits
    total += one.total
  }
  const diff = { accuracy: total === 0 ? 0 : hits / total, hits, total, alignment: [] as ReturnType<typeof diffWords>["alignment"] }

  const [existing] = db
    .select()
    .from(schema.dictationProgress)
    .where(and(eq(schema.dictationProgress.userId, USER_ID), eq(schema.dictationProgress.lessonId, date)))
    .all()

  const checked = new Set<number>()
  if (existing?.checkedParts) {
    try {
      const parsed = JSON.parse(existing.checkedParts) as unknown
      if (Array.isArray(parsed)) parsed.forEach((n) => { if (Number.isInteger(n)) checked.add(n as number) })
    } catch { /* keep empty */ }
  }
  if (phase === "dictation") {
    for (let i = 0; i < Math.ceil(sentences.length / 8); i++) checked.add(i)
  }

  const values = {
    userId: USER_ID,
    lessonId: date,
    stage: phase === "dictation" ? "memorize" : "recite",
    checkedParts: JSON.stringify([...checked].sort((a, b) => a - b)),
    updatedAt: new Date(),
    ...(phase === "dictation"
      ? {
          dictationText: body.draft ?? text,
          dictationAccuracy: diff.accuracy,
        }
      : {
          reciteText: text,
          reciteAccuracy: diff.accuracy,
        }),
  }

  if (existing) {
    db.update(schema.dictationProgress)
      .set(values)
      .where(and(eq(schema.dictationProgress.userId, USER_ID), eq(schema.dictationProgress.lessonId, date)))
      .run()
  } else {
    db.insert(schema.dictationProgress).values(values).run()
  }

  const lesson = getLesson(date)
  return NextResponse.json({
    accuracy: diff.accuracy,
    hits: diff.hits,
    total: diff.total,
    alignment: diff.alignment,
    lesson,
  })
}
