import { NextRequest, NextResponse } from "next/server"
import { getDb, schema } from "@/db"
import { eq, and } from "drizzle-orm"
import { chat, parseJson } from "@/lib/llm"

const USER_ID = "user_default"

/** Review intervals (days) indexed by mastery step 0..4 — simplified SM-2. */
const INTERVAL_DAYS = [1, 2, 5, 12, 30]

/**
 * Spoken-recall review: the learner sees the Chinese gloss + situation and
 * SAYS the phrase out loud. We judge the ASR transcript for equivalence.
 *
 * POST { phraseId, transcript } →
 *   { verdict: "pass" | "close" | "fail", comment, mastery, nextReviewDays }
 */
export async function POST(req: NextRequest) {
  const { phraseId, transcript } = (await req.json()) as {
    phraseId?: string
    transcript?: string
  }
  if (!phraseId || !transcript?.trim()) {
    return NextResponse.json({ error: "phraseId and transcript required" }, { status: 400 })
  }

  const db = getDb()
  const [phrase] = db
    .select()
    .from(schema.phrases)
    .where(eq(schema.phrases.id, phraseId))
    .limit(1)
    .all()
  if (!phrase) {
    return NextResponse.json({ error: "phrase not found" }, { status: 404 })
  }

  const [up] = db
    .select()
    .from(schema.userPhrases)
    .where(and(eq(schema.userPhrases.userId, USER_ID), eq(schema.userPhrases.phraseId, phraseId)))
    .limit(1)
    .all()
  if (!up) {
    return NextResponse.json({ error: "phrase not in user's collection" }, { status: 404 })
  }

  // LLM equivalence judgement — spoken English is flexible, exact match not required.
  const result = await chat(
    [
      {
        role: "system",
        content: `You judge whether a learner's SPOKEN attempt expresses the same meaning and uses (or closely paraphrases) the target spoken phrase. ASR may drop punctuation/casing — ignore that.
Verdicts:
- "pass": target phrase used correctly, or a natural equivalent that clearly shows mastery
- "close": right idea but noticeably off wording / broken grammar
- "fail": wrong meaning or target phrase absent
comment: one short Chinese sentence of feedback.
Respond ONLY with JSON: {"verdict": "pass" | "close" | "fail", "comment": "..."}`,
      },
      {
        role: "user",
        content: `Target phrase: "${phrase.text}"${phrase.zh ? ` (中文: ${phrase.zh})` : ""}${phrase.example ? `\nExample: ${phrase.example}` : ""}\nLearner said: "${transcript.trim()}"`,
      },
    ],
    { jsonMode: true, maxTokens: 1500, temperature: 0.2 },
  )

  let judged: { verdict: "pass" | "close" | "fail"; comment: string }
  try {
    judged = parseJson(result.text)
  } catch {
    judged = { verdict: "close", comment: "评审服务开小差了，本次按接近处理。" }
  }

  // Update mastery + schedule
  let mastery = up.mastery
  if (judged.verdict === "pass") mastery = Math.min(1, mastery + 0.25)
  else if (judged.verdict === "close") mastery = Math.min(1, mastery + 0.1)
  else mastery = Math.max(0, mastery - 0.25)

  const step = Math.min(4, Math.round(mastery * 4))
  const nextDays = judged.verdict === "fail" ? 1 : INTERVAL_DAYS[step]
  const reviewAfter = new Date(Date.now() + nextDays * 24 * 3600 * 1000)

  db.update(schema.userPhrases)
    .set({ mastery, reviewAfter, updatedAt: new Date() })
    .where(and(eq(schema.userPhrases.userId, USER_ID), eq(schema.userPhrases.phraseId, phraseId)))
    .run()

  return NextResponse.json({
    verdict: judged.verdict,
    comment: judged.comment,
    mastery,
    nextReviewDays: nextDays,
  })
}
