"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useGameStore } from "@/stores/game"

type ClusterKey = "apartment" | "cafe" | "market" | "busstop" | "park" | "campus" | "airport" | "cinema"

const CLUSTERS: Record<
  ClusterKey,
  { name: string; en: string; icon: string; image: string; desc: string; accent: string }
> = {
  apartment: {
    name: "公寓",
    en: "The Apartment",
    icon: "🏠",
    image: "/scenes/apartment.jpg",
    desc: "刚搬进合租公寓，室友端着刚烤好的饼干来敲门",
    accent: "from-orange-500/80",
  },
  cafe: {
    name: "咖啡馆",
    en: "The Café",
    icon: "☕",
    image: "/scenes/cafe.jpg",
    desc: "楼下新开的咖啡馆，点单、闲聊、偶尔也要投诉",
    accent: "from-amber-500/80",
  },
  market: {
    name: "超市",
    en: "The Market",
    icon: "🛒",
    image: "/scenes/market.jpg",
    desc: "找不到货架上的东西？想砍个价？开口问就对了",
    accent: "from-emerald-500/80",
  },
  busstop: {
    name: "公交站",
    en: "The Bus Stop",
    icon: "🚌",
    image: "/scenes/busstop.jpg",
    desc: "雨后的公交站，问路、买票，和陌生人聊聊天气",
    accent: "from-sky-500/80",
  },
  park: {
    name: "公园",
    en: "The Park",
    icon: "🌳",
    image: "/scenes/park.jpg",
    desc: "绕湖慢跑的老熟人，聊爱好、运动和你最放松的角落",
    accent: "from-green-500/80",
  },
  campus: {
    name: "校园",
    en: "The Campus",
    icon: "🎓",
    image: "/scenes/campus.jpg",
    desc: "带交换生逛校园，work or study 这道送命题就在这里拿下",
    accent: "from-indigo-500/80",
  },
  airport: {
    name: "机场",
    en: "The Airport",
    icon: "✈️",
    image: "/scenes/airport.jpg",
    desc: "值机、候机、聊旅行，Part 2 的难忘旅程就从这里起飞",
    accent: "from-cyan-500/80",
  },
  cinema: {
    name: "电影院",
    en: "The Cinema",
    icon: "🎬",
    image: "/scenes/cinema.jpg",
    desc: "霓虹灯下排队聊电影和音乐，一路聊到 Part 3 思辨",
    accent: "from-rose-500/80",
  },
}

const CLUSTER_ORDER: ClusterKey[] = [
  "apartment", "cafe", "market", "busstop",
  "park", "campus", "airport", "cinema",
]

export default function SpeakingMapPage() {
  const router = useRouter()
  const { user, nodes, unlocks, bestAttempts, edges, loadFromApi, setTargetBand } = useGameStore()
  const [dataReady, setDataReady] = useState(false)
  const [dueCount, setDueCount] = useState(0)
  const [scene, setScene] = useState<ClusterKey | null>(null)
  const [showGoal, setShowGoal] = useState(false)

  useEffect(() => {
    loadFromApi("speaking").then(() => setDataReady(true))
    fetch("/api/phrasebook")
      .then((r) => r.json())
      .then((d) => setDueCount(d.dueCount ?? 0))
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const byCluster = useMemo(() => {
    const map = {} as Record<ClusterKey, (typeof nodes)[string][]>
    for (const k of CLUSTER_ORDER) map[k] = []
    const nodeList = Object.values(nodes)
      .filter((n) => n.cluster in CLUSTERS)
      .sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id))
    for (const n of nodeList) map[n.cluster as ClusterKey].push(n)
    return map
  }, [nodes])

  const prereqTitle = (nodeId: string) => {
    const from = edges.find((e) => e.to === nodeId)?.from
    return from ? nodes[from]?.title : undefined
  }

  /* ─────────── HUD ─────────── */
  const hud = (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
      <div className="pointer-events-auto flex items-center gap-2">
        {scene ? (
          <button onClick={() => setScene(null)} className="chip bg-black/50 backdrop-blur-md transition hover:border-white/30">
            ← 全部场景
          </button>
        ) : (
          <Link href="/" className="chip bg-black/50 backdrop-blur-md transition hover:border-white/30">←</Link>
        )}
        <span className="chip bg-black/50 font-bold text-stone-100 backdrop-blur-md">
          {scene ? `${CLUSTERS[scene].icon} ${CLUSTERS[scene].name}` : "🗣 开口地图"}
        </span>
      </div>
      <div className="pointer-events-auto flex items-center gap-2">
        <span className="chip bg-black/50 backdrop-blur-md">⚡ {user?.exp ?? 0}</span>
        <span className="chip bg-black/50 text-amber-300 backdrop-blur-md">🪙 {user?.gold ?? 0}</span>
        <div className="relative">
          <button onClick={() => setShowGoal((v) => !v)}
            className="chip bg-black/50 text-emerald-300 backdrop-blur-md transition hover:border-emerald-300/50">
            🎯 目标 {(user?.targetBand ?? 6.5).toFixed(1)}
          </button>
          {showGoal && (
            <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded-2xl border border-white/10 bg-[#12151f]/95 p-3 shadow-2xl backdrop-blur-xl">
              <p className="mb-1 text-xs font-semibold text-stone-200">我的目标 Band</p>
              <p className="mb-2 text-[11px] leading-relaxed text-stone-500">评分官会按这个目标给你反馈和提升建议</p>
              <div className="grid grid-cols-4 gap-1.5">
                {[5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5].map((b) => {
                  const active = (user?.targetBand ?? 6.5) === b
                  return (
                    <button key={b}
                      onClick={() => { setTargetBand(b); setShowGoal(false) }}
                      className={`rounded-lg px-2 py-1.5 text-xs font-bold transition ${
                        active
                          ? "bg-emerald-500 text-white"
                          : "bg-white/5 text-stone-300 hover:bg-white/15"
                      }`}>
                      {b.toFixed(1)}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        <Link href="/phrasebook"
          className="relative rounded-xl border border-orange-400/40 bg-black/50 px-4 py-1.5 text-sm text-orange-300 backdrop-blur-md transition hover:bg-orange-400/20">
          📒 句库
          {dueCount > 0 && (
            <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-bold text-white">
              {dueCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  )

  if (!dataReady) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <span className="animate-pulse text-stone-500">🗺 正在进入小镇…</span>
      </main>
    )
  }

  /* ─────────── Scene detail: full-bleed image + quest path ─────────── */
  if (scene) {
    const meta = CLUSTERS[scene]
    const list = byCluster[scene]
    return (
      <main className="relative min-h-screen">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={meta.image} alt={meta.name}
          className="kenburns fixed inset-0 h-full w-full object-cover" />
        <div className="fixed inset-0 bg-gradient-to-b from-black/70 via-black/30 to-[#0b0e16]" />
        <div className="fixed inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />
        {hud}

        <div className="relative z-10 mx-auto max-w-2xl px-4 pb-16 pt-24 sm:px-6">
          <p className="text-sm uppercase tracking-[0.3em] text-stone-400">{meta.en}</p>
          <h1 className="mt-1 text-4xl font-black text-white drop-shadow-lg">{meta.icon} {meta.name}</h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-stone-300 drop-shadow">{meta.desc}</p>

          <div className="mt-10 space-y-4">
            {list.map((n, i) => {
              const unlocked = unlocks.has(n.id)
              const attempt = bestAttempts[n.id]
              const done = !!attempt
              const prereq = !unlocked ? prereqTitle(n.id) : undefined
              return (
                <div key={n.id} className="flex items-stretch gap-4">
                  {/* Path spine */}
                  <div className="flex flex-col items-center">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 text-sm font-black backdrop-blur-md ${
                      done
                        ? "border-amber-400 bg-amber-400/20 text-amber-300"
                        : unlocked
                          ? "border-orange-400 bg-orange-500/30 text-white shadow-[0_0_24px_rgba(249,115,22,0.6)]"
                          : "border-white/15 bg-black/40 text-stone-500"
                    }`}>
                      {done ? "★" : unlocked ? i + 1 : "🔒"}
                    </div>
                    {i < list.length - 1 && <div className="w-0.5 flex-1 bg-gradient-to-b from-white/25 to-white/5" />}
                  </div>

                  {/* Node card */}
                  <button
                    disabled={!unlocked}
                    onClick={() => router.push(`/quest/speaking/${n.id}`)}
                    className={`group mb-1 flex-1 rounded-2xl border p-4 text-left backdrop-blur-md transition ${
                      unlocked
                        ? "border-white/15 bg-black/45 hover:border-orange-400/50 hover:bg-black/60"
                        : "cursor-not-allowed border-white/5 bg-black/30 opacity-60"
                    }`}>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className={`font-bold ${unlocked ? "text-white" : "text-stone-500"}`}>{n.title}</h3>
                      {done ? (
                        <span className="shrink-0 text-sm text-amber-300">
                          {"★".repeat(attempt.stars)}{"☆".repeat(3 - attempt.stars)}
                          {attempt.band != null && <span className="ml-2 text-stone-400">Band {attempt.band}</span>}
                        </span>
                      ) : unlocked ? (
                        <span className="shrink-0 rounded-full bg-orange-500/90 px-3 py-1 text-xs font-bold text-white transition group-hover:bg-orange-400">
                          🎙 开始
                        </span>
                      ) : null}
                    </div>
                    {n.subtitle && <p className="mt-1 text-xs text-stone-400">{n.subtitle}</p>}
                    <p className="mt-2 text-xs text-stone-500">
                      {unlocked
                        ? <>难度 {"●".repeat(n.difficulty)}{"○".repeat(Math.max(0, 5 - n.difficulty))} · ⚡{n.rewardExp} 🪙{n.rewardGold}</>
                        : <>先通关「{prereq ?? "上一关"}」解锁</>}
                    </p>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </main>
    )
  }

  /* ─────────── Scene select: immersive panels ─────────── */
  return (
    <main className="min-h-screen px-4 pb-10 pt-20 sm:px-6">
      {hud}
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 text-center animate-fade-up">
          <h1 className="text-3xl font-black text-white sm:text-4xl">今天去哪儿开口？</h1>
          <p className="mt-2 text-sm text-stone-400">八个真实场景 · 覆盖雅思口语 Part 1 / 2 / 3 高频话题</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {CLUSTER_ORDER.map((key, idx) => {
            const meta = CLUSTERS[key]
            const list = byCluster[key]
            const doneCount = list.filter((n) => bestAttempts[n.id]).length
            const stars = list.reduce((s, n) => s + (bestAttempts[n.id]?.stars ?? 0), 0)
            const anyUnlocked = list.some((n) => unlocks.has(n.id))
            return (
              <button key={key} onClick={() => setScene(key)}
                className="group relative h-[30vh] min-h-[220px] overflow-hidden rounded-3xl border border-white/10 text-left transition hover:border-white/30 animate-fade-up"
                style={{ animationDelay: `${idx * 60}ms` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={meta.image} alt={meta.name}
                  className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                <div className={`absolute inset-0 bg-gradient-to-t ${meta.accent} via-black/20 to-black/10 opacity-0 transition duration-500 group-hover:opacity-30`} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

                <div className="absolute inset-x-0 bottom-0 p-5">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.25em] text-stone-300/80">{meta.en}</p>
                      <h2 className="mt-0.5 text-2xl font-black text-white drop-shadow">{meta.icon} {meta.name}</h2>
                      <p className="mt-1 line-clamp-1 text-xs text-stone-300/90">{meta.desc}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white/15 px-4 py-1.5 text-sm font-bold text-white backdrop-blur-md transition group-hover:bg-orange-500">
                      {anyUnlocked ? "进入 →" : "探索 →"}
                    </span>
                  </div>
                  {/* Progress */}
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                      <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-400 transition-all"
                        style={{ width: `${list.length ? (doneCount / list.length) * 100 : 0}%` }} />
                    </div>
                    <span className="text-xs text-stone-300">{doneCount}/{list.length} 关 · ★{stars}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <p className="mt-6 text-center text-xs text-stone-600">点击场景走进去 · 每个场景 4 关，通关解锁下一关</p>
      </div>
    </main>
  )
}
