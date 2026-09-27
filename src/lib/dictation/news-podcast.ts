import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { ProxyAgent, fetch as undiciFetch } from "undici"

const LIVE_DATA = "https://dailyai.iwineday.top/data"

export interface NewsPodcast {
  title: string
  summary: string
  url: string
  source: string
  guest: string
  transcriptUrl: string
  newsDate: string
}

interface NewsFile {
  date?: string
  sections?: Array<{
    id?: string
    items?: Array<{
      title?: string
      summary?: string
      url?: string
      source?: string
      guest?: string
      transcriptUrl?: string
    }>
  }>
}

function localDataDir(): string | null {
  const fromEnv = process.env.NEWS_DATA_DIR
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  const sibling = join(process.cwd(), "..", "news", "public", "data")
  if (existsSync(sibling)) return sibling
  return null
}

async function readJson(dateOrName: string): Promise<unknown | null> {
  const file = dateOrName.endsWith(".json") ? dateOrName : `${dateOrName}.json`
  const dir = localDataDir()
  if (dir) {
    const path = join(dir, file)
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8")) as unknown
  }
  try {
    const res = await fetch(`${LIVE_DATA}/${file}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

function podcastsOf(raw: unknown, fallbackDate: string): NewsPodcast[] {
  const file = raw as NewsFile
  const date = file?.date || fallbackDate
  const section = file?.sections?.find((s) => s.id === "podcasts")
  const items = section?.items ?? []
  return items
    .filter((item) => item.title && item.url)
    .map((item) => ({
      title: item.title!.trim(),
      summary: (item.summary ?? "").trim(),
      url: item.url!.trim(),
      source: (item.source ?? "Podcast").trim(),
      guest: (item.guest ?? "").trim(),
      transcriptUrl: (item.transcriptUrl || item.url)!.trim(),
      newsDate: date,
    }))
}

/** That day's news podcasts, or the latest day that has any. */
export async function podcastsFor(dateKey: string): Promise<NewsPodcast[]> {
  const today = podcastsOf(await readJson(dateKey), dateKey)
  if (today.length) return today

  const latest = (await readJson("latest")) as { currentDate?: string } | null
  const datesFile = (await readJson("dates")) as { dates?: string[] } | null
  const dates = [...(datesFile?.dates ?? [])]
  if (latest?.currentDate && !dates.includes(latest.currentDate)) dates.push(latest.currentDate)
  const older = dates.filter((d) => d < dateKey).sort().reverse()
  for (const date of older) {
    const found = podcastsOf(await readJson(date), date)
    if (found.length) return found
  }
  return []
}

export function pickPodcast(dateKey: string, podcasts: NewsPodcast[], offset = 0): NewsPodcast {
  const day = dateKey.slice(0, 10)
  const [y, m, d] = day.split("-").map(Number)
  const n = Math.floor(Date.UTC(y, m - 1, d) / 86400000)
  return podcasts[Math.abs(n + offset) % podcasts.length]
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

function systemProxy(): string | null {
  const fromEnv = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  if (fromEnv) return fromEnv
  if (process.platform !== "win32") return null
  try {
    const script = [
      "$s = Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'",
      "if ($s.ProxyEnable -eq 1 -and $s.ProxyServer) { $s.ProxyServer }",
    ].join("; ")
    const server = execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8", timeout: 8000 }).trim()
    if (!server) return null
    return server.startsWith("http") ? server : `http://${server}`
  } catch {
    return null
  }
}

/** One stretch of the episode, not the whole hour. Uses the system proxy when the browser has one and direct access does not. */
export async function podcastExcerpt(podcast: NewsPodcast): Promise<string> {
  try {
    const proxy = systemProxy()
    const res = await undiciFetch(podcast.transcriptUrl, {
      headers: { "User-Agent": "ielts-dictation" },
      signal: AbortSignal.timeout(20000),
      ...(proxy ? { dispatcher: new ProxyAgent(proxy) } : {}),
    })
    if (!res.ok) return ""
    const text = htmlToText(await res.text())
    const marker = text.search(/\btranscript\b/i)
    const body = marker >= 0 ? text.slice(marker, marker + 12000) : text.slice(0, 12000)
    return body.slice(0, 7000)
  } catch {
    return ""
  }
}
