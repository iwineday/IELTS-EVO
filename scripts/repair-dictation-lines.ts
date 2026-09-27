/**
 * One-off repair for the 2026-09-24 dictation draft.
 * The saved text is a few long paragraphs padded out to 60 lines.
 * Split what was actually written, then place each piece on the reference
 * sentence it belongs to. A reference with nothing written stays blank.
 *
 *   npx tsx scripts/repair-dictation-lines.ts
 *   npx tsx scripts/repair-dictation-lines.ts --write
 */
import { rawDb } from "../src/db"
import { splitSentences } from "../src/lib/dictation/lesson"
import { tokenize } from "../src/lib/dictation/diff"

const DATE = "2026-09-24"
const WRITE = process.argv.includes("--write")

const NUMBER_WORDS: Record<string, string> = {
  seven: "7", thirty: "30", twenty: "20", forty: "40", five: "5",
  fifteen: "15", eight: "8", fortyfive: "45",
}

function normTokens(raw: string): string[] {
  const folded = raw
    .toLowerCase()
    .replace(/7\s*:\s*30|7\.30/g, "7 30")
    .replace(/(\d+)\s*:\s*00/g, "$1")
    .replace(/-/g, "")
  return tokenize(folded).map((word) => NUMBER_WORDS[word] ?? word)
}

function splitWritten(raw: string): string[] {
  const text = raw
    .replace(/\n+/g, " ")
    .replace(/([.!?])([A-Z])/g, "$1 $2")
    .replace(/([a-z])\s+(And|But|The|It|By|When|After)\b/g, "$1. $2")
    .replace(/\s+/g, " ")
    .trim()
  return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => tokenize(s).length > 0)
}

function overlap(reference: string, attempt: string): number {
  const ref = normTokens(reference)
  const got = new Set(normTokens(attempt))
  if (ref.length === 0 || got.size === 0) return 0
  let hit = 0
  for (const word of ref) if (got.has(word)) hit++
  return hit / ref.length
}

/** Ordered alignment. Several short attempts may join one reference. Unmatched references stay blank. */
function align(references: string[], attempts: string[]): string[] {
  const n = references.length
  const m = attempts.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))
  const take: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      let best = dp[i + 1][j]
      let used = 0
      for (let k = 1; k <= 3 && j + k <= m; k++) {
        const chunk = attempts.slice(j, j + k).join(" ")
        const sim = overlap(references[i], chunk)
        if (sim < 0.22) continue
        const score = sim + dp[i + 1][j + k]
        if (score > best) {
          best = score
          used = k
        }
      }
      dp[i][j] = best
      take[i][j] = used
    }
  }

  const out = Array.from({ length: n }, () => "")
  let i = 0
  let j = 0
  while (i < n && j < m) {
    const k = take[i][j]
    if (k > 0) {
      out[i] = attempts.slice(j, j + k).join(" ")
      j += k
      i++
    } else {
      i++
    }
  }
  return out
}

function main() {
  const db = rawDb()
  const lesson = db.prepare("select paragraphs from dictation_lessons where id = ?").get(DATE) as { paragraphs: string } | undefined
  const progress = db.prepare("select dictation_text from dictation_progress where lesson_id = ?").get(DATE) as { dictation_text: string } | undefined
  if (!lesson || !progress) throw new Error("missing 2026-09-24 lesson or draft")

  const references = splitSentences(JSON.parse(lesson.paragraphs) as string[])
  const attempts = splitWritten(progress.dictation_text)
  const slots = align(references, attempts)
  const filled = slots.filter((s) => s.trim()).length

  console.log(`references ${references.length}, written pieces ${attempts.length}, placed ${filled}, blank ${references.length - filled}`)
  slots.forEach((slot, index) => {
    const mark = slot.trim() ? `${Math.round(overlap(references[index], slot) * 100)}%` : "空"
    console.log(`\n${String(index + 1).padStart(2, "0")} [${mark}] ${references[index]}`)
    if (slot.trim()) console.log(`    ${slot}`)
  })

  if (!WRITE) {
    console.log("\nDry run. Pass --write to save dictation_text.")
    return
  }

  db.prepare("update dictation_progress set dictation_text = ? where lesson_id = ?")
    .run(slots.join("\n"), DATE)
  console.log("\nWrote", slots.length, "lines.")
}

main()
