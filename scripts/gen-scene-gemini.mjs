/**
 * Scene image generation via Google Gemini.
 *
 * Usage:
 *   node scripts/gen-scene-gemini.mjs "<scene name>" "<scene description>" [--pro]
 *   e.g. node scripts/gen-scene-gemini.mjs park "a quiet city park at golden hour, people jogging far away"
 *
 * Reads GEMINI_API_KEY / GEMINI_IMAGE_MODEL(_PRO) / HTTPS_PROXY from .env.local.
 * Output: public/scenes/<scene name>.jpg (1440-wide, 16:9), matching the
 * existing wanx scene set style (Shinkai-esque warm amber + deep teal dusk).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { setGlobalDispatcher, ProxyAgent } from "undici"

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
const pick = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim()

// generativelanguage.googleapis.com is unreachable directly from this network.
const proxy = pick("HTTPS_PROXY") ?? process.env.HTTPS_PROXY
if (proxy) setGlobalDispatcher(new ProxyAgent(proxy))

const KEY = pick("GEMINI_API_KEY")
if (!KEY) {
  console.error("GEMINI_API_KEY missing — add it to .env.local")
  process.exit(1)
}

const usePro = process.argv.includes("--pro")
const MODEL = usePro
  ? (pick("GEMINI_IMAGE_MODEL_PRO") ?? "gemini-3-pro-image-preview")
  : (pick("GEMINI_IMAGE_MODEL") ?? "gemini-2.5-flash-image")

const [name, desc] = process.argv.filter((a) => !a.startsWith("--")).slice(2)
if (!name || !desc) {
  console.error('Usage: node scripts/gen-scene-gemini.mjs "<name>" "<description>" [--pro]')
  process.exit(1)
}

// Keep the style identical to the existing public/scenes/*.jpg set.
const STYLE =
  "cinematic anime film illustration style, Makoto Shinkai inspired, " +
  "warm amber and deep teal color palette, soft volumetric light, highly detailed, " +
  "immersive wide establishing shot, dusk mood, no people, no text, no watermark, " +
  "16:9 landscape composition"

const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
  {
    method: "POST",
    headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Generate an image: ${desc}. ${STYLE}` }] }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: "16:9" },
      },
    }),
  },
)
if (!res.ok) {
  console.error(`Gemini ${res.status}:`, (await res.text()).slice(0, 400))
  process.exit(1)
}

const data = await res.json()
const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
if (!part) {
  console.error("No image in response:", JSON.stringify(data).slice(0, 400))
  process.exit(1)
}

mkdirSync(new URL("../public/scenes", import.meta.url), { recursive: true })
const out = new URL(`../public/scenes/${name}.jpg`, import.meta.url)
writeFileSync(out, Buffer.from(part.inlineData.data, "base64"))
console.log(`✔ ${MODEL} → public/scenes/${name}.jpg (${(part.inlineData.data.length * 0.75 / 1024).toFixed(0)}KB)`)
