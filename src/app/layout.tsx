import "./globals.css"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "开口说 · IELTS Speaking Quest",
  description: "游戏化雅思口语训练 — 场景对话、口语词块、开口复习",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      {/* suppressHydrationWarning: 浏览器翻译类插件会往 body 上注入属性，屏蔽误报 */}
      <body className="min-h-screen antialiased" suppressHydrationWarning>{children}</body>
    </html>
  )
}
