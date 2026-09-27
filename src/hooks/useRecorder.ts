"use client"

import { useCallback, useRef, useState } from "react"
import { blobToWav16kBase64 } from "@/lib/audio"

export type RecorderState = "idle" | "recording" | "transcribing"

/* Minimal Web Speech API typings (not in lib.dom). */
interface SpeechAlternativeLike {
  transcript: string
}
interface SpeechResultLike {
  isFinal: boolean
  0: SpeechAlternativeLike
}
interface SpeechResultEventLike {
  results: { length: number; [i: number]: SpeechResultLike }
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechResultEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

interface LiveSession {
  rec: SpeechRecognitionLike
  /** Finalized text from earlier auto-restarted sessions. */
  committed: string
  /** Finalized + interim text of the current session. */
  sessionFinal: string
  sessionInterim: string
  failed: boolean
  /** Set when the user pressed stop (don't auto-restart). */
  stopping: boolean
  onFullyEnded: (() => void) | null
}

function liveText(l: LiveSession): string {
  return [l.committed, l.sessionFinal, l.sessionInterim].join(" ").replace(/\s+/g, " ").trim()
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null
}

/**
 * Push-to-talk recorder with two transcription paths:
 *
 * 1. Fast path — browser-native Web Speech API streams the transcript live
 *    while the user is speaking, so releasing the mic is instant.
 * 2. Fallback — MediaRecorder audio is converted to 16k WAV and sent to
 *    /api/agents/speaking/transcribe (DashScope) when live recognition is
 *    unavailable, errored, or heard nothing.
 */
export function useRecorder(onTranscript: (text: string) => void) {
  const [state, setState] = useState<RecorderState>("idle")
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const liveRef = useRef<LiveSession | null>(null)

  const startLive = useCallback(() => {
    liveRef.current = null
    const Ctor = getRecognitionCtor()
    if (!Ctor) return
    try {
      const rec = new Ctor()
      const live: LiveSession = {
        rec,
        committed: "",
        sessionFinal: "",
        sessionInterim: "",
        failed: false,
        stopping: false,
        onFullyEnded: null,
      }
      rec.lang = "en-US"
      rec.continuous = true
      rec.interimResults = true
      rec.onresult = (e) => {
        let fin = ""
        let interim = ""
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i]
          if (r.isFinal) fin += r[0].transcript + " "
          else interim += r[0].transcript
        }
        live.sessionFinal = fin.trim()
        live.sessionInterim = interim.trim()
        // Live captions: show words as they are spoken
        onTranscript(liveText(live))
      }
      rec.onerror = () => {
        live.failed = true
      }
      rec.onend = () => {
        // Chrome ends sessions after silence; restart while still recording.
        live.committed = [live.committed, live.sessionFinal].join(" ").trim()
        live.sessionFinal = ""
        live.sessionInterim = ""
        if (!live.stopping && !live.failed) {
          try {
            rec.start()
            return
          } catch {
            /* fall through to fully-ended */
          }
        }
        live.onFullyEnded?.()
      }
      rec.start()
      liveRef.current = live
    } catch {
      liveRef.current = null
    }
  }, [onTranscript])

  /** Stop live recognition and wait briefly for trailing final results. */
  const settleLive = useCallback(async (): Promise<string> => {
    const live = liveRef.current
    if (!live) return ""
    live.stopping = true
    const ended = new Promise<void>((resolve) => {
      live.onFullyEnded = resolve
    })
    try {
      live.rec.stop()
    } catch {
      /* already stopped */
    }
    await Promise.race([ended, new Promise((r) => setTimeout(r, 1200))])
    return live.failed ? "" : liveText(live)
  }, [])

  const start = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setState("transcribing")
        try {
          // Fast path: use the live transcript if we got one
          const text = await settleLive()
          if (text) {
            onTranscript(text)
            return
          }
          // Fallback: ship audio to the server-side ASR
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
          const audioBase64 = await blobToWav16kBase64(blob)
          const res = await fetch("/api/agents/speaking/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audioBase64, mime: "audio/wav" }),
          })
          if (!res.ok) throw new Error(`转写失败 (${res.status})`)
          const { text: asrText } = await res.json()
          if (!asrText?.trim()) {
            setError("没听清，请再说一次")
          } else {
            onTranscript(asrText.trim())
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "转写失败")
        } finally {
          liveRef.current = null
          setState("idle")
        }
      }
      recorderRef.current = recorder
      recorder.start()
      startLive()
      setState("recording")
    } catch {
      setError("麦克风不可用，请检查浏览器权限")
      setState("idle")
    }
  }, [onTranscript, startLive, settleLive])

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop()
    }
  }, [])

  return { state, error, start, stop, clearError: () => setError(null) }
}
