import { NextRequest, NextResponse } from "next/server"
import { compareDictation } from "@/lib/dictation/diff"
import { getLesson, lessonSentences, saveProgress, todayKey } from "@/lib/dictation/lesson"
import { mimoJson } from "@/lib/mimo/client"

/**
 * Coaching note for one dictation. Arabic numerals count as the same as number words.
 * POST { date?, draft } → { html }
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { date?: string; draft?: string }
  const date = body.date ?? todayKey()
  const draft = body.draft ?? ""
  const sentences = lessonSentences(date)
  if (!sentences) return NextResponse.json({ error: "not found" }, { status: 404 })

  const lines = draft.split("\n")
  const notes: string[] = []
  let written = 0
  for (let i = 0; i < sentences.length; i++) {
    const attempt = (lines[i] ?? "").trim()
    if (!attempt) {
      notes.push(`${i + 1}. 整句没写。原文意思：${sentences[i]}`)
      continue
    }
    written++
    const diff = compareDictation(sentences[i], attempt)
    if (diff.accuracy >= 0.9) continue
    const missed = diff.alignment.filter((token) => token.status === "miss").map((token) => token.text)
    const extra = diff.alignment.filter((token) => token.status === "extra").map((token) => token.text)
    notes.push(
      [
        `${i + 1}.`,
        `听到的大意：${attempt}`,
        missed.length ? `没抓住：${missed.join(" ")}` : "",
        extra.length ? `多出来的意思：${extra.join(" ")}` : "",
      ].filter(Boolean).join(" "),
    )
  }

  const shown = notes.slice(0, 24)
  let html = ""
  try {
    const raw = await mimoJson(
      "你是英语精听教练。写一份给学习者看的总结，用中文。数字写法、连词缩写（it's 和 it is）、连字符（open-source 和 open source）只要是同一个说法就算对，绝不能把这些当成错误。不要逐句对比原文和听写。要归纳错误堆在哪一类，以及下次听的时候注意什么。学习者没写出来的生词，多半是因为不认识，必须给出中文意思。",
      [
        `共 ${sentences.length} 句，写了 ${written} 句。`,
        "下面只列出听写后仍然对不上的地方。缩写、连字符和数字写法已经算对，不要再提。",
        shown.join("\n") || "没有明显错误。",
        notes.length > shown.length ? `还有 ${notes.length - shown.length} 处小问题没有列出。` : "",
        "",
        "输出 JSON，字段都是纯文本，不要 HTML：",
        '{"overview":"两三句总评","attention":["需要注意的一点"],"strengthen":["后面具体练什么"],"words":[{"word":"没写出来的英文原词","zh":"中文意思"}]}',
        "attention 最多 4 条，覆盖：听错或不认识的词、句子被写短或意思变了、时态。某一类没有就不要编。strengthen 最多 3 条。",
        "words 只收「没抓住」里的实词，不要收 a、the、of、and、to 这类功能词。每个词用原文里的拼写，zh 用简短中文解释这个词在这句里的意思。没有生词就给空数组。",
      ].filter(Boolean).join("\n"),
    )
    html = renderSummaryHtml(raw)
  } catch (e) {
    const message = e instanceof Error ? e.message : "总结失败"
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const existing = getLesson(date)
  const incomingFilled = draft.split("\n").filter((line) => line.trim()).length
  const storedFilled = (existing?.dictationText ?? "").split("\n").filter((line) => line.trim()).length
  saveProgress(date, {
    summaryHtml: html,
    ...(incomingFilled >= storedFilled ? { dictationText: draft } : {}),
  })
  const lesson = getLesson(date)
  return NextResponse.json({ html, lesson })
}

function renderSummaryHtml(raw: string): string {
  const parsed = JSON.parse(raw) as Record<string, unknown>
  const overview = text(parsed.overview)
  const attention = list(parsed.attention)
  const strengthen = list(parsed.strengthen)
  const words = glosses(parsed.words)
  if (!overview && attention.length === 0 && words.length === 0) throw new Error("总结是空的")
  const items = (title: string, rows: string[]) =>
    rows.length === 0 ? "" : `<h3>${escapeHtml(title)}</h3><ul>${rows.map((row) => `<li>${escapeHtml(row)}</li>`).join("")}</ul>`
  const glossList = words.length === 0
    ? ""
    : `<h3>没写出来的词</h3><ul>${words.map((item) => `<li><b>${escapeHtml(item.word)}</b> ${escapeHtml(item.zh)}</li>`).join("")}</ul>`
  return `<section><h2>这次听写</h2><p>${escapeHtml(overview)}</p>${glossList}${items("需要注意", attention)}${items("后面加强", strengthen)}</section>`
}

function glosses(value: unknown): Array<{ word: string; zh: string }> {
  if (!Array.isArray(value)) return []
  const out: Array<{ word: string; zh: string }> = []
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const row = item as { word?: unknown; zh?: unknown }
    const word = text(row.word)
    const zh = text(row.zh)
    if (word && zh) out.push({ word, zh })
  }
  return out.slice(0, 12)
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => text(item)).filter(Boolean).slice(0, 4)
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}
