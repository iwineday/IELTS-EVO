/**
 * Generate Speaking node content payloads via StepFun LLM (v2).
 *
 * v2 changes vs v1:
 * - LLM switched from Qwen/DashScope to StepFun step_plan channel
 * - Every lesson now carries speaking-first vocabulary:
 *   - keyPhrases: 8-12 conversational chunks/collocations (NOT written-English words)
 *   - sentenceFrames: 5-8 functional spoken sentence frames
 * - Phrases are ALSO inserted into the `phrases` table with deterministic IDs
 *   (`{nodeId}_c{i}` / `{nodeId}_f{i}`) so the frontend can collect them.
 *
 * Run: npm run content:speaking
 */

import { chat, parseJson } from "../src/lib/llm"
import Database from "better-sqlite3"
import { mkdirSync, readFileSync, existsSync } from "node:fs"
import { dirname, resolve } from "node:path"

// tsx does not auto-load .env.local — parse it by hand.
const envPath = resolve(process.cwd(), ".env.local")
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=")
    if (i > 0 && !line.trim().startsWith("#")) {
      const k = line.slice(0, i).trim()
      if (!process.env[k]) process.env[k] = line.slice(i + 1).trim()
    }
  }
}

const DB_PATH = process.env.IELTS_DB_PATH ?? "./data/ielts.db"
const GENERATOR_VERSION = "v2-stepfun"

interface NodeSeed {
  id: string
  cluster: string
  title: string
}

const NODES: NodeSeed[] = [
  // Apartment
  { id: "spk_apt_1", cluster: "apartment", title: "Self-introduction" },
  { id: "spk_apt_2", cluster: "apartment", title: "Hometown" },
  { id: "spk_apt_3", cluster: "apartment", title: "Daily Routine" },
  { id: "spk_apt_4", cluster: "apartment", title: "Family" },
  // Cafe
  { id: "spk_cafe_1", cluster: "cafe", title: "Order a Coffee" },
  { id: "spk_cafe_2", cluster: "cafe", title: "Small Talk" },
  { id: "spk_cafe_3", cluster: "cafe", title: "Pay & Tip" },
  { id: "spk_cafe_4", cluster: "cafe", title: "Cold Drink Complaint" },
  // Supermarket
  { id: "spk_mkt_1", cluster: "market", title: "Find an Item" },
  { id: "spk_mkt_2", cluster: "market", title: "Ask About a Discount" },
  { id: "spk_mkt_3", cluster: "market", title: "Checkout" },
  { id: "spk_mkt_4", cluster: "market", title: "Use a Coupon" },
  // Bus stop
  { id: "spk_bus_1", cluster: "busstop", title: "Ask for Directions" },
  { id: "spk_bus_2", cluster: "busstop", title: "Buy a Ticket" },
  { id: "spk_bus_3", cluster: "busstop", title: "Weather Small Talk" },
  { id: "spk_bus_4", cluster: "busstop", title: "Missed the Bus" },
  // Park
  { id: "spk_park_1", cluster: "park", title: "Hobbies & Free Time" },
  { id: "spk_park_2", cluster: "park", title: "Sport & Exercise" },
  { id: "spk_park_3", cluster: "park", title: "A Place You Relax (Part 2: describe a peaceful place you like)" },
  { id: "spk_park_4", cluster: "park", title: "Outdoor Life Debate (Part 3: city parks, outdoor lifestyles)" },
  // Campus
  { id: "spk_cam_1", cluster: "campus", title: "Work or Study?" },
  { id: "spk_cam_2", cluster: "campus", title: "Learning English" },
  { id: "spk_cam_3", cluster: "campus", title: "A Teacher You Remember (Part 2: describe a teacher who influenced you)" },
  { id: "spk_cam_4", cluster: "campus", title: "Education Debate (Part 3: exams, online learning)" },
  // Airport
  { id: "spk_air_1", cluster: "airport", title: "Holidays & Travel" },
  { id: "spk_air_2", cluster: "airport", title: "At the Check-in Desk" },
  { id: "spk_air_3", cluster: "airport", title: "A Memorable Trip (Part 2: describe a journey you remember well)" },
  { id: "spk_air_4", cluster: "airport", title: "Tourism Debate (Part 3: mass tourism pros & cons)" },
  // Cinema
  { id: "spk_cin_1", cluster: "cinema", title: "Films & TV" },
  { id: "spk_cin_2", cluster: "cinema", title: "Music" },
  { id: "spk_cin_3", cluster: "cinema", title: "A Film You Loved (Part 2: describe a film that impressed you)" },
  { id: "spk_cin_4", cluster: "cinema", title: "Screens & Society (Part 3: streaming, phones, AI and media)" },
]

const CLUSTER_ROLES: Record<string, string> = {
  apartment: "a friendly neighbor or flatmate visiting your apartment. This is an informal, relaxed IELTS Part 1 setting where you answer personal questions.",
  cafe: "a barista at a local café. The conversation happens at the counter — ordering, paying, chatting.",
  market: "a supermarket staff member — could be a shelf-stocker, cashier, or customer service desk attendant.",
  busstop: "a stranger at a bus stop or a bus driver. The conversation is brief, practical, outdoors.",
  park: "a friendly jogger you often bump into at the city park. Relaxed IELTS Part 1/2/3 chat while walking around the lake — hobbies, sport, favourite places, and light debates about outdoor life.",
  campus: "a visiting exchange student you show around campus. Curious and chatty — asks classic IELTS work/study questions, about learning English, memorable teachers, and opinions on education.",
  airport: "either a fellow traveller at the gate or an airline check-in agent, depending on the lesson. Travel small talk, practical check-in interactions, trip stories, and tourism discussions.",
  cinema: "a film-buff friend queueing with you outside a retro cinema. Chats about films, music, favourite movies, and how screens and streaming are changing society.",
}

const SYSTEM_PROMPT = `You are an IELTS Speaking lesson designer. Everything you produce must serve SPOKEN English practice — never written-English word lists.

Output a single JSON object (no markdown) with:

- scenarioContext: 2-3 vivid sentences describing where the learner is and what's happening. English.
- scenarioRole: who the NPC is (e.g. "a friendly barista named Sam").
- openingLine: NPC's natural first line, 1-2 sentences.
- part1Questions: 4-6 questions the NPC will work through, simple → slightly complex. [{question, hint}]
- keyPhrases: 8-12 SPOKEN chunks/collocations a learner should use in this exact scenario. These must be things natives actually SAY ("grab a coffee", "I'm running late", "that'd be great"), never academic/written vocabulary. Each: {text, zh (Chinese gloss), example (one natural spoken sentence)}
- sentenceFrames: 5-8 functional spoken sentence frames with a gap to fill ("Could I get ... instead?", "To be honest, I'm not a big fan of ..."). Each: {frame, func (communicative function in Chinese, e.g. 点单/委婉拒绝/闲聊开场), zh, example}
- targetBand: minimum band to aim for (5.5 + 0.5 per difficulty level above 1).

Make it realistic, culturally appropriate, and speakable by an intermediate learner.`

interface GeneratedPayload {
  scenarioContext: string
  scenarioRole: string
  openingLine: string
  part1Questions: Array<{ question: string; hint: string }>
  keyPhrases: Array<{ text: string; zh: string; example: string; phraseId?: string }>
  sentenceFrames: Array<{ frame: string; func: string; zh: string; example: string; phraseId?: string }>
  targetBand: number
}

async function generatePayload(node: NodeSeed): Promise<GeneratedPayload> {
  const role = CLUSTER_ROLES[node.cluster]
  const prompt = `Generate scenario content for IELTS Speaking lesson "${node.title}" (cluster: ${node.cluster}).
The NPC role is: ${role}
Node ID: ${node.id}
Generate now. JSON only.`

  // LLM occasionally emits broken JSON — retry up to 2 times.
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await chat(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        { jsonMode: true, maxTokens: 6000, temperature: 0.7 },
      )
      return parseJson<GeneratedPayload>(result.text)
    } catch (e) {
      lastErr = e
      if (attempt < 2) console.log(`    ↻ retry ${attempt + 1} (${e instanceof Error ? e.message : e})`)
    }
  }
  throw lastErr
}

async function main() {
  // --only spk_cafe_3,spk_bus_1 → regenerate a subset
  // (PowerShell mangles comma args — the ONLY env var is the reliable path there)
  const onlyArg = process.argv.find((a) => a.startsWith("--only"))
  const onlyRaw = process.env.ONLY
    ?? (onlyArg
      ? (onlyArg.includes("=") ? onlyArg.split("=")[1] : process.argv[process.argv.indexOf(onlyArg) + 1] ?? "")
      : null)
  const onlyIds = onlyRaw ? onlyRaw.split(",").map((s) => s.trim()).filter(Boolean) : null
  const targets = onlyIds ? NODES.filter((n) => onlyIds.includes(n.id)) : NODES

  mkdirSync(dirname(DB_PATH), { recursive: true })
  const db = new Database(DB_PATH)
  db.pragma("journal_mode = WAL")

  const updateNode = db.prepare("UPDATE nodes SET payload = ?, generator_version = ? WHERE id = ?")
  const upsertPhrase = db.prepare(`
    INSERT INTO phrases (id, node_id, kind, text, zh, example, func)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET text=excluded.text, zh=excluded.zh, example=excluded.example, func=excluded.func
  `)

  console.log(`[content:speaking] Generating v2 payloads for ${targets.length} nodes via StepFun...`)

  let failed = 0
  for (const node of targets) {
    console.log(`  → ${node.id}: ${node.title}`)
    try {
      const payload = await generatePayload(node)

      // Assign deterministic phrase IDs + write to phrases table
      payload.keyPhrases = (payload.keyPhrases ?? []).map((p, i) => {
        const phraseId = `${node.id}_c${i}`
        upsertPhrase.run(phraseId, node.id, "chunk", p.text, p.zh ?? null, p.example ?? null, null)
        return { ...p, phraseId }
      })
      payload.sentenceFrames = (payload.sentenceFrames ?? []).map((f, i) => {
        const phraseId = `${node.id}_f${i}`
        upsertPhrase.run(phraseId, node.id, "frame", f.frame, f.zh ?? null, f.example ?? null, f.func ?? null)
        return { ...f, phraseId }
      })

      const jsonStr = JSON.stringify(payload)
      updateNode.run(jsonStr, GENERATOR_VERSION, node.id)
      console.log(`    ✓ ${payload.keyPhrases.length} chunks, ${payload.sentenceFrames.length} frames (${jsonStr.length} chars)`)
    } catch (e) {
      failed++
      console.error(`    ✗ failed: ${e instanceof Error ? e.message : e}`)
    }
  }

  console.log(`[content:speaking] Done. ${targets.length - failed}/${targets.length} nodes generated.`)
  db.close()
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
