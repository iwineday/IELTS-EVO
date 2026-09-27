"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRecorder } from "@/hooks/useRecorder"
import { speak } from "@/lib/audio"

/* ─── Types ─── */

interface PhraseItem {
  phrase: {
    id: string
    nodeId: string | null
    kind: "chunk" | "frame"
    text: string
    zh: string | null
    example: string | null
    func: string | null
  }
  mastery: number
  reviewAfter: string | null
  source: "lesson" | "feedback"
  due: boolean
}

interface ReviewResult {
  verdict: "pass" | "close" | "fail"
  comment: string
  mastery: number
  nextReviewDays: number
}

type Tab = "all" | "due"

const VERDICT_META = {
  pass: { emoji: "🎉", label: "说对了", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  close: { emoji: "🤏", label: "很接近", cls: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  fail: { emoji: "💪", label: "再练练", cls: "border-rose-400/30 bg-rose-400/10 text-rose-300" },
} as const

export default function PhrasebookPage() {
  const [items, setItems] = useState<PhraseItem[]>([])
  const [dueCount, setDueCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>("all")

  // Review session state
  const [reviewing, setReviewing] = useState(false)
  const [queue, setQueue] = useState<PhraseItem[]>([])
  const [idx, setIdx] = useState(0)
  const [transcript, setTranscript] = useState("")
  const [judging, setJudging] = useState(false)
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [revealed, setRevealed] = useState(false)

  const recorder = useRecorder((text) => setTranscript(text))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/phrasebook")
      const data = await res.json()
      setItems(data.items ?? [])
      setDueCount(data.dueCount ?? 0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const shown = tab === "due" ? items.filter((i) => i.due) : items
  const current = queue[idx]

  /* ─── Review flow ─── */

  const startReview = useCallback(() => {
    const due = items.filter((i) => i.due)
    if (due.length === 0) return
    setQueue(due)
    setIdx(0)
    setTranscript("")
    setResult(null)
    setRevealed(false)
    setReviewing(true)
  }, [items])

  const submitReview = useCallback(async () => {
    if (!current || !transcript.trim() || judging) return
    setJudging(true)
    try {
      const res = await fetch("/api/phrasebook/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phraseId: current.phrase.id, transcript: transcript.trim() }),
      })
      if (!res.ok) throw new Error(`复习服务出错 (${res.status})`)
      const data: ReviewResult = await res.json()
      setResult(data)
    } catch {
      setResult({ verdict: "close", comment: "评审服务开小差了，稍后重试。", mastery: current.mastery, nextReviewDays: 1 })
    } finally {
      setJudging(false)
    }
  }, [current, transcript, judging])

  const nextCard = useCallback(() => {
    setTranscript("")
    setResult(null)
    setRevealed(false)
    if (idx + 1 < queue.length) {
      setIdx(idx + 1)
    } else {
      setReviewing(false)
      void load()
    }
  }, [idx, queue.length, load])

  /* ─── Review mode UI ─── */

  if (reviewing && current) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col px-4 pb-8 pt-4">
        <header className="mb-6 flex items-center justify-between">
          <button onClick={() => { setReviewing(false); void load() }} className="chip transition hover:border-white/25">✕ 退出复习</button>
          <span className="text-sm text-stone-500">{idx + 1} / {queue.length}</span>
        </header>

        {/* Progress */}
        <div className="mb-8 h-1.5 overflow-hidden rounded-full bg-white/5">
          <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all"
            style={{ width: `${((idx + (result ? 1 : 0)) / queue.length) * 100}%` }} />
        </div>

        <div className="flex flex-1 flex-col justify-center">
          {/* Prompt card: show Chinese gloss, learner must SAY the phrase */}
          <section className="card animate-fade-up p-8 text-center">
            <div className="text-xs uppercase tracking-widest text-stone-500">用英语说出来</div>
            <div className="mt-4 text-2xl font-bold text-stone-100">{current.phrase.zh ?? "（无中文提示）"}</div>
            {current.phrase.func && <div className="mt-2"><span className="chip">{current.phrase.func}</span></div>}

            {revealed && (
              <div className="animate-fade-up mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="font-semibold text-orange-300">{current.phrase.text}</div>
                {current.phrase.example && <div className="mt-1 text-xs italic text-stone-500">“{current.phrase.example}”</div>}
                <button onClick={() => void speak(current.phrase.text)} className="mt-2 text-xs text-stone-500 transition hover:text-orange-300">▶ 听发音</button>
              </div>
            )}
            {!revealed && !result && (
              <button onClick={() => setRevealed(true)} className="mt-5 text-xs text-stone-600 underline-offset-2 transition hover:text-stone-400 hover:underline">
                想不起来？看答案（本次不计分也没关系，开口最重要）
              </button>
            )}
          </section>

          {/* Transcript / result */}
          {transcript && !result && (
            <div className="animate-fade-up card mt-4 p-4">
              <div className="mb-1 text-xs text-stone-500">你说的是（可修改）</div>
              <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={2}
                className="w-full resize-none rounded-lg bg-transparent text-stone-100 focus:outline-none" />
              <div className="mt-2 flex gap-2">
                <button onClick={() => void submitReview()} disabled={judging} className="btn-primary flex-1 py-2 text-sm">
                  {judging ? "评审中…" : "提交"}
                </button>
                <button onClick={() => setTranscript("")} className="btn-ghost py-2 text-sm">重说</button>
              </div>
            </div>
          )}

          {result && (
            <div className={`animate-fade-up mt-4 rounded-2xl border p-5 text-center ${VERDICT_META[result.verdict].cls}`}>
              <div className="text-3xl">{VERDICT_META[result.verdict].emoji}</div>
              <div className="mt-1 font-bold">{VERDICT_META[result.verdict].label}</div>
              <p className="mt-2 text-sm opacity-90">{result.comment}</p>
              <p className="mt-2 text-xs opacity-60">熟练度 {(result.mastery * 100).toFixed(0)}% · {result.nextReviewDays} 天后再见</p>
              <button onClick={nextCard} className="btn-primary mt-4 w-full py-3">
                {idx + 1 < queue.length ? "下一个 →" : "完成复习 ✓"}
              </button>
            </div>
          )}
        </div>

        {/* Mic */}
        {!result && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <button
              onClick={() => (recorder.state === "recording" ? recorder.stop() : void recorder.start())}
              disabled={judging || recorder.state === "transcribing"}
              className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl transition active:scale-95 disabled:opacity-40 ${
                recorder.state === "recording"
                  ? "mic-recording bg-rose-500 text-white"
                  : "bg-gradient-to-br from-orange-500 to-amber-500 text-stone-950 shadow-lg shadow-orange-500/30"
              }`}>
              {recorder.state === "transcribing" ? <span className="animate-spin text-xl">◌</span> : recorder.state === "recording" ? "■" : "🎙"}
            </button>
            <p className="text-xs text-stone-600">
              {recorder.error ?? (recorder.state === "recording" ? "正在录音，说完点 ■" : recorder.state === "transcribing" ? "转写中…" : "点麦克风，大声说出来")}
            </p>
          </div>
        )}
      </main>
    )
  }

  /* ─── Collection list UI ─── */

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 pb-8 pt-4">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/map/speaking" className="chip transition hover:border-white/25">← 地图</Link>
        <h1 className="text-lg font-bold text-stone-100">我的句库</h1>
        <span className="w-16" />
      </header>

      {/* Stats + review CTA */}
      <section className="card mb-5 flex items-center justify-between p-5">
        <div className="flex gap-6">
          <div>
            <div className="text-2xl font-black text-stone-100">{items.length}</div>
            <div className="text-xs text-stone-500">已收集</div>
          </div>
          <div>
            <div className={`text-2xl font-black ${dueCount > 0 ? "text-orange-400" : "text-stone-100"}`}>{dueCount}</div>
            <div className="text-xs text-stone-500">待复习</div>
          </div>
        </div>
        <button onClick={startReview} disabled={dueCount === 0} className="btn-primary py-3">
          🎙 开口复习{dueCount > 0 ? ` (${dueCount})` : ""}
        </button>
      </section>

      {/* Tabs */}
      <div className="mb-4 flex gap-2">
        {([["all", "全部"], ["due", "待复习"]] as Array<[Tab, string]>).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`chip transition ${tab === t ? "border-orange-400/40 text-orange-300" : "hover:border-white/25"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="py-20 text-center text-stone-600"><span className="animate-pulse">加载中…</span></div>
      ) : shown.length === 0 ? (
        <div className="card p-10 text-center text-stone-500">
          {tab === "due" ? "没有待复习的句子，去闯关攒点新表达吧 🎉" : (
            <>句库还是空的 —— 在关卡的「备战」页把词块收进来，或在战报里收藏更地道的说法。<br />
              <Link href="/map/speaking" className="btn-primary mt-4 inline-block py-2 text-sm">去闯关</Link></>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((item) => (
            <div key={item.phrase.id} className="card card-hover p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-stone-100">{item.phrase.text}</span>
                    <span className="chip">{item.phrase.kind === "chunk" ? "词块" : "句型"}</span>
                    {item.due && <span className="chip border-orange-400/30 text-orange-300">待复习</span>}
                    {item.source === "feedback" && <span className="chip border-sky-400/25 text-sky-300">来自战报</span>}
                  </div>
                  {item.phrase.zh && <div className="mt-1 text-sm text-stone-400">{item.phrase.zh}</div>}
                  {item.phrase.example && <div className="mt-1.5 text-xs italic text-stone-600">“{item.phrase.example}”</div>}
                </div>
                <button onClick={() => void speak(item.phrase.text)}
                  className="shrink-0 rounded-lg px-2 py-1 text-stone-500 transition hover:bg-white/10 hover:text-orange-300">▶</button>
              </div>
              {/* Mastery bar */}
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400"
                    style={{ width: `${Math.round(item.mastery * 100)}%` }} />
                </div>
                <span className="text-xs text-stone-600">{Math.round(item.mastery * 100)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
