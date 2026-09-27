import Link from "next/link"
import { listArchive } from "@/lib/dictation/lesson"

export const dynamic = "force-dynamic"

export default function ArchivePage() {
  const lessons = listArchive()
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 pb-20 pt-10">
      <div className="mb-8 flex items-center justify-between">
        <Link href="/daily" className="text-sm text-stone-500 transition hover:text-stone-300">← 今日精听</Link>
        <span className="chip">全部篇目</span>
      </div>
      <h1 className="text-3xl font-black tracking-tight text-stone-50">听写篇目</h1>
      <p className="mt-2 text-sm text-stone-500">每篇存在本地数据库 data/ielts.db。点进去看这篇和听写总结。</p>
      {lessons.length === 0 ? (
        <p className="card mt-8 p-6 text-sm text-stone-400">还没有篇目。</p>
      ) : (
        <ul className="mt-8 space-y-2">
          {lessons.map((item) => (
            <li key={item.id}>
              <Link href={`/archive/${item.id}`} className="card card-hover flex items-center justify-between px-4 py-3">
                <span>
                  <span className="block text-sm text-stone-100">{item.summaryZh}</span>
                  <span className="mt-1 block text-xs text-stone-500">
                    {item.id} · {item.topic === "tech" ? "科技" : "旅行"} · {item.wordCount} 词
                  </span>
                </span>
                <span className="text-xs text-stone-500">{item.hasSummary ? "已有总结" : "还没总结"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
