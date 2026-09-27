import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import * as schema from "./schema"

const DB_PATH = process.env.IELTS_DB_PATH ?? "./data/ielts.db"

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null
let _raw: Database.Database | null = null

function ensureDictationColumns(raw: Database.Database) {
  const cols = raw.prepare("PRAGMA table_info(dictation_lessons)").all() as Array<{ name: string }>
  if (!cols.some((col) => col.name === "translations")) {
    raw.exec("ALTER TABLE dictation_lessons ADD COLUMN translations TEXT")
  }
}

export function getDb() {
  if (_db && _raw) {
    ensureDictationColumns(_raw)
    return _db
  }
  mkdirSync(dirname(DB_PATH), { recursive: true })
  _raw = new Database(DB_PATH)
  _raw.pragma("journal_mode = WAL")
  _raw.pragma("foreign_keys = ON")
  ensureDictationColumns(_raw)
  _db = drizzle(_raw, { schema })
  return _db
}

export function rawDb() {
  getDb()
  return _raw!
}

export { schema }
