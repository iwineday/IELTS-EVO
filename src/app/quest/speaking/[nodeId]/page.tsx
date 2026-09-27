"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { useGameStore } from "@/stores/game"
import { useRecorder } from "@/hooks/useRecorder"
import { playBase64Audio, speak } from "@/lib/audio"

/* ─── Types ─── */

interface KeyPhrase {
  text: string
  zh: string
  example: string
  phraseId?: string
}
interface SentenceFrame {
  frame: string
  func: string
  zh: string
  example: string
  phraseId?: string
}
interface ScenarioPayload {
  scenarioContext?: string
  scenarioRole?: string
  openingLine?: string
  part1Questions?: Array<{ question: string; hint: string }>
  keyPhrases?: KeyPhrase[]
  sentenceFrames?: SentenceFrame[]
  targetBand?: number
}
interface ScenarioData {
  id: string
  title: string
  subtitle: string | null
  cluster: string
  difficulty: number
  payload: ScenarioPayload
}

interface Msg {
  role: "npc" | "user"
  text: string
  audioBase64?: string | null
  tip?: string | null
}

interface FinalReport {
  band: number
  criteria: { fluency: number; lexical: number; grammar: number; pronunciation: number }
  summary: string
  suggestions: string[]
  usedPhrases: string[]
  betterExpressions: Array<{ original: string; better: string; note: string }>
  stars: number
  expGain: number
  goldGain: number
  unlockedNodeIds: string[]
}

type Phase = "loading" | "prep" | "talk" | "scoring" | "report"

const CLUSTER_META: Record<string, { emoji: string; label: string; image: string }> = {
  apartment: { emoji: "🏠", label: "公寓", image: "/scenes/apartment.jpg" },
  cafe: { emoji: "☕", label: "咖啡馆", image: "/scenes/cafe.jpg" },
  market: { emoji: "🛒", label: "超市", image: "/scenes/market.jpg" },
  busstop: { emoji: "🚌", label: "公交站", image: "/scenes/busstop.jpg" },
  park: { emoji: "🌳", label: "公园", image: "/scenes/park.jpg" },
  campus: { emoji: "🎓", label: "校园", image: "/scenes/campus.jpg" },
  airport: { emoji: "✈️", label: "机场", image: "/scenes/airport.jpg" },
  cinema: { emoji: "🎬", label: "电影院", image: "/scenes/cinema.jpg" },
}

const CRITERIA_LABEL: Record<string, string> = {
  fluency: "流利度",
  lexical: "词汇",
  grammar: "语法",
  pronunciation: "发音",
}

export default function SpeakingQuestPage() {
  const { nodeId } = useParams<{ nodeId: string }>()
  const router = useRouter()
  const { user, nodes, addAttempt, loadFromApi } = useGameStore()

  const [scenario, setScenario] = useState<ScenarioData | null>(null)
  const [phase, setPhase] = useState<Phase>("loading")
  const [error, setError] = useState<string | null>(null)

  // Conversation state
  const [messages, setMessages] = useState<Msg[]>([])
  const [draft, setDraft] = useState("") // editable ASR transcript before send
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [showCheatsheet, setShowCheatsheet] = useState(false)

  // Report state
  const [report, setReport] = useState<FinalReport | null>(null)
  const [collected, setCollected] = useState<Set<string>>(new Set())
  const rewardedRef = useRef(false)

  const chatEndRef = useRef<HTMLDivElement>(null)

  const recorder = useRecorder((text) => setDraft(text))

  /* ─── Load scenario + game store ─── */
  useEffect(() => {
    if (!user) void loadFromApi("speaking")
  }, [user, loadFromApi])

  useEffect(() => {
    if (!nodeId) return
    fetch(`/api/agents/speaking/init?nodeId=${nodeId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`加载关卡失败 (${r.status})`)
        return r.json()
      })
      .then((data: ScenarioData) => {
        setScenario(data)
        setPhase("prep")
      })
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
  }, [nodeId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, draft, recorder.state])

  const payload = scenario?.payload ?? {}
  const nodeMeta = nodes[nodeId ?? ""]
  const cluster = CLUSTER_META[scenario?.cluster ?? ""] ?? { emoji: "🎯", label: "场景", image: "" }
  const userTurns = messages.filter((m) => m.role === "user").length

  /* ─── Actions ─── */

  const collectPhrase = useCallback(async (p: { phraseId?: string; text: string; zh?: string; example?: string }, kind: "chunk" | "frame") => {
    const key = p.phraseId ?? p.text
    setCollected((prev) => new Set([...prev, key]))
    try {
      await fetch("/api/phrasebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          p.phraseId
            ? { phraseId: p.phraseId, source: "lesson" }
            : { text: p.text, zh: p.zh, example: p.example, nodeId, kind, source: "feedback" },
        ),
      })
    } catch {
      setCollected((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }, [nodeId])

  const startTalk = useCallback(() => {
    const opening = payload.openingLine ?? "Hi there! Ready to chat?"
    setMessages([{ role: "npc", text: opening }])
    setPhase("talk")
    void speak(opening)
  }, [payload.openingLine])

  const sendDraft = useCallback(async () => {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setError(null)
    setDraft("")
    const history = [...messages, { role: "user" as const, text }]
    setMessages(history)
    try {
      const res = await fetch("/api/agents/speaking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId, action: "turn", history: history.map(({ role, text }) => ({ role, text })) }),
      })
      if (!res.ok) throw new Error(`对话服务出错 (${res.status})`)
      const data = await res.json()
      setMessages((prev) => [...prev, { role: "npc", text: data.npcReply, audioBase64: data.npcAudioBase64, tip: data.quickTip }])
      if (data.npcAudioBase64) playBase64Audio(data.npcAudioBase64)
      if (data.done) setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送失败")
      setDraft(text) // give the user their words back
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setSending(false)
    }
  }, [draft, sending, messages, nodeId])

  const finish = useCallback(async () => {
    if (sending) return
    setPhase("scoring")
    setError(null)
    try {
      const res = await fetch("/api/agents/speaking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId, action: "final", history: messages.map(({ role, text }) => ({ role, text })) }),
      })
      if (!res.ok) throw new Error(`结算失败 (${res.status})`)
      const data: FinalReport = await res.json()
      setReport(data)
      setPhase("report")
      // Rewards are persisted server-side; mirror them into the store once.
      if (!rewardedRef.current) {
        rewardedRef.current = true
        addAttempt(nodeId!, data.stars, data.band, data.expGain ?? 0, data.goldGain ?? 0, data.unlockedNodeIds ?? [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "结算失败")
      setPhase("talk")
    }
  }, [sending, messages, nodeId, addAttempt])

  /* ─── Render ─── */

  if (error && phase === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="card max-w-sm p-8 text-center">
          <p className="mb-4 text-rose-400">{error}</p>
          <Link href="/map/speaking" className="btn-ghost inline-block">返回地图</Link>
        </div>
      </main>
    )
  }

  if (!scenario) {
    return (
      <main className="flex min-h-screen items-center justify-center text-stone-500">
        <span className="animate-pulse">正在进入场景…</span>
      </main>
    )
  }

  return (
    <main className="relative mx-auto flex min-h-screen max-w-2xl flex-col px-4 pb-8 pt-4">
      {/* ─── Scene backdrop ─── */}
      {cluster.image && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cluster.image} alt="" aria-hidden
            className={`kenburns fixed inset-0 -z-10 h-full w-full object-cover ${phase === "talk" ? "opacity-45" : "opacity-25"} transition-opacity duration-700`} />
          <div className="fixed inset-0 -z-10 bg-gradient-to-b from-[#0b0e16]/80 via-[#0b0e16]/55 to-[#0b0e16]" />
        </>
      )}
      {/* ─── Top bar ─── */}
      <header className="mb-4 flex items-center justify-between">
        <Link href="/map/speaking" className="chip transition hover:border-white/25">← 地图</Link>
        <div className="flex items-center gap-2 text-sm">
          <span>{cluster.emoji}</span>
          <span className="font-semibold text-stone-100">{scenario.title}</span>
          {user?.targetBand != null && (
            <span className="chip text-emerald-300">🎯 目标 {user.targetBand.toFixed(1)}</span>
          )}
        </div>
        <span className="chip">Lv{scenario.difficulty}</span>
      </header>

      {/* ═══ Phase: 备战 ═══ */}
      {phase === "prep" && (
        <div className="animate-fade-up space-y-4">
          {/* Scenario intro */}
          <section className="card p-6">
            <div className="mb-2 text-xs uppercase tracking-widest text-orange-400/80">场景</div>
            <p className="leading-relaxed text-stone-300">{payload.scenarioContext ?? scenario.subtitle}</p>
            {payload.scenarioRole && (
              <p className="mt-3 text-sm text-stone-500">对话对象：{payload.scenarioRole}</p>
            )}
          </section>

          {/* Key phrases */}
          {(payload.keyPhrases?.length ?? 0) > 0 && (
            <section className="card p-6">
              <div className="mb-1 text-xs uppercase tracking-widest text-orange-400/80">开口词块</div>
              <p className="mb-4 text-xs text-stone-500">先听一遍、跟读一遍，待会对话里用出来有金币加成</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {payload.keyPhrases!.map((p) => {
                  const key = p.phraseId ?? p.text
                  const isCollected = collected.has(key)
                  return (
                    <div key={key} className="card card-hover group p-4">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-stone-100">{p.text}</span>
                        <div className="flex shrink-0 gap-1">
                          <button onClick={() => void speak(p.text)} title="听发音"
                            className="rounded-lg px-2 py-1 text-stone-500 transition hover:bg-white/10 hover:text-orange-300">▶</button>
                          <button onClick={() => void collectPhrase(p, "chunk")} disabled={isCollected} title="收入句库"
                            className="rounded-lg px-2 py-1 text-stone-500 transition hover:bg-white/10 hover:text-orange-300 disabled:text-emerald-400">
                            {isCollected ? "✓" : "＋"}
                          </button>
                        </div>
                      </div>
                      <div className="mt-1 text-sm text-stone-400">{p.zh}</div>
                      {p.example && <div className="mt-2 text-xs italic text-stone-500">“{p.example}”</div>}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Sentence frames */}
          {(payload.sentenceFrames?.length ?? 0) > 0 && (
            <section className="card p-6">
              <div className="mb-4 text-xs uppercase tracking-widest text-orange-400/80">句型骨架</div>
              <div className="space-y-3">
                {payload.sentenceFrames!.map((f) => {
                  const key = f.phraseId ?? f.frame
                  const isCollected = collected.has(key)
                  return (
                    <div key={key} className="flex items-start justify-between gap-3 border-b border-white/5 pb-3 last:border-0 last:pb-0">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-stone-100">{f.frame}</span>
                          {f.func && <span className="chip">{f.func}</span>}
                        </div>
                        <div className="mt-1 text-sm text-stone-500">{f.zh}</div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button onClick={() => void speak(f.example || f.frame)} title="听例句"
                          className="rounded-lg px-2 py-1 text-stone-500 transition hover:bg-white/10 hover:text-orange-300">▶</button>
                        <button onClick={() => void collectPhrase({ phraseId: f.phraseId, text: f.frame, zh: f.zh, example: f.example }, "frame")}
                          disabled={isCollected} title="收入句库"
                          className="rounded-lg px-2 py-1 text-stone-500 transition hover:bg-white/10 hover:text-orange-300 disabled:text-emerald-400">
                          {isCollected ? "✓" : "＋"}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          <button onClick={startTalk} className="btn-primary w-full py-4 text-lg">
            🎙 开始对话
          </button>
        </div>
      )}

      {/* ═══ Phase: 对话 ═══ */}
      {(phase === "talk" || phase === "scoring") && (
        <div className="flex flex-1 flex-col">
          {/* Chat area */}
          <div className="flex-1 space-y-4 overflow-y-auto pb-4">
            {messages.map((m, i) => (
              <div key={i} className={`animate-fade-up flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[85%]">
                  {m.role === "npc" ? (
                    <div className="card rounded-tl-sm px-4 py-3">
                      <p className="leading-relaxed text-stone-200">{m.text}</p>
                      <button
                        onClick={() => (m.audioBase64 ? playBase64Audio(m.audioBase64) : void speak(m.text))}
                        className="mt-1 text-xs text-stone-500 transition hover:text-orange-300">
                        ▶ 重听
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-2xl rounded-tr-sm bg-gradient-to-r from-orange-500/90 to-amber-500/90 px-4 py-3 text-stone-950">
                      <p className="leading-relaxed font-medium">{m.text}</p>
                    </div>
                  )}
                  {m.tip && (
                    <div className="mt-1.5 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-300">
                      💡 {m.tip}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="card rounded-tl-sm px-4 py-3 text-stone-500">
                  <span className="animate-pulse">对方正在输入…</span>
                </div>
              </div>
            )}
            {done && !sending && (
              <div className="animate-fade-up rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-center text-sm text-emerald-300">
                ✨ 对话自然结束了，点下方「结束并结算」看看你的表现
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Cheatsheet drawer */}
          {showCheatsheet && (
            <div className="animate-fade-up card mb-3 max-h-40 overflow-y-auto p-3">
              <div className="flex flex-wrap gap-2">
                {(payload.keyPhrases ?? []).map((p) => (
                  <button key={p.phraseId ?? p.text} onClick={() => void speak(p.text)}
                    className="chip transition hover:border-orange-400/40 hover:text-orange-300" title={p.zh}>
                    {p.text}
                  </button>
                ))}
                {(payload.sentenceFrames ?? []).map((f) => (
                  <button key={f.phraseId ?? f.frame} onClick={() => void speak(f.example || f.frame)}
                    className="chip transition hover:border-orange-400/40 hover:text-orange-300" title={f.zh}>
                    {f.frame}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error + recorder error */}
          {(error || recorder.error) && (
            <div className="mb-3 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-2 text-sm text-rose-300">
              {error ?? recorder.error}
            </div>
          )}

          {/* Draft (editable transcript) */}
          {draft && phase === "talk" && (
            <div className="animate-fade-up card mb-3 p-3">
              <div className="mb-1 text-xs text-stone-500">转写结果 — 可以修改后再发送</div>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-lg bg-transparent text-stone-100 focus:outline-none"
              />
              <div className="mt-2 flex gap-2">
                <button onClick={() => void sendDraft()} disabled={sending || !draft.trim()} className="btn-primary flex-1 py-2 text-sm">
                  发送 ↑
                </button>
                <button onClick={() => setDraft("")} className="btn-ghost py-2 text-sm">丢弃</button>
              </div>
            </div>
          )}

          {/* Control bar */}
          <div className="flex items-center justify-between gap-3">
            <button onClick={() => setShowCheatsheet((v) => !v)}
              className={`btn-ghost px-4 py-3 text-sm ${showCheatsheet ? "border-orange-400/40 text-orange-300" : ""}`}>
              提词板
            </button>

            {/* Mic button */}
            <button
              onClick={() => (recorder.state === "recording" ? recorder.stop() : void recorder.start())}
              disabled={phase === "scoring" || sending || recorder.state === "transcribing"}
              className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl transition active:scale-95 disabled:opacity-40 ${
                recorder.state === "recording"
                  ? "mic-recording bg-rose-500 text-white"
                  : "bg-gradient-to-br from-orange-500 to-amber-500 text-stone-950 shadow-lg shadow-orange-500/30"
              }`}
              title={recorder.state === "recording" ? "停止录音" : "按下说话"}>
              {recorder.state === "transcribing" ? (
                <span className="animate-spin text-xl">◌</span>
              ) : recorder.state === "recording" ? (
                "■"
              ) : (
                "🎙"
              )}
            </button>

            <button
              onClick={() => void finish()}
              disabled={userTurns < 2 || phase === "scoring" || sending}
              className={`btn-ghost px-4 py-3 text-sm ${done ? "border-emerald-400/40 text-emerald-300" : ""}`}
              title={userTurns < 2 ? "至少完成 2 轮对话" : "结束对话并获取评分"}>
              {phase === "scoring" ? "结算中…" : "结束并结算"}
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-stone-600">
            {recorder.state === "recording" ? "正在录音，说完点 ■" : recorder.state === "transcribing" ? "正在转写…" : "点麦克风开始说话 · 已对话 " + userTurns + " 轮"}
          </p>
        </div>
      )}

      {/* ═══ Phase: 战报 ═══ */}
      {phase === "report" && report && (
        <div className="animate-fade-up space-y-4">
          {/* Band hero */}
          <section className="card p-8 text-center">
            <div className="text-xs uppercase tracking-widest text-stone-500">本次预估</div>
            <div className="mt-2 bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-7xl font-black text-transparent">
              {report.band}
            </div>
            <div className="mt-2 text-2xl tracking-widest text-amber-400">
              {"★".repeat(report.stars)}<span className="text-stone-700">{"★".repeat(Math.max(0, 3 - report.stars))}</span>
            </div>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-stone-400">{report.summary}</p>
            {(report.expGain ?? 0) > 0 && (
              <div className="mt-4 flex justify-center gap-3 text-sm">
                <span className="chip text-sky-300">⚡ +{report.expGain} EXP</span>
                <span className="chip text-amber-300">🪙 +{report.goldGain} 金币</span>
              </div>
            )}
            {(report.unlockedNodeIds?.length ?? 0) > 0 && (
              <p className="mt-2 text-xs text-emerald-300">🔓 已解锁下一关</p>
            )}
          </section>

          {/* Criteria bars */}
          <section className="card p-6">
            <div className="mb-4 text-xs uppercase tracking-widest text-orange-400/80">四项能力</div>
            <div className="space-y-3">
              {Object.entries(report.criteria).map(([key, val]) => (
                <div key={key}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-stone-400">{CRITERIA_LABEL[key] ?? key}</span>
                    <span className="font-semibold text-stone-200">{val}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div
                      className={`h-full rounded-full ${val >= 7 ? "bg-emerald-400" : val >= 6 ? "bg-amber-400" : "bg-rose-400"}`}
                      style={{ width: `${Math.min((val / 9) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Used phrases */}
          {report.usedPhrases.length > 0 && (
            <section className="card p-6">
              <div className="mb-3 text-xs uppercase tracking-widest text-emerald-400/80">✓ 你用上的目标表达（每个 +5 金币）</div>
              <div className="flex flex-wrap gap-2">
                {report.usedPhrases.map((p) => (
                  <span key={p} className="chip border-emerald-400/25 text-emerald-300">{p}</span>
                ))}
              </div>
            </section>
          )}

          {/* Better expressions */}
          {report.betterExpressions.length > 0 && (
            <section className="card p-6">
              <div className="mb-1 text-xs uppercase tracking-widest text-orange-400/80">更地道的说法</div>
              <p className="mb-4 text-xs text-stone-500">收进句库，之后会安排开口复习</p>
              <div className="space-y-4">
                {report.betterExpressions.map((b, i) => {
                  const isCollected = collected.has(b.better)
                  return (
                    <div key={i} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      <div className="text-sm text-stone-500 line-through decoration-stone-600">{b.original}</div>
                      <div className="mt-1.5 flex items-start justify-between gap-3">
                        <span className="font-semibold text-stone-100">{b.better}</span>
                        <div className="flex shrink-0 gap-1">
                          <button onClick={() => void speak(b.better)} className="rounded-lg px-2 py-1 text-stone-500 transition hover:bg-white/10 hover:text-orange-300">▶</button>
                          <button
                            onClick={() => void collectPhrase({ text: b.better, zh: b.note }, "frame")}
                            disabled={isCollected}
                            className="rounded-lg px-2 py-1 text-xs text-stone-400 transition hover:bg-white/10 hover:text-orange-300 disabled:text-emerald-400">
                            {isCollected ? "✓ 已收" : "＋ 收入句库"}
                          </button>
                        </div>
                      </div>
                      <div className="mt-1.5 text-xs text-stone-500">{b.note}</div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Suggestions */}
          {report.suggestions.length > 0 && (
            <section className="card p-6">
              <div className="mb-3 text-xs uppercase tracking-widest text-sky-400/80">💡 下次开口建议</div>
              <ul className="space-y-2 text-sm leading-relaxed text-stone-300">
                {report.suggestions.map((s, i) => (
                  <li key={i} className="flex gap-2"><span className="text-sky-400">·</span>{s}</li>
                ))}
              </ul>
            </section>
          )}

          <div className="flex gap-3">
            <button onClick={() => router.push("/map/speaking")} className="btn-primary flex-1 py-4">返回地图</button>
            <button
              onClick={() => {
                setMessages([]); setReport(null); setDone(false); setDraft(""); rewardedRef.current = false
                setPhase("prep")
              }}
              className="btn-ghost py-4">
              再练一次
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
