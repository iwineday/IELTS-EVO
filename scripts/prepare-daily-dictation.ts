/**
 * Prepare today's two dictation pieces. Safe to run every morning:
 * an existing piece is left as it is.
 *
 * Run: npx tsx scripts/prepare-daily-dictation.ts
 */
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { ensureLesson, todayKey } from "../src/lib/dictation/lesson"

const envPath = resolve(process.cwd(), ".env.local")
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=")
    if (i > 0 && !line.trim().startsWith("#")) {
      const key = line.slice(0, i).trim()
      if (!process.env[key]) process.env[key] = line.slice(i + 1).trim()
    }
  }
}

const day = todayKey()
async function main() {
  const first = await ensureLesson(day)
  const second = await ensureLesson(`${day}-2`)
  console.log(`${first.id} ${first.summaryZh}`)
  console.log(`${second.id} ${second.summaryZh}`)
}

main()
