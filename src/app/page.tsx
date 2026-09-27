"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

const SCENES = [
  { emoji: "🏠", title: "公寓", desc: "自我介绍 · 家乡 · 日常", image: "/scenes/apartment.jpg" },
  { emoji: "☕", title: "咖啡馆", desc: "点单 · 闲聊 · 投诉", image: "/scenes/cafe.jpg" },
  { emoji: "🛒", title: "超市", desc: "找商品 · 砍价 · 结账", image: "/scenes/market.jpg" },
  { emoji: "🚌", title: "公交站", desc: "问路 · 买票 · 聊天气", image: "/scenes/busstop.jpg" },
  { emoji: "🌳", title: "公园", desc: "爱好 · 运动 · 放松地", image: "/scenes/park.jpg" },
  { emoji: "🎓", title: "校园", desc: "学习工作 · 学英语 · 恩师", image: "/scenes/campus.jpg" },
  { emoji: "✈️", title: "机场", desc: "旅行 · 值机 · 难忘旅程", image: "/scenes/airport.jpg" },
  { emoji: "🎬", title: "电影院", desc: "电影 · 音乐 · 屏幕时代", image: "/scenes/cinema.jpg" },
]

const LOOP = [
  { step: "01", title: "备战", desc: "先听会说的词块和句型骨架，跟读收藏" },
  { step: "02", title: "开口对话", desc: "和 AI 角色真实多轮对话，全程用嘴不用手" },
  { step: "03", title: "战报复盘", desc: "IELTS 四维评分 + 更地道的说法收进句库" },
  { step: "04", title: "开口复习", desc: "按记忆曲线安排，看中文提示大声说出来" },
]

export default function Home() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [hasName, setHasName] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem("ielts_quest_name")
    if (saved) {
      setName(saved)
      setHasName(true)
    }
  }, [])

  const start = () => {
    if (name.trim()) localStorage.setItem("ielts_quest_name", name.trim())
    router.push("/map/speaking")
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center px-6 pb-16 pt-20">
      {/* ─── Hero ─── */}
      <div className="animate-fade-up text-center">
        <span className="chip mb-6">IELTS Speaking Quest</span>
        <h1 className="text-5xl font-black leading-tight tracking-tight text-stone-50 sm:text-6xl">
          别背单词了，
          <br />
          <span className="bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">开口说</span>
          出来
        </h1>
        <p className="mx-auto mt-5 max-w-md leading-relaxed text-stone-400">
          在公寓、咖啡馆、机场、电影院等八个真实场景里，和 AI 角色一句一句对话。
          学的每个词块、每个句型，都是为了下一秒能说出口。
        </p>
      </div>

      {/* ─── Start card ─── */}
      <div className="animate-fade-up card mt-10 w-full max-w-sm p-6" style={{ animationDelay: "0.1s" }}>
        {hasName ? (
          <>
            <p className="mb-4 text-center text-stone-300">
              欢迎回来，<span className="font-bold text-orange-300">{name}</span>
            </p>
            <button onClick={start} className="btn-primary w-full py-4 text-lg">🎙 继续闯关</button>
            <Link href="/daily" className="btn-ghost mt-2 block w-full py-3 text-center">🎧 今日精听</Link>
            <button
              onClick={() => { setHasName(false); setName("") }}
              className="mt-2 w-full text-center text-xs text-stone-600 transition hover:text-stone-400">
              换个名字
            </button>
          </>
        ) : (
          <>
            <label className="mb-2 block text-xs uppercase tracking-widest text-stone-500">怎么称呼你</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && start()}
              placeholder="你的名字…"
              autoFocus
              className="mb-3 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-stone-100 placeholder:text-stone-600 transition focus:border-orange-400/50 focus:outline-none"
            />
            <button onClick={start} disabled={!name.trim()} className="btn-primary w-full py-4 text-lg">
              🎙 开始开口
            </button>
            <Link href="/daily" className="btn-ghost mt-2 block w-full py-3 text-center">🎧 今日精听</Link>
          </>
        )}
      </div>

      {/* ─── Scenes ─── */}
      <div className="animate-fade-up mt-14 grid w-full grid-cols-2 gap-3 sm:grid-cols-4" style={{ animationDelay: "0.2s" }}>
        {SCENES.map((s) => (
          <div key={s.title} className="group relative h-40 overflow-hidden rounded-2xl border border-white/10 transition hover:border-white/25 sm:h-44">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.image} alt={s.title}
              className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-3 text-center">
              <div className="font-semibold text-white drop-shadow">{s.emoji} {s.title}</div>
              <div className="mt-0.5 text-xs text-stone-300/90">{s.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Loop ─── */}
      <div className="animate-fade-up mt-14 w-full" style={{ animationDelay: "0.3s" }}>
        <h2 className="mb-5 text-center text-sm uppercase tracking-widest text-stone-500">每一关的开口循环</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {LOOP.map((l) => (
            <div key={l.step} className="card flex items-start gap-4 p-5">
              <span className="bg-gradient-to-b from-orange-400 to-amber-300 bg-clip-text text-2xl font-black text-transparent">{l.step}</span>
              <div>
                <div className="font-semibold text-stone-200">{l.title}</div>
                <div className="mt-1 text-sm leading-relaxed text-stone-500">{l.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-14 text-xs text-stone-700">每日精听已开放 · 阅读 · 写作，敬请期待</p>
    </main>
  )
}
