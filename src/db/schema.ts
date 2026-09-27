import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"

/**
 * IELTS Quest schema (SQLite, single-user MVP).
 *
 * One implicit "default user" row for the MVP; multi-user comes later.
 */

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull().default("Learner"),
  level: integer("level").notNull().default(1),
  exp: integer("exp").notNull().default(0),
  gold: integer("gold").notNull().default(0),
  gems: integer("gems").notNull().default(0),
  /** Personal IELTS band goal the learner is aiming for (settable). */
  targetBand: real("target_band").notNull().default(6.5),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
})

export const nodes = sqliteTable("nodes", {
  id: text("id").primaryKey(),
  skill: text("skill", { enum: ["speaking", "writing", "reading", "listening"] }).notNull(),
  /** Map cluster: which building/area on the map this belongs to. */
  cluster: text("cluster").notNull(),
  /** Lesson type. */
  kind: text("kind", { enum: ["lesson", "practice", "boss", "review"] }).notNull(),
  /** Display title shown on the map node tooltip. */
  title: text("title").notNull(),
  /** Short blurb shown when hovering the node. */
  subtitle: text("subtitle"),
  /** Difficulty 1..10. */
  difficulty: integer("difficulty").notNull().default(1),
  /** Reward bundle in gold/exp/gems on a 3-star clear. */
  rewardExp: integer("reward_exp").notNull().default(50),
  rewardGold: integer("reward_gold").notNull().default(10),
  rewardGems: integer("reward_gems").notNull().default(0),
  /** Pixel coords on the cluster map (0..1 normalized). */
  mapX: real("map_x").notNull().default(0.5),
  mapY: real("map_y").notNull().default(0.5),
  /** Free-form payload: scenario script, rubric, generated questions, etc. */
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
  generatorVersion: text("generator_version"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
})

export const edges = sqliteTable("edges", {
  id: text("id").primaryKey(),
  fromNode: text("from_node").notNull().references(() => nodes.id, { onDelete: "cascade" }),
  toNode: text("to_node").notNull().references(() => nodes.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["unlock", "similar", "review"] }).notNull().default("unlock"),
})

export const attempts = sqliteTable("attempts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  nodeId: text("node_id").notNull().references(() => nodes.id, { onDelete: "cascade" }),
  /** 0..3 stars, computed from raw band. */
  stars: integer("stars").notNull().default(0),
  /** Estimated band 0..9 if applicable. */
  band: real("band"),
  /** Full feedback / transcript / essay etc. */
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
})

export const unlocks = sqliteTable("unlocks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  nodeId: text("node_id").notNull().references(() => nodes.id, { onDelete: "cascade" }),
  source: text("source", { enum: ["seed", "progression", "purchase"] }).notNull().default("progression"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
})

export const mastery = sqliteTable("mastery", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  nodeId: text("node_id").notNull().references(() => nodes.id, { onDelete: "cascade" }),
  /** 0..1 current mastery (used by the SRS scheduler). */
  value: real("value").notNull().default(0),
  /** When the SRS thinks this node should resurface. */
  reviewAfter: integer("review_after", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
})

/**
 * Spoken-English phrase bank.
 * Every entry is designed FOR SPEAKING: conversational chunks ("grab a coffee",
 * "I'm running late") and functional sentence frames ("Could I get ... instead?").
 * Rows come from lesson content generation or from agent feedback upgrades.
 */
export const phrases = sqliteTable("phrases", {
  id: text("id").primaryKey(),
  /** Lesson this phrase was generated for (null for feedback-derived ones). */
  nodeId: text("node_id").references(() => nodes.id, { onDelete: "set null" }),
  /** chunk = word chunk / collocation, frame = functional sentence frame. */
  kind: text("kind", { enum: ["chunk", "frame"] }).notNull(),
  text: text("text").notNull(),
  /** Chinese gloss. */
  zh: text("zh"),
  /** A natural spoken example sentence using the phrase. */
  example: text("example"),
  /** Communicative function label (ordering, complaining, small talk...). */
  func: text("func"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
})

/** A learner's personal collection of phrases + spoken-recall SRS state. */
export const userPhrases = sqliteTable("user_phrases", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  phraseId: text("phrase_id").notNull().references(() => phrases.id, { onDelete: "cascade" }),
  /** 0..1 spoken mastery. */
  mastery: real("mastery").notNull().default(0),
  /** Next spoken-recall review due time. */
  reviewAfter: integer("review_after", { mode: "timestamp_ms" }),
  source: text("source", { enum: ["lesson", "feedback"] }).notNull().default("lesson"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
})

/**
 * One intensive-listening passage per calendar day (Asia/Shanghai).
 * Paragraphs are the playback and dictation units; together they run ~5 minutes.
 */
export const dictationLessons = sqliteTable("dictation_lessons", {
  /** YYYY-MM-DD in Asia/Shanghai. */
  id: text("id").primaryKey(),
  topic: text("topic", { enum: ["tech", "travel"] }).notNull(),
  title: text("title").notNull(),
  summaryZh: text("summary_zh").notNull(),
  paragraphs: text("paragraphs", { mode: "json" }).$type<string[]>().notNull(),
  /** Chinese rendering of each paragraph, same order and length as paragraphs. */
  translations: text("translations", { mode: "json" }).$type<string[] | null>(),
  wordCount: integer("word_count").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
})

/** Per-user progress through listen → write → memorize → recite. */
export const dictationProgress = sqliteTable("dictation_progress", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lessonId: text("lesson_id").notNull().references(() => dictationLessons.id, { onDelete: "cascade" }),
  listens: integer("listens").notNull().default(0),
  dictationText: text("dictation_text"),
  dictationAccuracy: real("dictation_accuracy"),
  reciteText: text("recite_text"),
  reciteAccuracy: real("recite_accuracy"),
  /** JSON number array: parts whose script may be shown. */
  checkedParts: text("checked_parts"),
  /** Coaching note for this dictation, stored as an HTML fragment. */
  summaryHtml: text("summary_html"),
  /** listen | write | memorize | recite | done */
  stage: text("stage").notNull().default("listen"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
})

export type Node = typeof nodes.$inferSelect
export type NewNode = typeof nodes.$inferInsert
export type Edge = typeof edges.$inferSelect
export type Attempt = typeof attempts.$inferSelect
export type Unlock = typeof unlocks.$inferSelect
export type Phrase = typeof phrases.$inferSelect
export type UserPhrase = typeof userPhrases.$inferSelect
export type DictationLesson = typeof dictationLessons.$inferSelect
export type DictationProgress = typeof dictationProgress.$inferSelect
