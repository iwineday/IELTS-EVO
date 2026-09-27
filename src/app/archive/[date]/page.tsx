import Link from "next/link"
import { notFound } from "next/navigation"
import { getLesson, isLessonId, lessonSentences } from "@/lib/dictation/lesson"

export const dynamic = "force-dynamic"

export default async function ArchivePiecePage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  if (!isLessonId(date)) notFound()
  const lesson = getLesson(date)
  const sentences = lessonSentences(date)
  if (!lesson || !sentences) notFound()

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 pb-20 pt-10">
      <div className="mb-8 flex items-center justify-between">
        <Link href="/archive" className="text-sm text-stone-500 transition hover:text-stone-300">← 全部篇目</Link>
        <Link href={`/daily?date=${lesson.id}`} className="text-sm text-stone-500 transition hover:text-stone-300">继续听写</Link>
      </div>
      <p className="text-xs uppercase tracking-widest text-stone-500">
        {lesson.id} · {lesson.topic === "tech" ? "科技" : "旅行"} · {lesson.wordCount} 词
      </p>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-stone-50">{lesson.title}</h1>
      <p className="mt-2 text-sm text-stone-400">{lesson.summaryZh}</p>

      {lesson.summaryHtml ? (
        <article className="summary-html card mt-8 p-5" dangerouslySetInnerHTML={{ __html: lesson.summaryHtml }} />
      ) : (
        <p className="card mt-8 p-5 text-sm text-stone-400">这篇还没有听写总结。回到听写页点「听写总结」之后，会保存在这里。</p>
      )}

      <section className="mt-8 space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-stone-500">原文</h2>
        {sentences.map((sentence, index) => (
          <p key={index} className="text-sm leading-relaxed text-stone-300">
            <span className="mr-2 text-stone-600">{index + 1}</span>
            {sentence}
          </p>
        ))}
      </section>
    </main>
  )
}
