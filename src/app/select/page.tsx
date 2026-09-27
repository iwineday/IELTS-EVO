"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

const LOCKED_SKILLS = [
  { label: "写作", subtitle: "Writing", emoji: "✍️", desc: "议论文 · 图表题 · 书信" },
  { label: "阅读", subtitle: "Reading", emoji: "📖", desc: "T/F/NG · Matching · 长文" },
  { label: "听力", subtitle: "Listening", emoji: "🎧", desc: "Section 1-4 · 难度递增" },
] as const

export default function SelectPage() {
  const [playerName, setPlayerName] = useState("旅行者")

  useEffect(() => {
    const saved = localStorage.getItem("ielts_quest_name")
    if (saved) setPlayerName(saved)
  }, [])

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16">
      {/* ─── Greeting ─── */}
      <div className="animate-fade-up mb-10 text-center">
        <h1 className="text-4xl font-black tracking-tight text-stone-50">
          选择你的<span className="bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">修炼</span>
        </h1>
        <p className="mt-3 text-stone-500">
          欢迎，<span className="font-semibold text-orange-300">{playerName}</span>。现在最重要的事只有一件：开口。
        </p>
      </div>

      {/* ─── Speaking — the main event ─── */}
      <Link href="/map/speaking"
        className="animate-fade-up card card-hover group w-full p-8"
        style={{ animationDelay: "0.1s" }}>
        <div className="flex items-center gap-6">
          <div className="text-6xl transition-transform group-hover:scale-110">🗣</div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-stone-100">口语</h2>
              <span className="chip border-orange-400/30 text-orange-300">主线</span>
            </div>
            <p className="mt-1 text-sm text-stone-500">Speaking · 四个生活场景 · 多轮真实对话 + 开口复习</p>
          </div>
          <span className="text-2xl text-stone-600 transition group-hover:translate-x-1 group-hover:text-orange-300">→</span>
        </div>
      </Link>

      {/* ─── Locked skills ─── */}
      <div className="animate-fade-up mt-4 grid w-full grid-cols-3 gap-3" style={{ animationDelay: "0.2s" }}>
        {LOCKED_SKILLS.map((s) => (
          <div key={s.label} className="card p-5 text-center opacity-50">
            <div className="text-3xl grayscale">{s.emoji}</div>
            <div className="mt-2 font-semibold text-stone-300">{s.label}</div>
            <div className="text-xs text-stone-600">{s.subtitle}</div>
            <div className="mt-2 text-xs text-stone-600">{s.desc}</div>
            <span className="chip mt-3">🔒 敬请期待</span>
          </div>
        ))}
      </div>

      <p className="mt-10 text-center text-xs text-stone-700">
        先把口语这条线打穿 —— 其他技能陆续开放
      </p>
    </main>
  )
}
