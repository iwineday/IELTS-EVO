"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { useRecorder } from "@/hooks/useRecorder"
import { wordAccepted } from "@/lib/dictation/diff"

type Stage = "listen" | "write" | "memorize" | "recite" | "done"

interface AlignmentToken {
  text: string
  status: "ok" | "miss" | "extra"
}

interface Lesson {
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
  sentences: Array<string | null>
  stage: Stage
  listens: number
  dictationText: string
  dictationAccuracy: number | null
  reciteText: string
  reciteAccuracy: number | null
  summaryHtml: string
  paragraphs: string[] | null
  translations: string[] | null
}

interface RecentItem {
  id: string
  topic: "tech" | "travel"
  title: string
  summaryZh: string
  stage: Stage
  dictationAccuracy: number | null
  reciteAccuracy: number | null
}

interface CheckResult {
  accuracy: number
  hits: number
  total: number
  alignment: AlignmentToken[]
}

const STEPS: { id: Stage; label: string }[] = [
  { id: "listen", label: "反复听" },
  { id: "write", label: "逐句写" },
  { id: "memorize", label: "对照背" },
  { id: "recite", label: "口述" },
]

function pct(n: number | null) {
  if (n == null) return "—"
  return `${Math.round(n * 100)}%`
}

function draftKey(date: string) {
  return `dictation-draft:${date}`
}

function filledCount(text: string) {
  return text.split("\n").filter((line) => line.trim()).length
}

export default function DailyPage() {
  const searchParams = useSearchParams()
  const dateQuery = searchParams.get("date") ?? undefined
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [recent, setRecent] = useState<RecentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Stage>("listen")
  const [part, setPart] = useState(0)
  const [lines, setLines] = useState<string[]>([])
  const [checking, setChecking] = useState(false)
  const [check, setCheck] = useState<CheckResult | null>(null)
  const [reciteDraft, setReciteDraft] = useState("")
  const [playing, setPlaying] = useState(false)
  const [pausedOn, setPausedOn] = useState<number | null>(null)
  const [synthIndex, setSynthIndex] = useState<number | null>(null)
  const [sentence, setSentence] = useState(0)
  const [summaryHtml, setSummaryHtml] = useState("")
  const [preparingNext, setPreparingNext] = useState(false)
  const [translating, setTranslating] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const loadedIndexRef = useRef<number | null>(null)
  const savedTimeRef = useRef<number[]>([])
  const chainRef = useRef(false)
  const playIdRef = useRef(0)
  const loopRef = useRef(false)
  const rateRef = useRef(1)
  const sentenceRef = useRef(0)
  const partEndRef = useRef(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const recorder = useRecorder((text) => setReciteDraft(text))

  const applyLesson = useCallback((next: Lesson, history?: RecentItem[]) => {
    setLesson(next)
    if (history) setRecent(history)
    const serverText = next.dictationText ?? ""
    const localText = typeof window === "undefined" ? "" : localStorage.getItem(draftKey(next.id)) ?? ""
    const saved = filledCount(localText) > filledCount(serverText) ? localText : serverText
    if (saved === localText && localText !== serverText) {
      void fetch("/api/dictation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: next.id, dictationText: localText, stage: "write" }),
      })
    }
    const raw = saved.split("\n")
    const pieces = raw.length === next.sentenceCount
      ? raw.map((s) => s.trim())
      : (saved.replace(/\n+/g, " ").match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [])
          .map((s) => s.trim())
          .filter(Boolean)
    setLines(Array.from({ length: next.sentenceCount }, (_, i) => pieces[i] ?? ""))
    setReciteDraft(next.reciteText ?? "")
    setSummaryHtml(next.summaryHtml ?? "")
    setSentence(0)
    sentenceRef.current = 0
    setTab(next.stage === "done" ? "recite" : next.stage)
  }, [])

  const load = useCallback(async (date?: string) => {
    setLoading(true)
    setError(null)
    setCheck(null)
    try {
      const q = date ? `?date=${date}` : ""
      const res = await fetch(`/api/dictation${q}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "加载失败")
      applyLesson(data.lesson, data.recent)
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败")
    } finally {
      setLoading(false)
    }
  }, [applyLesson])

  useEffect(() => {
    void load(dateQuery)
  }, [load, dateQuery])

  useEffect(() => {
    if (tab !== "memorize" || !lesson?.paragraphs?.length || lesson.translations?.length) return
    let cancel = false
    setTranslating(true)
    setError(null)
    void fetch("/api/dictation/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: lesson.id }),
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "中文还没准备好")
        if (cancel || !data.lesson) return
        applyLesson(data.lesson)
        setTab("memorize")
      })
      .catch((e) => {
        if (!cancel) setError(e instanceof Error ? e.message : "中文还没准备好")
      })
      .finally(() => {
        if (!cancel) setTranslating(false)
      })
    return () => {
      cancel = true
    }
  }, [tab, lesson?.id, lesson?.paragraphs?.length, lesson?.translations?.length, applyLesson])

  const patch = useCallback(async (body: Record<string, unknown>) => {
    if (!lesson) return
    const res = await fetch("/api/dictation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: lesson.id, ...body }),
    })
    const data = await res.json()
    if (res.ok && data.lesson) {
      setLesson(data.lesson)
    }
  }, [lesson])

  const onLine = (index: number, value: string) => {
    setLines((prev) => {
      const next = prev.length === lesson?.sentenceCount
        ? [...prev]
        : Array.from({ length: lesson?.sentenceCount ?? 0 }, (_, i) => prev[i] ?? "")
      next[index] = value
      setSummaryHtml("")
      const draft = next.join("\n")
      if (lesson) localStorage.setItem(draftKey(lesson.id), draft)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        void patch({ dictationText: draft, stage: "write" })
      }, 700)
      return next
    })
  }

  const rememberTime = () => {
    const audio = audioRef.current
    const index = loadedIndexRef.current
    if (!audio || index == null) return
    savedTimeRef.current[index] = audio.currentTime
  }

  const releaseAudio = () => {
    audioRef.current?.pause()
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    audioRef.current = null
    audioUrlRef.current = null
    loadedIndexRef.current = null
  }

  /** Load one sentence. fromStart ignores a saved pause point. */
  const ensureClip = async (index: number, fromStart: boolean) => {
    if (!lesson) return null
    const existing = audioRef.current
    if (existing && loadedIndexRef.current === index) {
      existing.currentTime = fromStart ? 0 : (savedTimeRef.current[index] ?? existing.currentTime)
      existing.playbackRate = rateRef.current
      return existing
    }
    rememberTime()
    releaseAudio()
    setSynthIndex(index)
    const playId = playIdRef.current
    const res = await fetch(`/api/dictation/audio?date=${lesson.id}&s=${index}`)
    if (!res.ok || playId !== playIdRef.current) return null
    const url = URL.createObjectURL(await res.blob())
    if (playId !== playIdRef.current) {
      URL.revokeObjectURL(url)
      return null
    }
    const audio = new Audio(url)
    audio.preload = "auto"
    audio.playbackRate = rateRef.current
    await new Promise<void>((resolve) => {
      if (audio.readyState >= 1) resolve()
      else audio.onloadedmetadata = () => resolve()
    })
    audio.currentTime = fromStart ? 0 : (savedTimeRef.current[index] ?? 0)
    audioRef.current = audio
    audioUrlRef.current = url
    loadedIndexRef.current = index
    setSynthIndex(null)
    return audio
  }

  const playClip = async (index: number, fromStart: boolean, chain: boolean) => {
    if (!lesson) return
    const playId = ++playIdRef.current
    chainRef.current = chain
    setSentence(index)
    sentenceRef.current = index
    setPlaying(true)
    setPausedOn(null)
    const audio = await ensureClip(index, fromStart)
    if (!audio || playId !== playIdRef.current) {
      if (playId === playIdRef.current) setPlaying(false)
      return
    }
    audio.onended = () => {
      if (playId !== playIdRef.current) return
      savedTimeRef.current[index] = 0
      const count = lesson.sentenceCount
      if (chainRef.current && index + 1 < count) {
        void playClip(index + 1, true, true)
        return
      }
      chainRef.current = false
      setPlaying(false)
      setPausedOn(null)
    }
    try {
      await audio.play()
    } catch {
      if (playId === playIdRef.current) setPlaying(false)
    }
  }

  const onNumber = (index: number) => {
    const audio = audioRef.current
    const same = loadedIndexRef.current === index && audio
    if (same && playing) {
      rememberTime()
      audio.pause()
      chainRef.current = true
      setPlaying(false)
      setPausedOn(index)
      return
    }
    if (same && audio.paused && audio.currentTime > 0 && audio.currentTime < (audio.duration || 0) - 0.05) {
      chainRef.current = true
      setPlaying(true)
      setPausedOn(null)
      void audio.play()
      return
    }
    void playClip(index, false, false)
  }

  const stopPlayback = () => {
    playIdRef.current += 1
    audioRef.current?.pause()
    chainRef.current = false
    setPlaying(false)
  }

  const togglePassage = () => {
    if (!lesson) return
    const audio = audioRef.current
    const index = sentenceRef.current
    if (playing && audio) {
      rememberTime()
      audio.pause()
      setPlaying(false)
      setPausedOn(index)
      return
    }
    if (
      pausedOn != null &&
      audio &&
      loadedIndexRef.current === pausedOn &&
      audio.currentTime > 0 &&
      audio.currentTime < (audio.duration || 0) - 0.05
    ) {
      chainRef.current = true
      setPlaying(true)
      setPausedOn(null)
      void audio.play()
      return
    }
    void playClip(0, true, true)
  }

  const summarize = async () => {
    if (!lesson || lines.join("").trim().length === 0) return
    setChecking(true)
    setError(null)
    try {
      const res = await fetch("/api/dictation/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: lesson.id, draft: lines.join("\n") }),
        signal: AbortSignal.timeout(45000),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "总结失败")
      if (data.lesson) {
        const serverFilled = filledCount(data.lesson.dictationText ?? "")
        const localFilled = filledCount(lines.join("\n"))
        if (localFilled > serverFilled) data.lesson.dictationText = lines.join("\n")
        applyLesson(data.lesson)
        setTab("write")
      }
      setSummaryHtml(typeof data.html === "string" ? data.html : "")
    } catch (e) {
      const timedOut = e instanceof DOMException && e.name === "TimeoutError"
      setError(timedOut ? "总结超时了，再点一次。" : e instanceof Error ? e.message : "总结失败")
    } finally {
      setChecking(false)
    }
  }

  const submitCheck = async (phase: "dictation" | "recite", text: string) => {
    if (!lesson || !text.trim()) return
    setChecking(true)
    setError(null)
    try {
      const res = await fetch("/api/dictation/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        date: lesson.id,
        phase,
        text,
        part,
        draft: lines.join("\n"),
      }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "检测失败")
      setCheck({ accuracy: data.accuracy, hits: data.hits, total: data.total, alignment: data.alignment })
      if (data.lesson) applyLesson(data.lesson)
      setTab("write")
    } catch (e) {
      setError(e instanceof Error ? e.message : "检测失败")
    } finally {
      setChecking(false)
    }
  }

  const goNext = async () => {
    if (!lesson || preparingNext) return
    const draft = lines.join("\n")
    if (draft.trim()) {
      localStorage.setItem(draftKey(lesson.id), draft)
      await fetch("/api/dictation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: lesson.id, dictationText: draft, stage: lesson.stage }),
      })
    }
    setPreparingNext(true)
    setError(null)
    try {
      const res = await fetch("/api/dictation/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: lesson.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "下一篇失败")
      applyLesson(data.lesson, data.recent)
    } catch (e) {
      setError(e instanceof Error ? e.message : "下一篇失败")
    } finally {
      setPreparingNext(false)
    }
  }

  const partFrom = lesson ? part * lesson.partSize : 0
  const partTo = lesson ? Math.min(lesson.sentenceCount, partFrom + lesson.partSize) : 0
  partEndRef.current = partTo
  const partRevealed = Boolean(
    lesson?.summaryHtml?.trim() || lesson?.checkedParts.includes(part) || lesson?.dictationAccuracy != null,
  )

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 pb-20 pt-10">
      <div className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-sm text-stone-500 transition hover:text-stone-300">← 开口说</Link>
        <Link href="/archive" className="text-sm text-stone-500 transition hover:text-stone-300">全部篇目</Link>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void goNext()} disabled={!lesson || preparingNext} className="btn-ghost px-3 py-1.5 text-sm disabled:opacity-40">
            {preparingNext ? "正在准备…" : lesson?.id.endsWith("-2") ? "上一篇" : "下一篇"}
          </button>
          <span className="chip">每日精听</span>
        </div>
      </div>

      {loading && !lesson && (
        <div className="card p-8 text-center text-stone-400">正在准备今天的五分钟材料…</div>
      )}
      {error && <p className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p>}

      {lesson && (
        <>
          <header className="animate-fade-up">
            <p className="text-xs uppercase tracking-widest text-stone-500">
              {lesson.id} · {lesson.topic === "tech" ? "科技" : "旅行"} · 约 {Math.max(4, Math.round(lesson.wordCount / 140))} 分钟 · {lesson.wordCount} 词
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-stone-50">{lesson.summaryZh}</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-stone-500">
              {tab === "listen"
                ? "整篇连着放，听的时候不看原文。"
                : tab === "write"
                  ? `今天 ${lesson.sentenceCount} 句，一句一行。点编号只放这一句。`
                  : `今天 ${lesson.sentenceCount} 句。`}
            </p>
          </header>

          <div className="mt-6 grid grid-cols-4 gap-2">
            {STEPS.map((step, idx) => {
              const locked = (step.id === "memorize" || step.id === "recite") && !partRevealed
              const active = tab === step.id || (tab === "done" && step.id === "recite")
              return (
                <button
                  key={step.id}
                  disabled={locked}
                  onClick={() => {
                    if (step.id !== "listen") stopPlayback()
                    setCheck(null)
                    setTab(step.id)
                  }}
                  className={`rounded-xl border px-2 py-2 text-sm transition ${
                    active
                      ? "border-orange-400/50 bg-orange-400/10 text-orange-200"
                      : "border-white/10 text-stone-400 hover:border-white/20"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <span className="mr-1 text-xs text-stone-500">{idx + 1}</span>
                  {step.label}
                </button>
              )
            })}
          </div>

          {tab === "listen" && (
            <section className="mt-6">
              <p className="text-sm leading-relaxed text-stone-400">
                从第一句放到最后一句，中间不停。听熟了再去逐句写。
              </p>
              <div className="mt-4 flex items-center gap-3">
                <button onClick={togglePassage} className="btn-primary">
                  {synthIndex != null ? "准备这一句…" : playing ? "暂停" : pausedOn != null ? "继续" : "播放整篇"}
                </button>
                <button
                  onClick={() => {
                    savedTimeRef.current = []
                    setPausedOn(null)
                    void playClip(0, true, true)
                  }}
                  className="btn-ghost"
                >
                  从头再听
                </button>
                <span className="text-sm text-stone-500">
                  {playing || pausedOn != null ? `第 ${sentence + 1} / ${lesson.sentenceCount} 句` : `${lesson.sentenceCount} 句`}
                </span>
              </div>
            </section>
          )}

          {tab === "write" && (
            <section className="mt-4 space-y-3">
              <p className="text-sm leading-relaxed text-stone-400">
                点左边的数字只播放这一句，可以暂停再继续。原文在上，你写的在下。
              </p>
              {Array.from({ length: lesson.sentenceCount }, (_, index) => {
                const pausing = playing && sentence === index
                const original = lesson.sentences[index]
                return (
                  <div key={index} className="flex items-start gap-2">
                    <button
                      onClick={() => onNumber(index)}
                      className={`mt-1 h-8 w-10 shrink-0 rounded-md text-xs ${
                        sentence === index ? "bg-orange-400 text-stone-950" : "bg-white/10 text-stone-300 hover:bg-white/20"
                      }`}
                      aria-label={pausing ? `暂停第 ${index + 1} 句` : `播放第 ${index + 1} 句`}
                    >
                      {synthIndex === index ? "…" : pausing ? "暂停" : pausedOn === index ? "继续" : index + 1}
                    </button>
                    <div className="min-w-0 flex-1">
                      {original && (
                        <>
                          {mineBlank(lines[index]) && <p className="mb-1 text-sm text-rose-200">这句没写</p>}
                          <OriginalLine text={original} mine={lines[index] ?? ""} />
                        </>
                      )}
                      <textarea
                        value={lines[index] ?? ""}
                        onChange={(e) => onLine(index, e.target.value)}
                        rows={2}
                        placeholder="只写这一句"
                        className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm leading-relaxed text-stone-100 placeholder:text-stone-600 focus:border-orange-400/50 focus:outline-none"
                      />
                    </div>
                  </div>
                )
              })}
              <button
                disabled={checking || lines.join("").trim().length === 0}
                onClick={() => void summarize()}
                className="btn-primary"
              >
                {checking ? "总结中…" : "听写总结"}
              </button>
              {summaryHtml && (
                <>
                  <article
                    className="summary-html card p-5"
                    dangerouslySetInnerHTML={{ __html: summaryHtml }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setTab("memorize")
                      void patch({ stage: "memorize" })
                    }}
                    className="btn-primary"
                  >
                    去对照背
                  </button>
                </>
              )}
            </section>
          )}

          {tab === "memorize" && partRevealed && (
            <section className="mt-4 space-y-3">
              <p className="text-sm text-stone-400">按段来背。上面是英文，下面是中文。点这一段可以盖住英文。</p>
              {translating && !lesson.translations?.length && (
                <p className="text-sm text-stone-500">正在准备每段的中文…</p>
              )}
              {(lesson.paragraphs ?? []).map((paragraph, index) => (
                <ParagraphBlock
                  key={index}
                  index={index}
                  english={paragraph}
                  chinese={lesson.translations?.[index] ?? ""}
                />
              ))}
              <button onClick={() => setTab("recite")} className="btn-primary">
                我背好了，开始口述
              </button>
            </section>
          )}

          {(tab === "recite" || tab === "done") && (
            <section className="mt-4">
              <p className="text-sm leading-relaxed text-stone-400">
                不看原文，把这一部分说出来。
              </p>
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={() => (recorder.state === "recording" ? recorder.stop() : void recorder.start())}
                  className={`btn-primary ${recorder.state === "recording" ? "mic-recording" : ""}`}
                >
                  {recorder.state === "recording" ? "说完了" : recorder.state === "transcribing" ? "转写中…" : "按住开始说"}
                </button>
                <span className="text-sm text-stone-500">口述 {pct(lesson.reciteAccuracy)}</span>
              </div>
              {recorder.error && <p className="mt-2 text-sm text-rose-300">{recorder.error}</p>}
              <textarea
                value={reciteDraft}
                onChange={(e) => setReciteDraft(e.target.value)}
                placeholder="口述转写会出现在这里，也可以自己改一改再检测。"
                rows={8}
                className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 leading-relaxed text-stone-100 placeholder:text-stone-600 focus:border-orange-400/50 focus:outline-none"
              />
              <button
                disabled={checking || !reciteDraft.trim()}
                onClick={() => void submitCheck("recite", reciteDraft)}
                className="btn-ghost mt-3"
              >
                {checking ? "检测中…" : "检测口述"}
              </button>
            </section>
          )}

          {recent.length > 1 && (
            <section className="mt-10">
              <h2 className="mb-3 text-xs uppercase tracking-widest text-stone-500">最近</h2>
              <ul className="space-y-2">
                {recent.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => void load(item.id)}
                      className="card card-hover flex w-full items-center justify-between px-4 py-3 text-left"
                    >
                      <span>
                        <span className="text-sm text-stone-200">{item.summaryZh}</span>
                        <span className="ml-2 text-xs text-stone-500">{item.id}</span>
                      </span>
                      <span className="text-xs text-stone-500">
                        写 {pct(item.dictationAccuracy)} · 说 {pct(item.reciteAccuracy)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  )
}

function mineBlank(value: string | undefined) {
  return !value?.trim()
}

function OriginalLine({ text, mine }: { text: string; mine: string }) {
  const parts = text.split(/(\s+)/)
  return (
    <p className="mb-1 text-sm leading-relaxed">
      {parts.map((part, i) => {
        const word = part.replace(/^[^A-Za-z0-9'-]+|[^A-Za-z0-9'-]+$/g, "")
        const miss = word.length > 0 && !wordAccepted(word, mine)
        return (
          <span key={i} className={miss ? "rounded bg-rose-400/15 text-rose-200" : "text-stone-200"}>
            {part}
          </span>
        )
      })}
    </p>
  )
}

function ParagraphBlock({ index, english, chinese }: { index: number; english: string; chinese: string }) {
  const [open, setOpen] = useState(true)
  return (
    <button
      onClick={() => setOpen((v) => !v)}
      className="card w-full px-4 py-3 text-left"
    >
      <span className="text-xs text-stone-500">第 {index + 1} 段 · {open ? "点击盖住英文" : "点击打开"}</span>
      <p className={`mt-2 leading-relaxed text-stone-200 ${open ? "" : "select-none blur-sm"}`}>{english}</p>
      {chinese && <p className="mt-2 leading-relaxed text-stone-400">{chinese}</p>}
    </button>
  )
}

function Alignment({ alignment, accuracy, hits, total }: CheckResult) {
  return (
    <section className="card mt-4 p-5">
      <p className="mb-3 text-sm text-stone-300">
        对上 <span className="font-bold text-orange-300">{hits}</span> / {total} 词 · {pct(accuracy)}
      </p>
      <p className="flex flex-wrap gap-x-1.5 gap-y-1 text-sm leading-relaxed">
        {alignment.map((token, i) => (
          <span
            key={`${token.text}-${i}`}
            className={
              token.status === "ok"
                ? "text-stone-200"
                : token.status === "miss"
                  ? "rounded bg-rose-400/15 px-1 text-rose-300 line-through"
                  : "rounded bg-amber-400/15 px-1 text-amber-200"
            }
          >
            {token.text}
          </span>
        ))}
      </p>
      <p className="mt-3 text-xs text-stone-500">划掉的是原文里没写到的词，黄底是多写出来的词。</p>
    </section>
  )
}
