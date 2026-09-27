import { NextRequest, NextResponse } from "next/server"
import { getDb, schema } from "@/db"
import { eq, and } from "drizzle-orm"
import { randomUUID } from "node:crypto"

const USER_ID = "user_default"

/**
 * Phrasebook — the learner's personal spoken-phrase collection.
 *
 * GET  → { items: [{ phrase, mastery, reviewAfter, source, due }], dueCount }
 * POST { phraseId } — collect an existing lesson phrase
 * POST { text, zh?, example?, nodeId?, kind? } — collect a custom/feedback phrase
 */
export async function GET() {
  const db = getDb()
  const rows = db
    .select({
      phrase: schema.phrases,
      mastery: schema.userPhrases.mastery,
      reviewAfter: schema.userPhrases.reviewAfter,
      source: schema.userPhrases.source,
    })
    .from(schema.userPhrases)
    .innerJoin(schema.phrases, eq(schema.userPhrases.phraseId, schema.phrases.id))
    .where(eq(schema.userPhrases.userId, USER_ID))
    .all()

  const now = Date.now()
  const items = rows.map((r) => ({
    ...r,
    due: !r.reviewAfter || r.reviewAfter.getTime() <= now,
  }))
  return NextResponse.json({
    items,
    dueCount: items.filter((i) => i.due).length,
  })
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    phraseId?: string
    text?: string
    zh?: string
    example?: string
    nodeId?: string
    kind?: "chunk" | "frame"
    source?: "lesson" | "feedback"
  }
  const db = getDb()

  let phraseId = body.phraseId

  // Custom phrase (e.g. a betterExpression from feedback): create the phrase row first.
  if (!phraseId) {
    if (!body.text?.trim()) {
      return NextResponse.json({ error: "phraseId or text required" }, { status: 400 })
    }
    // Reuse an identical existing phrase if present
    const [existing] = db
      .select()
      .from(schema.phrases)
      .where(eq(schema.phrases.text, body.text.trim()))
      .limit(1)
      .all()
    if (existing) {
      phraseId = existing.id
    } else {
      phraseId = randomUUID()
      db.insert(schema.phrases)
        .values({
          id: phraseId,
          nodeId: body.nodeId ?? null,
          kind: body.kind ?? "frame",
          text: body.text.trim(),
          zh: body.zh ?? null,
          example: body.example ?? null,
        })
        .run()
    }
  }

  // Upsert the user_phrases row (ignore if already collected)
  const [already] = db
    .select()
    .from(schema.userPhrases)
    .where(and(eq(schema.userPhrases.userId, USER_ID), eq(schema.userPhrases.phraseId, phraseId)))
    .limit(1)
    .all()

  if (!already) {
    db.insert(schema.userPhrases)
      .values({
        userId: USER_ID,
        phraseId,
        mastery: 0,
        reviewAfter: new Date(), // due immediately for first spoken recall
        source: body.source ?? "feedback",
      })
      .run()
  }

  return NextResponse.json({ ok: true, phraseId })
}
