import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { and, desc, eq } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { mimoJson, mimoSpeak } from "@/lib/mimo/client"
import { parseJson } from "@/lib/llm"
import { countWords } from "./diff"
import { pickPodcast, podcastExcerpt, podcastsFor } from "./news-podcast"

const USER_ID = "user_default"
const AUDIO_ROOT = join(process.cwd(), "data", "dictation-audio")

export type DictationStage = "listen" | "write" | "memorize" | "recite" | "done"

export interface LessonView {
  id: string
  topic: "tech" | "travel"
  title: string
  summaryZh: string
  wordCount: number
  paragraphCount: number
  sentenceCount: number
  partSize: number
  partCount: number
  checkedParts: number[]
  /** Same length as sentenceCount. Null until that part has been checked. */
  sentences: Array<string | null>
  stage: DictationStage
  listens: number
  dictationText: string
  dictationAccuracy: number | null
  reciteText: string
  reciteAccuracy: number | null
  summaryHtml: string
  /** Full paragraphs once the script may be shown. Null while the piece is still hidden. */
  paragraphs: string[] | null
  /** Chinese for each paragraph. Null until translated, or while the script is hidden. */
  translations: string[] | null
}

const inflight = new Map<string, Promise<LessonView>>()

export function todayKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}

/** `YYYY-MM-DD` is the first piece of that day. `YYYY-MM-DD-2` is the second. */
export function isLessonId(id: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(-2)?$/.test(id)
}

export function lessonDay(id: string): string {
  return id.slice(0, 10)
}

export function lessonSlot(id: string): number {
  return id.endsWith("-2") ? 2 : 1
}

function dayOfYear(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number)
  const start = Date.UTC(y, 0, 1)
  const current = Date.UTC(y, m - 1, d)
  return Math.floor((current - start) / 86400000) + 1
}

const TECH = [
  "how noise-cancelling headphones actually subtract sound",
  "why satellite internet still drops out on a train",
  "the quiet engineering behind a phone camera at night",
  "what happens in the seconds after you tap pay on a bus",
  "how a city times its traffic lights with live data",
  "why laptop batteries swell and how to spot it early",
  "the difference between a map app's route and the road you feel",
  "how a podcast episode is cleaned up before you hear it",
  "why your smart watch guesses sleep worse than it admits",
  "how a small language model fits on a phone",
  "what a data center does with the heat it makes",
  "how e-ink screens hold an image with almost no power",
  "why airplane wifi is slow even when the signal looks full",
  "how a robot vacuum decides a sock is not a cliff",
  "the short life of a notification from server to lock screen",
]

const TRAVEL = [
  "a slow morning train through a coastal town",
  "checking into a tiny apartment and finding the quirks",
  "getting lost on purpose in a night market",
  "what the airport security line is actually sorting",
  "a rainy afternoon in a city museum",
  "riding a local bus to the end of the line",
  "ordering food when you only know ten words",
  "watching a ferry cross a wide river at dusk",
  "packing a carry-on for a four-day trip",
  "a walk from the station to a guesthouse after dark",
  "how a mountain trail changes above the tree line",
  "sharing a table with strangers in a crowded cafe",
  "missing a connection and rebuilding the day",
  "a sunrise over a harbor you have never seen",
  "why the best view in a city is often free and slightly inconvenient",
]

function angleFor(dateKey: string, offset = 0): { topic: "tech" | "travel"; angle: string } {
  const n = dayOfYear(dateKey) + offset
  const topic: "tech" | "travel" = n % 2 === 0 ? "tech" : "travel"
  const bank = topic === "tech" ? TECH : TRAVEL
  return { topic, angle: bank[n % bank.length] }
}

interface Generated {
  title: string
  summaryZh: string
  paragraphs: string[]
}

const PASSAGE_SYSTEM = [
  "You write spoken English monologues for intensive listening dictation.",
  "The listener will type every word they hear, then memorize and recite the piece.",
  "Output a single JSON object with keys title, summaryZh, paragraphs.",
  "title: 4 to 7 English words, no punctuation except spaces.",
  "summaryZh: one short Chinese sentence that names the topic without translating the script.",
  "paragraphs: an array of 4 strings.",
  "Each paragraph is 4 or 5 sentences. Each sentence is 8 to 14 spoken words.",
  "Total 180 to 240 words, about ninety seconds. Short enough to finish in one sitting after it is split into parts.",
  "Voice: a calm narrator talking to one person. Contractions are fine.",
  "Sentences stay between 8 and 18 words. No semicolons, no lists, no quotes, no symbols.",
  "Spell numbers as words, including years (twenty twenty-six).",
  "Use only everyday names if any. No URLs, acronyms spelled letter by letter, or jargon piles.",
  "Concrete scenes and mechanisms, not a vague essay about how important the topic is.",
].join(" ")

async function completeJson(system: string, user: string): Promise<string> {
  return mimoJson(system, user)
}

const PODCAST_SYSTEM = [
  PASSAGE_SYSTEM,
  "The source is one podcast episode from today's news.",
  "Use only claims that appear in the excerpt or the Chinese blurb. Do not invent interviews, numbers, or quotes.",
  "Condense one argument into the monologue. Do not retell the whole episode.",
  "summaryZh must name the show and guest, then one Chinese clause on what this excerpt argues.",
].join(" ")

async function generateFromPodcast(dateKey: string, offset: number): Promise<Generated | null> {
  const podcasts = await podcastsFor(lessonDay(dateKey))
  if (!podcasts.length) return null
  if (offset > 0 && podcasts.length < 2) return null
  const podcast = pickPodcast(dateKey, podcasts, offset)
  const excerpt = await podcastExcerpt(podcast)
  const source = [
    `Show: ${podcast.source}`,
    `Guest: ${podcast.guest || "unknown"}`,
    `Title: ${podcast.title}`,
    `News date: ${podcast.newsDate}`,
    `Blurb: ${podcast.summary}`,
    excerpt ? `Excerpt:\n${excerpt}` : "No transcript excerpt. Base the monologue only on the blurb.",
  ].join("\n")

  const run = async (extra: string) => {
    const raw = await completeJson(PODCAST_SYSTEM, `${source}\n${extra}`.trim())
    return parseJson<Generated>(raw)
  }
  return finishPassage(await run(""), run)
}

async function finishPassage(
  first: Generated,
  retry: (extra: string) => Promise<Generated>,
): Promise<Generated> {
  let gen = first
  const run = retry
  let words = countWords((gen.paragraphs ?? []).join(" "))
  if (words < 160 || words > 280 || !gen.paragraphs?.length) {
    gen = await run(`The previous draft was ${words} words. Hit 180 to 240 words.`)
    words = countWords((gen.paragraphs ?? []).join(" "))
  }
  let paragraphs = (gen.paragraphs ?? []).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean)
  while (countWords(paragraphs.join(" ")) > 280 && paragraphs.length > 2) {
    paragraphs = paragraphs.slice(0, -1)
  }
  words = countWords(paragraphs.join(" "))
  if (!gen.title?.trim() || !gen.summaryZh?.trim() || paragraphs.length < 2 || words < 120) {
    throw new Error("dictation passage failed validation")
  }
  return {
    title: gen.title.replace(/[^\w\s'-]/g, "").replace(/\s+/g, " ").trim(),
    summaryZh: gen.summaryZh.trim(),
    paragraphs,
  }
}

async function generatePassage(dateKey: string, offset: number): Promise<Generated> {
  const fromPodcast = await generateFromPodcast(dateKey, offset)
  if (fromPodcast) return fromPodcast

  const { topic, angle } = angleFor(lessonDay(dateKey), offset)
  const topicLabel = topic === "tech" ? "technology" : "travel"
  const run = async (extra: string) => {
    const raw = await completeJson(PASSAGE_SYSTEM, `Date ${dateKey}. Topic: ${topicLabel}. Angle: ${angle}. ${extra}`.trim())
    return parseJson<Generated>(raw)
  }
  return finishPassage(await run(""), run)
}

export const PART_SIZE = 8

export function partRange(sentenceCount: number, part: number) {
  const count = Math.max(1, Math.ceil(sentenceCount / PART_SIZE))
  const index = Math.min(Math.max(part, 0), count - 1)
  const from = index * PART_SIZE
  const to = Math.min(sentenceCount, from + PART_SIZE)
  return { index, count, from, to }
}

function parseCheckedParts(raw: string | null | undefined): number[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isInteger(n)) : []
  } catch {
    return []
  }
}
export function splitSentences(paragraphs: string[]): string[] {
  const out: string[] = []
  for (const paragraph of paragraphs) {
    const parts = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []
    for (const part of parts) {
      const sentence = part.trim()
      if (sentence) out.push(sentence)
    }
  }
  return out
}

function toView(
  lesson: typeof schema.dictationLessons.$inferSelect,
  progress: typeof schema.dictationProgress.$inferSelect | undefined,
  reveal: boolean,
): LessonView {
  const paragraphs = lesson.paragraphs ?? []
  const sentences = splitSentences(paragraphs)
  const checkedParts = parseCheckedParts(progress?.checkedParts)
  const checked = progress?.dictationAccuracy != null || checkedParts.length > 0 || Boolean(progress?.summaryHtml?.trim())
    return {
    id: lesson.id,
    topic: lesson.topic,
    title: lesson.title,
    summaryZh: lesson.summaryZh,
    wordCount: lesson.wordCount,
    paragraphCount: paragraphs.length,
    sentenceCount: sentences.length,
    partSize: PART_SIZE,
    partCount: Math.max(1, Math.ceil(sentences.length / PART_SIZE)),
    checkedParts,
    sentences: sentences.map((sentence) => (checked ? sentence : null)),
    paragraphs: checked ? paragraphs : null,
    translations: checked ? (lesson.translations ?? null) : null,
    stage: progress?.stage as DictationStage ?? "listen",
    listens: progress?.listens ?? 0,
    dictationText: progress?.dictationText ?? "",
    dictationAccuracy: progress?.dictationAccuracy ?? null,
    reciteText: progress?.reciteText ?? "",
    reciteAccuracy: progress?.reciteAccuracy ?? null,
    summaryHtml: progress?.summaryHtml ?? "",
  }
}

/** One Chinese paragraph per English paragraph. Stored on the lesson so 对照背 does not translate again. */
export async function translationsFor(lessonId: string): Promise<string[]> {
  const db = getDb()
  const [lesson] = db.select().from(schema.dictationLessons).where(eq(schema.dictationLessons.id, lessonId)).all()
  if (!lesson?.paragraphs?.length) throw new Error("not found")
  if (lesson.translations?.length === lesson.paragraphs.length && lesson.translations.every((line) => line.trim())) {
    return lesson.translations
  }
  const raw = await mimoJson(
    "你把英语口语段落译成自然的中文，给学习者对照背诵。按原段顺序，一段一段译，不合并，不省略。输出 JSON：{\"translations\":[\"与每一段对应的中文\"]}。",
    lesson.paragraphs.map((paragraph, index) => `${index + 1}. ${paragraph}`).join("\n\n"),
  )
  const parsed = parseJson<{ translations?: string[] }>(raw)
  const translations = lesson.paragraphs.map((_, index) => (parsed.translations?.[index] ?? "").trim())
  if (translations.some((line) => !line)) throw new Error("translation failed")
  db.update(schema.dictationLessons)
    .set({ translations })
    .where(eq(schema.dictationLessons.id, lessonId))
    .run()
  return translations
}

export async function ensureLesson(id: string): Promise<LessonView> {
  if (!isLessonId(id)) throw new Error("bad date")
  const pending = inflight.get(id)
  if (pending) return pending

  const job = (async () => {
    const db = getDb()
    const [existing] = db.select().from(schema.dictationLessons).where(eq(schema.dictationLessons.id, id)).all()
    if (!existing) {
      const offset = lessonSlot(id) - 1
      const gen = await generatePassage(id, offset)
      const podcasts = await podcastsFor(lessonDay(id))
      const topic = podcasts.length > offset ? "tech" : angleFor(lessonDay(id), offset).topic
      db.insert(schema.dictationLessons)
        .values({
          id,
          topic,
          title: gen.title,
          summaryZh: gen.summaryZh,
          paragraphs: gen.paragraphs,
          wordCount: countWords(gen.paragraphs.join(" ")),
        })
        .run()
      try {
        await translationsFor(id)
      } catch {
        // The piece is stored. Chinese can be filled when 对照背 is opened.
      }
    }
    const [lesson] = db.select().from(schema.dictationLessons).where(eq(schema.dictationLessons.id, id)).all()
    const [progress] = db
      .select()
      .from(schema.dictationProgress)
      .where(and(eq(schema.dictationProgress.userId, USER_ID), eq(schema.dictationProgress.lessonId, id)))
      .all()
    return toView(lesson, progress, false)
  })()

  inflight.set(id, job)
  try {
    return await job
  } finally {
    inflight.delete(id)
  }
}

export async function getOrCreateToday(): Promise<LessonView> {
  return ensureLesson(todayKey())
}

/** The other piece from the same day. Creates the second one if it is not stored yet. */
export async function openNextLesson(currentId: string): Promise<LessonView> {
  const day = isLessonId(currentId) ? lessonDay(currentId) : todayKey()
  const nextId = currentId.endsWith("-2") ? day : `${day}-2`
  return ensureLesson(nextId)
}

export function getLesson(dateKey: string): LessonView | null {
  const db = getDb()
  const [lesson] = db.select().from(schema.dictationLessons).where(eq(schema.dictationLessons.id, dateKey)).all()
  if (!lesson) return null
  const [progress] = db
    .select()
    .from(schema.dictationProgress)
    .where(and(eq(schema.dictationProgress.userId, USER_ID), eq(schema.dictationProgress.lessonId, dateKey)))
    .all()
  return toView(lesson, progress, false)
}

export function listArchive() {
  const db = getDb()
  const lessons = db.select().from(schema.dictationLessons).orderBy(desc(schema.dictationLessons.id)).all()
  return lessons.map((lesson) => {
    const [progress] = db
      .select()
      .from(schema.dictationProgress)
      .where(and(eq(schema.dictationProgress.userId, USER_ID), eq(schema.dictationProgress.lessonId, lesson.id)))
      .all()
    return {
      id: lesson.id,
      topic: lesson.topic,
      title: lesson.title,
      summaryZh: lesson.summaryZh,
      wordCount: lesson.wordCount,
      stage: (progress?.stage ?? "listen") as DictationStage,
      hasSummary: Boolean(progress?.summaryHtml?.trim()),
    }
  })
}

export function listRecent(limit = 14) {
  const db = getDb()
  const lessons = db.select().from(schema.dictationLessons).orderBy(desc(schema.dictationLessons.id)).limit(limit).all()
  return lessons.map((lesson) => {
    const [progress] = db
      .select()
      .from(schema.dictationProgress)
      .where(and(eq(schema.dictationProgress.userId, USER_ID), eq(schema.dictationProgress.lessonId, lesson.id)))
      .all()
    return {
      id: lesson.id,
      topic: lesson.topic,
      title: lesson.title,
      summaryZh: lesson.summaryZh,
      wordCount: lesson.wordCount,
      stage: (progress?.stage ?? "listen") as DictationStage,
      dictationAccuracy: progress?.dictationAccuracy ?? null,
      reciteAccuracy: progress?.reciteAccuracy ?? null,
    }
  })
}

function ensureProgress(lessonId: string) {
  const db = getDb()
  const [row] = db
    .select()
    .from(schema.dictationProgress)
    .where(and(eq(schema.dictationProgress.userId, USER_ID), eq(schema.dictationProgress.lessonId, lessonId)))
    .all()
  if (row) return row
  db.insert(schema.dictationProgress)
    .values({ userId: USER_ID, lessonId, stage: "listen" })
    .run()
  const [created] = db
    .select()
    .from(schema.dictationProgress)
    .where(and(eq(schema.dictationProgress.userId, USER_ID), eq(schema.dictationProgress.lessonId, lessonId)))
    .all()
  return created
}

export function saveProgress(
  lessonId: string,
  patch: Partial<{
    listens: number
    dictationText: string
    stage: DictationStage
    reciteText: string
    summaryHtml: string
  }>,
) {
  const db = getDb()
  ensureProgress(lessonId)
  db.update(schema.dictationProgress)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(schema.dictationProgress.userId, USER_ID), eq(schema.dictationProgress.lessonId, lessonId)))
    .run()
  return getLesson(lessonId)
}

export function lessonSentences(lessonId: string): string[] | null {
  const db = getDb()
  const [lesson] = db.select().from(schema.dictationLessons).where(eq(schema.dictationLessons.id, lessonId)).all()
  if (!lesson?.paragraphs) return null
  return splitSentences(lesson.paragraphs)
}

async function synthesizeParagraph(text: string): Promise<Buffer> {
  return mimoSpeak(text)
}

export async function audioForSentence(lessonId: string, index: number): Promise<{ bytes: Buffer; contentType: string }> {
  const sentences = lessonSentences(lessonId)
  if (!sentences || index < 0 || index >= sentences.length) {
    throw new Error("sentence not found")
  }
  const dir = join(AUDIO_ROOT, lessonId)
  const file = join(dir, `s${index}.wav`)
  if (existsSync(file)) {
    return { bytes: readFileSync(file), contentType: "audio/wav" }
  }

  const buf = await synthesizeParagraph(sentences[index])
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, buf)
  return { bytes: buf, contentType: "audio/wav" }
}
