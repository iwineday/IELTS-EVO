import { NextRequest, NextResponse } from "next/server"
import { getDb, schema } from "@/db"
import { and, eq, sql } from "drizzle-orm"
import { chat, parseJson, type ChatMessage } from "@/lib/llm"
import { synthesize } from "@/lib/stepfun/tts"

/**
 * Speaking Agent — conversation + final evaluation endpoint (StepFun LLM).
 *
 * POST body:
 *  - nodeId: lesson node id
 *  - action: "turn" (one conversation exchange) | "final" (score whole dialogue)
 *  - history: [{ role: "npc" | "user", text }] — full dialogue so far
 *
 * "turn"  → { npcReply, npcAudioBase64, quickTip, done }
 * "final" → { band, criteria, summary, suggestions, usedPhrases, betterExpressions }
 */

interface Turn {
  role: "npc" | "user"
  text: string
}

interface TurnResponse {
  npcReply: string
  quickTip: string | null
  done: boolean
}

interface FinalResponse {
  band: number
  criteria: { fluency: number; lexical: number; grammar: number; pronunciation: number }
  summary: string
  suggestions: string[]
  usedPhrases: string[]
  betterExpressions: Array<{ original: string; better: string; note: string }>
}

function historyToText(history: Turn[]): string {
  return history
    .map((t) => `${t.role === "npc" ? "NPC" : "Learner"}: ${t.text}`)
    .join("\n")
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { nodeId, action, history } = body as {
    nodeId: string
    action: "turn" | "final"
    history: Turn[]
  }

  if (!nodeId || !action || !Array.isArray(history)) {
    return NextResponse.json({ error: "nodeId, action, history required" }, { status: 400 })
  }

  const db = getDb()
  const [node] = db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.id, nodeId))
    .limit(1)
    .all()

  if (!node) {
    return NextResponse.json({ error: "node not found" }, { status: 404 })
  }

  const payload = (node.payload ?? {}) as Record<string, unknown>
  const scenarioRole = (payload.scenarioRole as string) ?? "a friendly conversation partner"
  const scenarioContext = (payload.scenarioContext as string) ?? node.title
  const questions = (payload.part1Questions ?? []) as Array<{ question: string }>
  const keyPhrases = (payload.keyPhrases ?? []) as Array<{ text: string }>
  const sentenceFrames = (payload.sentenceFrames ?? []) as Array<{ frame: string }>
  const targetList = [
    ...keyPhrases.map((p) => p.text),
    ...sentenceFrames.map((f) => f.frame),
  ]

  const userTurns = history.filter((t) => t.role === "user").length

  if (action === "turn") {
    const totalQuestions = Math.max(questions.length, 4)
    const systemPrompt = `You are Ava, an IELTS Speaking coach role-playing as ${scenarioRole}.
Scenario: ${scenarioContext}
Planned question sequence (guide the conversation through these naturally): ${JSON.stringify(questions.map((q) => q.question))}
The learner has completed ${userTurns} of ~${totalQuestions} exchanges.

Rules:
1. Stay fully in character. Reply in natural spoken English, 1-2 short sentences.
2. React to what the learner just said, then move the conversation toward the next planned question.
3. If the learner has covered all planned questions (${userTurns} >= ${totalQuestions}), wrap up warmly and set done=true.
4. quickTip: ONE ultra-short tip (max 12 words, in Chinese) if the learner made a clear slip; otherwise null.

Respond ONLY with JSON:
{"npcReply": "...", "quickTip": "..." | null, "done": false}`

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Dialogue so far:\n${historyToText(history)}\n\nRespond to the learner's last line.` },
    ]

    const result = await chat(messages, { jsonMode: true, maxTokens: 2000, temperature: 0.8 })

    let turn: TurnResponse
    try {
      turn = parseJson<TurnResponse>(result.text)
    } catch {
      turn = { npcReply: result.text.slice(0, 200) || "Sorry, could you say that again?", quickTip: null, done: false }
    }

    // TTS for NPC reply (non-critical)
    let npcAudioBase64: string | null = null
    try {
      const tts = await synthesize(turn.npcReply)
      npcAudioBase64 = tts.audioBase64
    } catch { /* ignore */ }

    return NextResponse.json({ ...turn, npcAudioBase64 })
  }

  // ─── action === "final" — evaluate the whole conversation ───
  const [user] = db
    .select({ targetBand: schema.users.targetBand })
    .from(schema.users)
    .where(eq(schema.users.id, "user_default"))
    .limit(1)
    .all()
  const targetBand = user?.targetBand ?? 6.5

  const systemPrompt = `You are a strict IELTS Speaking examiner. Evaluate the learner's ENTIRE performance across the dialogue below (only "Learner" lines).

Scenario: ${scenarioContext}
The learner's personal goal is IELTS band ${targetBand}. Target phrases the lesson wanted the learner to use: ${JSON.stringify(targetList)}

Score on the 4 IELTS criteria (0-9, 0.5 steps). Pronunciation must be estimated from vocabulary sophistication and structure only.
Also:
- usedPhrases: which target phrases the learner actually used (exact or close paraphrase).
- betterExpressions: pick 2-4 learner sentences and upgrade each into a more natural, idiomatic SPOKEN version. Keep them short and speakable. note = one-line Chinese explanation of why the upgrade is better.
- suggestions: 2-3 actionable tips in Chinese, focused on SPEAKING (fluency, chunks, fillers), not writing. Frame them as concrete steps to close the gap toward the learner's goal of band ${targetBand}.
- summary: 1-2 encouraging sentences in Chinese that reference how the performance compares to their band ${targetBand} goal.

Respond ONLY with JSON:
{"band": 6.5, "criteria": {"fluency": 6, "lexical": 7, "grammar": 6, "pronunciation": 6.5}, "summary": "...", "suggestions": ["..."], "usedPhrases": ["..."], "betterExpressions": [{"original": "...", "better": "...", "note": "..."}]}`

  const result = await chat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Dialogue:\n${historyToText(history)}` },
    ],
    { jsonMode: true, maxTokens: 3000, temperature: 0.3 },
  )

  let final: FinalResponse
  try {
    final = parseJson<FinalResponse>(result.text)
  } catch {
    final = {
      band: 6,
      criteria: { fluency: 6, lexical: 6, grammar: 6, pronunciation: 6 },
      summary: "本次对话已完成，继续练习吧！",
      suggestions: [],
      usedPhrases: [],
      betterExpressions: [],
    }
  }

  // Persist the attempt
  const stars = final.band >= 7 ? 3 : final.band >= 6.5 ? 2 : final.band >= 6 ? 1 : 0
  db.insert(schema.attempts)
    .values({
      id: crypto.randomUUID(),
      userId: "user_default",
      nodeId,
      stars,
      band: final.band,
      payload: { history, final } as Record<string, unknown>,
    })
    .run()

  // Persist rewards server-side so they survive reloads.
  const expGain = node.rewardExp
  const goldGain = node.rewardGold + final.usedPhrases.length * 5
  db.update(schema.users)
    .set({
      exp: sql`${schema.users.exp} + ${expGain}`,
      gold: sql`${schema.users.gold} + ${goldGain}`,
    })
    .where(eq(schema.users.id, "user_default"))
    .run()

  // 1+ stars unlocks the next node(s) along "unlock" edges.
  let unlockedNodeIds: string[] = []
  if (stars >= 1) {
    unlockedNodeIds = db
      .select({ toNode: schema.edges.toNode })
      .from(schema.edges)
      .where(and(eq(schema.edges.fromNode, nodeId), eq(schema.edges.kind, "unlock")))
      .all()
      .map((e) => e.toNode)
    for (const nid of unlockedNodeIds) {
      db.insert(schema.unlocks)
        .values({ id: crypto.randomUUID(), userId: "user_default", nodeId: nid, source: "progression" })
        .onConflictDoNothing()
        .run()
    }
  }

  return NextResponse.json({ ...final, stars, expGain, goldGain, unlockedNodeIds })
}
