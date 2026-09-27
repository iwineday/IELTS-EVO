/**
 * Client-side audio helpers for the speaking loop.
 *
 * MediaRecorder produces webm/opus, which the ASR endpoint may not accept —
 * so we decode + resample to 16 kHz mono WAV (PCM16) in the browser and ship
 * base64 to /api/agents/speaking/transcribe.
 */

/** Decode any recorded blob and re-encode as 16 kHz mono WAV, base64-encoded. */
export async function blobToWav16kBase64(blob: Blob): Promise<string> {
  const arrayBuf = await blob.arrayBuffer()

  // Decode at the context's native rate first
  const decodeCtx = new AudioContext()
  const decoded = await decodeCtx.decodeAudioData(arrayBuf)
  await decodeCtx.close()

  // Resample to 16k mono
  const targetRate = 16000
  const length = Math.ceil(decoded.duration * targetRate)
  const offline = new OfflineAudioContext(1, length, targetRate)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()
  const rendered = await offline.startRendering()

  return arrayBufferToBase64(encodeWavPcm16(rendered.getChannelData(0), targetRate))
}

/** Encode Float32 samples as a PCM16 WAV file. */
function encodeWavPcm16(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buf)
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }

  writeStr(0, "RIFF")
  view.setUint32(4, 36 + samples.length * 2, true)
  writeStr(8, "WAVE")
  writeStr(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, "data")
  view.setUint32(40, samples.length * 2, true)

  let off = 44
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buf
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Play a base64 wav/mp3 through a shared Audio element. Returns the element. */
export function playBase64Audio(base64: string, mime = "audio/wav"): HTMLAudioElement {
  const audio = new Audio(`data:${mime};base64,${base64}`)
  void audio.play()
  return audio
}

/** POST text to /api/tts and play the result. Silently no-ops on failure. */
export async function speak(text: string): Promise<void> {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) return
    const { audioBase64 } = await res.json()
    if (audioBase64) playBase64Audio(audioBase64)
  } catch { /* ignore */ }
}
